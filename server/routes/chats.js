import { Router } from 'express';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dbPool from '../config/db.js';
import { WEBHOOK_SECRET, BOT_TOKEN, JWT_SECRET } from '../config/env.js';
import { tgSend, tgSendMedia, tgSendMediaGroup } from '../services/telegram.js';
import { uploadToS3, downloadBuffer } from '../services/s3.js';

function verifyWebhook(req) {
  if (!WEBHOOK_SECRET) return false;
  const sig = req.headers['x-webhook-signature'];
  if (!sig) return false;
  try {
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

const router = Router();

async function markBlockedIfNeeded(userId, errorText) {
  if (errorText && (errorText.includes('blocked by the user') || errorText.includes('Forbidden'))) {
    try {
      await dbPool.query('UPDATE users SET banned = 1 WHERE user_id = ?', [userId]);
      console.log(`[blocked] User ${userId} marked as banned (blocked bot)`);
    } catch {}
  }
}

// ===================== MEDIA HELPERS =====================
const MEDIA_PREFIX = '__media__:';

function packMedia(media, caption = '') {
  return `${MEDIA_PREFIX}${JSON.stringify(media)}\n${caption}`;
}

function unpackMessage(row) {
  const msg = { id: row.id, from: row.from, text: row.text || '', time: row.time };
  if (msg.text.startsWith(MEDIA_PREFIX)) {
    const nlIdx = msg.text.indexOf('\n');
    const jsonStr = nlIdx > 0 ? msg.text.slice(MEDIA_PREFIX.length, nlIdx) : msg.text.slice(MEDIA_PREFIX.length);
    try {
      msg.media = JSON.parse(jsonStr);
      msg.text = nlIdx > 0 ? msg.text.slice(nlIdx + 1) : '';
    } catch { /* keep as text */ }
  }
  return msg;
}

// ===================== SSE =====================

const sseClients = new Set();

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { client.write(data); } catch { sseClients.delete(client); }
  }
}

// SSE stream — exported separately, mounted before JWT middleware (EventSource can't send headers)
export const streamRouter = Router();
streamRouter.get('/', (req, res) => {
  // Validate JWT token from query param
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');
  sseClients.add(res);

  // Heartbeat каждые 30 секунд чтобы обнаруживать мёртвые соединения
  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { /* connection dead */ }
  }, 30_000);

  // Принудительное закрытие через 5 минут для предотвращения memory leak
  const timeout = setTimeout(() => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    try { res.end(); } catch { /* already closed */ }
  }, 300_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    sseClients.delete(res);
  });
});

// ===================== WEBHOOK (отдельный роутер, без JWT) =====================

async function handleWebhook(req, res, next) {
  if (!verifyWebhook(req)) {
    return res.status(403).json({ error: 'Invalid webhook secret or signature' });
  }

  try {
    const { user_id, text, username, full_name, media, photo, document: doc, video, voice, audio, sticker } = req.body;
    console.log('[webhook] body keys:', Object.keys(req.body), 'user_id:', user_id, 'hasMedia:', !!media, 'hasPhoto:', !!photo, 'hasDoc:', !!doc, 'hasVideo:', !!video);
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    // Находим или создаём чат (upsert to avoid race condition)
    await dbPool.query(
      'INSERT INTO wl_admin_chats (user_id) VALUES (?) ON DUPLICATE KEY UPDATE id = id', [user_id]
    );
    const [chatRows] = await dbPool.query(
      'SELECT id FROM wl_admin_chats WHERE user_id = ? LIMIT 1', [user_id]
    );
    const chatId = chatRows[0].id;

    // Обработка медиа от бота — поддержка разных форматов
    // media: массив (альбом) ИЛИ photo/document/video/voice/audio (одиночное)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    async function downloadAndUpload(src) {
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${src.file_id}`);
      const fileData = await fileRes.json();
      if (!fileData.ok) return null;
      const filePath = fileData.result.file_path;
      if (fileData.result.file_size && fileData.result.file_size > MAX_FILE_SIZE) {
        console.warn(`[webhook] File too large (${fileData.result.file_size} bytes), skipping`);
        return null;
      }
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
      const headRes = await fetch(fileUrl, { method: 'HEAD' });
      const contentLength = Number(headRes.headers.get('content-length'));
      if (contentLength && contentLength > MAX_FILE_SIZE) {
        console.warn(`[webhook] File too large (${contentLength} bytes), skipping`);
        return null;
      }
      const originalName = src.file_name || path.basename(filePath);
      const mimeType = src.mime_type || (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') ? 'image/jpeg' : filePath.endsWith('.png') ? 'image/png' : 'application/octet-stream');
      const buffer = await downloadBuffer(fileUrl);
      const { key, url } = await uploadToS3(buffer, originalName, mimeType);
      console.log('[webhook] Media uploaded to S3:', key);
      return { filename: key, originalName, mimeType, url };
    }

    let mediaObj = null;
    const mediaSources = Array.isArray(media) ? media : null;
    const singleSource = !mediaSources ? (photo || doc || video || voice || audio || sticker || null) : null;

    if (mediaSources && mediaSources.length) {
      // Альбом: скачиваем все файлы параллельно
      console.log('[webhook] Album with', mediaSources.length, 'items');
      const results = await Promise.all(mediaSources.map(async (src) => {
        try { return await downloadAndUpload(src); } catch (e) {
          console.error('[webhook] Album item failed:', e.message); return null;
        }
      }));
      const uploaded = results.filter(Boolean);
      if (uploaded.length) mediaObj = uploaded.length === 1 ? uploaded[0] : uploaded;
    } else if (singleSource?.file_id) {
      // Одиночный файл
      try {
        console.log('[webhook] Single media, file_id:', singleSource.file_id);
        mediaObj = await downloadAndUpload(singleSource);
      } catch (e) {
        console.error('[webhook] Failed to download/upload media:', e.message);
      }
    }

    // Сохраняем сообщение
    const caption = text || '';
    const dbText = mediaObj ? packMedia(mediaObj, caption) : caption;
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_chat_messages (chat_id, sender, text) VALUES (?, ?, ?)',
      [chatId, 'user', dbText]
    );

    const newMsg = {
      id: result.insertId,
      from: 'user',
      text: caption,
      time: new Date().toISOString(),
    };
    if (mediaObj) newMsg.media = mediaObj;

    // SSE push
    broadcast({
      type: 'new_message',
      chatId,
      userId: user_id,
      username: username || '',
      fullName: full_name || '',
      message: newMsg,
    });

    res.json({ ok: true, chatId, messageId: result.insertId });
  } catch (err) { next(err); }
}

// Отдельный роутер для монтирования ДО JWT middleware
export const webhookRouter = Router();
webhookRouter.post('/', handleWebhook);

// ===================== CRUD =====================

// GET /api/chats
router.get('/', async (req, res, next) => {
  try {
    const [chats] = await dbPool.query(`
      SELECT c.id, c.user_id AS userId, c.created_at,
        u.full_name AS fullName, u.username AS telegram,
        COALESCE(u.banned, 0) AS banned
      FROM wl_admin_chats c
      LEFT JOIN users u ON u.user_id = c.user_id
      ORDER BY c.created_at DESC
    `);
    const chatIds = chats.map(c => c.id);

    let messagesMap = {};
    if (chatIds.length) {
      const [msgs] = await dbPool.query(
        'SELECT id, chat_id, sender AS `from`, text, created_at AS time FROM wl_admin_chat_messages WHERE chat_id IN (?) ORDER BY created_at ASC',
        [chatIds]
      );
      for (const m of msgs) {
        if (!messagesMap[m.chat_id]) messagesMap[m.chat_id] = [];
        messagesMap[m.chat_id].push(unpackMessage(m));
      }
    }

    res.json(chats.map(c => ({
      id: c.id,
      userId: c.userId,
      fullName: c.fullName || null,
      telegram: c.telegram || null,
      banned: !!c.banned,
      messages: messagesMap[c.id] || [],
    })));
  } catch (err) { next(err); }
});

// GET /api/chats/by-user/:userId
router.get('/by-user/:userId', async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);

    // Находим или создаём чат
    const [existing] = await dbPool.query('SELECT id FROM wl_admin_chats WHERE user_id = ? LIMIT 1', [userId]);
    let chatIdResolved;
    if (existing.length) {
      chatIdResolved = existing[0].id;
    } else {
      const [ins] = await dbPool.query('INSERT INTO wl_admin_chats (user_id) VALUES (?)', [userId]);
      chatIdResolved = ins.insertId;
    }

    let [chats] = await dbPool.query('SELECT id, user_id AS userId FROM wl_admin_chats WHERE id = ?', [chatIdResolved]);

    let chat;
    if (!chats.length) {
      chat = { id: chatIdResolved, userId, messages: [] };
    } else {
      chat = { id: chats[0].id, userId: chats[0].userId };
      const [msgs] = await dbPool.query(
        'SELECT id, sender AS `from`, text, created_at AS time FROM wl_admin_chat_messages WHERE chat_id = ? ORDER BY created_at ASC',
        [chat.id]
      );
      chat.messages = msgs.map(m => unpackMessage(m));
    }

    res.json(chat);
  } catch (err) { next(err); }
});

// POST /api/chats/:id/messages — админ отправляет сообщение → Telegram
router.post('/:id/messages', async (req, res, next) => {
  try {
    const chatId = Number(req.params.id);
    const { text, media } = req.body;
    if (!text?.trim() && !media) return res.status(400).json({ error: 'Введите текст или прикрепите файл' });

    // Чат + user_id
    const [chats] = await dbPool.query('SELECT id, user_id FROM wl_admin_chats WHERE id = ?', [chatId]);
    if (!chats.length) return res.status(404).json({ error: 'Чат не найден' });

    const userId = chats[0].user_id;
    const caption = (text || '').trim();
    console.log('[chat send] chatId:', chatId, 'hasMedia:', !!media, 'hasText:', !!caption);
    if (media) console.log('[chat send] media:', JSON.stringify(media));

    // Формируем текст для БД
    const dbText = media ? packMedia(media, caption) : caption;

    // Сохраняем в БД
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_chat_messages (chat_id, sender, text) VALUES (?, ?, ?)',
      [chatId, 'admin', dbText]
    );

    const newMsg = {
      id: result.insertId,
      from: 'admin',
      text: caption,
      time: new Date().toISOString(),
    };
    if (media) newMsg.media = media;

    // Отправляем в Telegram
    let tgError = null;
    try {
      const mediaArr = Array.isArray(media) ? media : (media ? [media] : []);
      if (mediaArr.length > 1) {
        // Альбом: скачиваем все файлы и отправляем sendMediaGroup
        const items = [];
        for (const m of mediaArr) {
          if (!m.url) continue;
          const buffer = await downloadBuffer(m.url);
          items.push({ buffer, filename: m.originalName || 'file', mimeType: m.mimeType });
        }
        if (items.length > 1) {
          const tgResult = await tgSendMediaGroup(userId, items, caption);
          if (!tgResult.ok) tgError = tgResult.description || 'Telegram error';
        } else if (items.length === 1) {
          const tgResult = await tgSendMedia(userId, items[0], caption);
          if (!tgResult.ok) tgError = tgResult.description || 'Telegram error';
        }
      } else if (mediaArr.length === 1) {
        // Одиночный файл
        const m = mediaArr[0];
        if (m.url) {
          const buffer = await downloadBuffer(m.url);
          const tgResult = await tgSendMedia(userId, { buffer, filename: m.originalName || 'file', mimeType: m.mimeType }, caption);
          if (!tgResult.ok) tgError = tgResult.description || 'Telegram error';
        }
      } else {
        const tgResult = await tgSend(userId, caption);
        if (!tgResult.ok) tgError = tgResult.description || 'Telegram error';
      }
    } catch (err) {
      tgError = err.message;
    }

    if (tgError) {
      await markBlockedIfNeeded(userId, tgError);
    }

    // SSE push
    broadcast({
      type: 'new_message',
      chatId,
      userId,
      message: newMsg,
    });

    res.status(201).json({
      ...newMsg,
      tgError: tgError || undefined,
    });
  } catch (err) { next(err); }
});

// DELETE /api/chats/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await dbPool.query('DELETE FROM wl_admin_chats WHERE id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
