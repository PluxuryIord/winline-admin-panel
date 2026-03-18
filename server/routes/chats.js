import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbPool from '../config/db.js';
import { WEBHOOK_SECRET, BOT_TOKEN } from '../config/env.js';
import { tgSend, tgSendMedia } from '../services/telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const router = Router();

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

// GET /api/chats/stream — SSE поток
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ===================== WEBHOOK (отдельный роутер, без JWT) =====================

async function handleWebhook(req, res, next) {
  if (!WEBHOOK_SECRET || req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Invalid webhook secret' });
  }

  try {
    const { user_id, text, username, full_name, media } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    // Находим или создаём чат
    let [chats] = await dbPool.query('SELECT id FROM wl_admin_chats WHERE user_id = ?', [user_id]);
    let chatId;
    if (!chats.length) {
      const [result] = await dbPool.query('INSERT INTO wl_admin_chats (user_id) VALUES (?)', [user_id]);
      chatId = result.insertId;
    } else {
      chatId = chats[0].id;
    }

    // Обработка медиа от бота (если есть file_id)
    let mediaObj = null;
    if (media?.file_id) {
      try {
        // Скачать файл через Telegram API
        const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${media.file_id}`);
        const fileData = await fileRes.json();
        if (fileData.ok) {
          const filePath = fileData.result.file_path;
          const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
          const ext = path.extname(filePath) || (media.mime_type?.startsWith('image/') ? '.jpg' : '.bin');
          const localName = `tg_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
          const localPath = path.join(UPLOADS_DIR, localName);

          // Создать папку если нет
          if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

          const imgRes = await fetch(fileUrl);
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          fs.writeFileSync(localPath, buffer);

          mediaObj = {
            filename: localName,
            originalName: media.file_name || localName,
            mimeType: media.mime_type || 'application/octet-stream',
          };
        }
      } catch (e) {
        console.error('[webhook] Failed to download media:', e.message);
      }
    }

    // Сохраняем сообщение
    const caption = text || media?.caption || '';
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
    const [chats] = await dbPool.query('SELECT id, user_id AS userId, created_at FROM wl_admin_chats ORDER BY created_at DESC');
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
      messages: messagesMap[c.id] || [],
    })));
  } catch (err) { next(err); }
});

// GET /api/chats/by-user/:userId
router.get('/by-user/:userId', async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    let [chats] = await dbPool.query('SELECT id, user_id AS userId FROM wl_admin_chats WHERE user_id = ?', [userId]);

    let chat;
    if (!chats.length) {
      const [result] = await dbPool.query('INSERT INTO wl_admin_chats (user_id) VALUES (?)', [userId]);
      chat = { id: result.insertId, userId, messages: [] };
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
      let tgResult;
      if (media?.filename) {
        const filePath = path.join(UPLOADS_DIR, media.filename);
        tgResult = await tgSendMedia(userId, filePath, media.mimeType, caption);
      } else {
        tgResult = await tgSend(userId, caption);
      }
      if (!tgResult.ok) {
        tgError = tgResult.description || 'Telegram error';
      }
    } catch (err) {
      tgError = err.message;
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
