import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import dbPool from '../config/db.js';
import { BOT_TOKEN, WEBHOOK_SECRET } from '../config/env.js';
import { tgSend, tgSendMedia, tgSendPoll } from '../services/telegram.js';
import { uploadToS3, downloadBuffer } from '../services/s3.js';

const router = Router();

async function markBlockedIfNeeded(userId, errorText) {
  if (errorText && (errorText.includes('blocked by the user') || errorText.includes('Forbidden'))) {
    try {
      await dbPool.query('UPDATE users SET banned = 1 WHERE user_id = ?', [userId]);
      console.log(`[blocked] User ${userId} marked as banned (blocked bot)`);
    } catch {}
  }
}

function verifyBroadcastWebhook(req) {
  if (!WEBHOOK_SECRET) return false;
  const sig = req.headers['x-webhook-signature'];
  if (sig) {
    try {
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch { return false; }
  }
  return req.headers['x-webhook-secret'] === WEBHOOK_SECRET;
}

// ===================== WEBHOOK (без JWT) =====================

export const broadcastWebhookRouter = Router();
export const pollVoteRouter = Router();

broadcastWebhookRouter.post('/', async (req, res, next) => {
  if (!verifyBroadcastWebhook(req)) {
    return res.status(403).json({ error: 'Invalid webhook secret or signature' });
  }

  try {
    const { chat_id, title, chat_type, action } = req.body;
    if (!chat_id || !action) {
      return res.status(400).json({ error: 'chat_id and action are required' });
    }

    const isChannel = chat_type === 'channel';
    const table = isChannel ? 'wl_admin_channels' : 'wl_admin_groups';
    const chatIdStr = String(chat_id);

    if (action === 'added') {
      const [existing] = await dbPool.query(`SELECT id FROM ${table} WHERE chat_id = ?`, [chatIdStr]);
      if (existing.length) {
        await dbPool.query(`UPDATE ${table} SET title = ? WHERE chat_id = ?`, [title || chatIdStr, chatIdStr]);
      } else {
        await dbPool.query(`INSERT INTO ${table} (chat_id, title) VALUES (?, ?)`, [chatIdStr, title || chatIdStr]);
      }
      console.log(`[bot-membership] ${isChannel ? 'Channel' : 'Group'} added: ${chatIdStr} "${title}"`);
      res.json({ ok: true, action: 'added' });
    } else if (action === 'removed') {
      await dbPool.query(`DELETE FROM ${table} WHERE chat_id = ?`, [chatIdStr]);
      console.log(`[bot-membership] ${isChannel ? 'Channel' : 'Group'} removed: ${chatIdStr}`);
      res.json({ ok: true, action: 'removed' });
    } else {
      res.status(400).json({ error: 'action must be "added" or "removed"' });
    }
  } catch (err) {
    console.error('[bot-membership] ERROR:', err.message);
    next(err);
  }
});

// ===================== MULTER (memory) =====================

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

// ===================== ПРОВЕРКА СХЕМЫ =====================

let hasMediaColumn = null; // кэш
async function checkMediaColumn() {
  if (hasMediaColumn !== null) return hasMediaColumn;
  try {
    const [cols] = await dbPool.query("SHOW COLUMNS FROM wl_admin_broadcasts LIKE 'media_json'");
    hasMediaColumn = cols.length > 0;
  } catch {
    hasMediaColumn = false;
  }
  return hasMediaColumn;
}

// ===================== ХЕЛПЕРЫ =====================

function safeJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val; // mysql2 may auto-parse JSON columns
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [val];
  }
}

function safeJsonParse(val, fallback = []) {
  if (!val && val !== 0) return fallback;
  if (typeof val === 'object') return val; // mysql2 may auto-parse JSON columns
  try { return JSON.parse(val); } catch { return fallback; }
}

/** Создать опрос в БД и вернуть poll_id (для инлайн-кнопок в ЛС) */
async function createPoll(poll) {
  const [result] = await dbPool.query(
    'INSERT INTO wl_admin_polls (question, options_json, type, correct_index) VALUES (?, ?, ?, ?)',
    [poll.question, JSON.stringify(poll.options), poll.type || 'regular', poll.type === 'quiz' ? (poll.correctIndex ?? null) : null]
  );
  return result.insertId;
}

/** Построить текст + inline-кнопки для опроса (ЛС пользователям) */
function buildPollMessage(poll, pollId) {
  const isQuiz = poll.type === 'quiz';
  const emoji = isQuiz ? '🧠' : '📊';
  const label = isQuiz ? 'Викторина' : 'Опрос';
  let text = `${emoji} <b>${label}</b>\n\n${poll.question}\n`;
  const keyboard = poll.options.map((opt, i) => ([{
    text: opt,
    callback_data: `poll_vote:${pollId}:${i}`,
  }]));
  return { text, keyboard };
}

/** Отправить inline-опрос в ЛС (с retry) */
async function sendInlinePoll(chatId, poll, pollId, attempt = 0) {
  const { text, keyboard } = buildPollMessage(poll, pollId);
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
  };
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (data.parameters?.retry_after && attempt < 3) {
      await new Promise(ok => setTimeout(ok, (data.parameters.retry_after + 1) * 1000));
      return sendInlinePoll(chatId, poll, pollId, attempt + 1);
    }
    return data;
  } catch (err) {
    if (attempt < 3) {
      await new Promise(ok => setTimeout(ok, 2000));
      return sendInlinePoll(chatId, poll, pollId, attempt + 1);
    }
    return { ok: false, description: err.message };
  }
}

/** Отправить нативный Telegram опрос (каналы/группы) */
async function sendNativePoll(chatId, poll, targetType, attempt = 0) {
  const isChannel = targetType === 'channels';
  const body = {
    chat_id: chatId,
    question: poll.question,
    options: JSON.stringify(poll.options.map(o => typeof o === 'string' ? { text: o } : o)),
    is_anonymous: isChannel,
    type: poll.type === 'quiz' ? 'quiz' : 'regular',
  };
  if (poll.type === 'quiz' && poll.correctIndex != null) {
    body.correct_option_id = poll.correctIndex;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPoll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (data.parameters?.retry_after && attempt < 3) {
      await new Promise(ok => setTimeout(ok, (data.parameters.retry_after + 1) * 1000));
      return sendNativePoll(chatId, poll, targetType, attempt + 1);
    }
    return data;
  } catch (err) {
    if (attempt < 3) {
      await new Promise(ok => setTimeout(ok, 2000));
      return sendNativePoll(chatId, poll, targetType, attempt + 1);
    }
    return { ok: false, description: err.message };
  }
}

/** Отправить сообщение (текст/медиа/опрос) одному chatId */
async function sendToChat(chatId, text, media, poll, targetType, pollId) {
  if (poll) {
    if (targetType === 'users' && pollId) {
      return sendInlinePoll(chatId, poll, pollId);
    }
    return sendNativePoll(chatId, poll, targetType || 'channels');
  }
  if (media?.url) {
    const buffer = await downloadBuffer(media.url);
    return tgSendMedia(chatId, { buffer, filename: media.originalName || 'file', mimeType: media.mimeType }, text || '');
  }
  return tgSend(chatId, text);
}

// ===================== ЗАГРУЗКА ФАЙЛОВ =====================

// POST /api/broadcasts/upload
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    console.log('[upload] file:', req.file?.originalname, req.file?.mimetype, req.file?.size, 'bytes');
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const { key, url } = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);
    console.log('[upload] S3 ok:', key, url);
    res.json({
      filename: key,
      url,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    console.error('[upload] ERROR:', err.message);
    next(err);
  }
});

// ===================== КАНАЛЫ =====================

router.get('/channels', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT id, chat_id AS chatId, title, added_at AS addedAt FROM wl_admin_channels ORDER BY id ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/channels', async (req, res, next) => {
  try {
    const { chatId, title } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    const [existing] = await dbPool.query('SELECT id FROM wl_admin_channels WHERE chat_id = ?', [String(chatId)]);
    if (existing.length) return res.status(409).json({ error: 'Канал уже добавлен' });
    const [result] = await dbPool.query('INSERT INTO wl_admin_channels (chat_id, title) VALUES (?, ?)', [String(chatId), title || chatId]);
    res.status(201).json({ id: result.insertId, chatId: String(chatId), title: title || chatId, addedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// Archive channel (move to archive table instead of delete)
router.post('/channels/:id/archive', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await dbPool.query('SELECT chat_id, title, added_at FROM wl_admin_channels WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    // Ensure archive table
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_channels_archive (
      id INT AUTO_INCREMENT PRIMARY KEY, chat_id VARCHAR(100), title VARCHAR(500),
      added_at DATETIME, archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await dbPool.query('INSERT INTO wl_admin_channels_archive (chat_id, title, added_at) VALUES (?, ?, ?)',
      [rows[0].chat_id, rows[0].title, rows[0].added_at]);
    await dbPool.query('DELETE FROM wl_admin_channels WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Restore channel from archive
router.post('/channels/restore/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await dbPool.query('SELECT chat_id, title FROM wl_admin_channels_archive WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const [existing] = await dbPool.query('SELECT id FROM wl_admin_channels WHERE chat_id = ?', [rows[0].chat_id]);
    if (!existing.length) {
      await dbPool.query('INSERT INTO wl_admin_channels (chat_id, title) VALUES (?, ?)', [rows[0].chat_id, rows[0].title]);
    }
    await dbPool.query('DELETE FROM wl_admin_channels_archive WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Get archived channels
router.get('/channels/archive', async (req, res, next) => {
  try {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_channels_archive (
      id INT AUTO_INCREMENT PRIMARY KEY, chat_id VARCHAR(100), title VARCHAR(500),
      added_at DATETIME, archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [rows] = await dbPool.query('SELECT id, chat_id AS chatId, title, archived_at AS archivedAt FROM wl_admin_channels_archive ORDER BY archived_at DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

// Legacy delete (keep for backward compat but shouldn't be used)
router.delete('/channels/:id', async (req, res, next) => {
  try {
    const [result] = await dbPool.query('DELETE FROM wl_admin_channels WHERE id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ===================== ГРУППЫ =====================

router.get('/groups', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT id, chat_id AS chatId, title, added_at AS addedAt FROM wl_admin_groups ORDER BY id ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/groups', async (req, res, next) => {
  try {
    const { chatId, title } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    const [existing] = await dbPool.query('SELECT id FROM wl_admin_groups WHERE chat_id = ?', [String(chatId)]);
    if (existing.length) return res.status(409).json({ error: 'Группа уже добавлена' });
    const [result] = await dbPool.query('INSERT INTO wl_admin_groups (chat_id, title) VALUES (?, ?)', [String(chatId), title || chatId]);
    res.status(201).json({ id: result.insertId, chatId: String(chatId), title: title || chatId, addedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// Archive group
router.post('/groups/:id/archive', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await dbPool.query('SELECT chat_id, title, added_at FROM wl_admin_groups WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_groups_archive (
      id INT AUTO_INCREMENT PRIMARY KEY, chat_id VARCHAR(100), title VARCHAR(500),
      added_at DATETIME, archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await dbPool.query('INSERT INTO wl_admin_groups_archive (chat_id, title, added_at) VALUES (?, ?, ?)',
      [rows[0].chat_id, rows[0].title, rows[0].added_at]);
    await dbPool.query('DELETE FROM wl_admin_groups WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Restore group from archive
router.post('/groups/restore/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await dbPool.query('SELECT chat_id, title FROM wl_admin_groups_archive WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const [existing] = await dbPool.query('SELECT id FROM wl_admin_groups WHERE chat_id = ?', [rows[0].chat_id]);
    if (!existing.length) {
      await dbPool.query('INSERT INTO wl_admin_groups (chat_id, title) VALUES (?, ?)', [rows[0].chat_id, rows[0].title]);
    }
    await dbPool.query('DELETE FROM wl_admin_groups_archive WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Get archived groups
router.get('/groups/archive', async (req, res, next) => {
  try {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_groups_archive (
      id INT AUTO_INCREMENT PRIMARY KEY, chat_id VARCHAR(100), title VARCHAR(500),
      added_at DATETIME, archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [rows] = await dbPool.query('SELECT id, chat_id AS chatId, title, archived_at AS archivedAt FROM wl_admin_groups_archive ORDER BY archived_at DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

// Legacy delete
router.delete('/groups/:id', async (req, res, next) => {
  try {
    const [result] = await dbPool.query('DELETE FROM wl_admin_groups WHERE id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/broadcasts/groups/send
router.post('/groups/send', async (req, res, next) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен' });
  try {
    const { text, groupIds, media, poll } = req.body;
    console.log('[broadcasts POST /groups/send] body keys:', Object.keys(req.body), 'poll:', !!poll, 'text:', !!text?.trim(), 'media:', !!media);
    if (!text?.trim() && !media && !poll) return res.status(400).json({ error: 'Введите текст, прикрепите файл или создайте опрос' });
    if (!groupIds?.length) return res.status(400).json({ error: 'Выберите хотя бы одну группу' });

    const results = [];
    for (const chatId of groupIds) {
      try {
        const data = await sendToChat(chatId, text?.trim() || '', media, poll, 'groups');
        results.push({ chatId, ok: data.ok, error: data.description || null });
      } catch (err) {
        results.push({ chatId, ok: false, error: err.message });
      }
    }

    const success = results.filter(r => r.ok).length;
    const [groups] = await dbPool.query('SELECT chat_id, title FROM wl_admin_groups WHERE chat_id IN (?)', [groupIds.map(String)]);
    const groupNames = groupIds.map(id => {
      const g = groups.find(gr => String(gr.chat_id) === String(id));
      return g?.title || id;
    });

    const record = await saveBroadcast({
      text: poll ? `[${poll.type === 'quiz' ? 'Викторина' : 'Опрос'}] ${poll.question}` : (text || '').trim(), type: 'groups', channels: groupNames, channelIds: groupIds,
      total: groupIds.length, success, failed: groupIds.length - success, results, media,
    });

    res.json(record);
  } catch (err) { next(err); }
});

// ===================== РАССЫЛКИ (ИСТОРИЯ) =====================

router.get('/', async (req, res, next) => {
  try {
    const withMedia = await checkMediaColumn();
    const cols = 'id, text, type, channels_json, channel_ids_json, total, success, failed, results_json, ' +
      (withMedia ? 'media_json, ' : '') + 'status, created_at AS date';
    const [rows] = await dbPool.query(`SELECT ${cols} FROM wl_admin_broadcasts ORDER BY created_at DESC LIMIT 200`);

    // Get poll ids linked to broadcasts (for inline polls stats)
    const broadcastIds = rows.map(r => r.id);
    let pollMap = {};
    if (broadcastIds.length) {
      try {
        const [polls] = await dbPool.query(
          `SELECT id, broadcast_id FROM wl_admin_polls WHERE broadcast_id IN (${broadcastIds.map(() => '?').join(',')})`,
          broadcastIds
        );
        for (const p of polls) { pollMap[p.broadcast_id] = p.id; }
      } catch {}
    }

    const history = rows.map(r => ({
      id: r.id,
      text: r.text,
      type: r.type || 'channels',
      channels: safeJsonArray(r.channels_json),
      channelIds: safeJsonArray(r.channel_ids_json),
      total: r.total,
      success: r.success,
      failed: r.failed,
      results: safeJsonParse(r.results_json, []),
      media: withMedia ? safeJsonParse(r.media_json, null) : null,
      pollId: pollMap[r.id] || null,
      date: r.date,
      status: r.status,
    }));

    // Also fetch pending scheduled broadcasts
    const [scheduled] = await dbPool.query(
      `SELECT s.id AS schedule_id, s.scheduled_at, d.name, d.text, d.media_json, d.poll_json, d.target_type, d.target_filter
       FROM wl_admin_scheduled_broadcasts s
       JOIN wl_admin_broadcast_drafts d ON d.id = s.draft_id
       WHERE s.status = 'pending'
       ORDER BY s.scheduled_at ASC`
    );
    const scheduledItems = scheduled.map(s => ({
      id: `sched_${s.schedule_id}`,
      scheduleId: s.schedule_id,
      text: s.text || (s.poll_json ? `[Опрос] ${safeJsonParse(s.poll_json, {}).question || ''}` : s.name),
      type: s.target_type || 'channels',
      channels: [],
      total: 0, success: 0, failed: 0, results: [],
      media: safeJsonParse(s.media_json, null),
      date: s.scheduled_at,
      status: 'scheduled',
    }));

    res.json([...scheduledItems, ...history]);
  } catch (err) { next(err); }
});

// POST /api/broadcasts — отправить в каналы
router.post('/', async (req, res, next) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен' });
  const conn = await dbPool.getConnection();
  try {
    const { text, channelIds, media, poll } = req.body;
    console.log('[broadcasts POST /] body keys:', Object.keys(req.body), 'poll:', !!poll, 'text:', !!text?.trim(), 'media:', !!media);
    if (!text?.trim() && !media && !poll) { conn.release(); return res.status(400).json({ error: 'Введите текст, прикрепите файл или создайте опрос' }); }
    if (!channelIds?.length) { conn.release(); return res.status(400).json({ error: 'Выберите хотя бы один канал' }); }

    await conn.beginTransaction();

    const results = [];
    for (const chatId of channelIds) {
      try {
        const data = await sendToChat(chatId, text?.trim() || '', media, poll, 'channels');
        results.push({ chatId, ok: data.ok, error: data.description || null });
      } catch (err) {
        results.push({ chatId, ok: false, error: err.message });
      }
    }

    const success = results.filter(r => r.ok).length;
    const [channels] = await conn.query('SELECT chat_id, title FROM wl_admin_channels WHERE chat_id IN (?)', [channelIds.map(String)]);
    const channelNames = channelIds.map(id => {
      const ch = channels.find(c => String(c.chat_id) === String(id));
      return ch?.title || id;
    });

    const broadcastText = poll ? `[${poll.type === 'quiz' ? 'Викторина' : 'Опрос'}] ${poll.question}` : (text || '').trim();

    const record = await saveBroadcast({
      text: broadcastText, type: 'channels', channels: channelNames, channelIds,
      total: channelIds.length, success, failed: channelIds.length - success, results, media,
    }, conn);

    await conn.commit();
    res.json(record);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await dbPool.query('DELETE FROM wl_admin_broadcasts WHERE id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ===================== РАССЫЛКА ПОЛЬЗОВАТЕЛЯМ =====================

router.post('/users', async (req, res, next) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен' });
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const { text, filters, media, poll } = req.body;
    console.log('[broadcasts POST /users] body keys:', Object.keys(req.body), 'poll:', !!poll, 'text:', !!text?.trim(), 'media:', !!media);
    if (!text?.trim() && !media && !poll) return res.status(400).json({ error: 'Введите текст, прикрепите файл или создайте опрос' });

    let where = ['u.user_id IS NOT NULL'];
    const params = [];
    let joins = '';
    if (filters) {
      // Support both filters.tags (array) and legacy filters.tag (string)
      const tagsArr = Array.isArray(filters.tags) ? filters.tags : (filters.tag && filters.tag !== 'all' ? [filters.tag] : []);
      if (tagsArr.length > 0) {
        joins += ` INNER JOIN wl_admin_user_tags t ON t.user_id = u.user_id AND t.tag IN (${tagsArr.map(() => '?').join(',')})`;
        params.push(...tagsArr);
      }
    }

    const [rows] = await dbPool.query(`SELECT DISTINCT u.user_id, u.full_name, u.username FROM users u${joins} WHERE ${where.join(' AND ')}`, params);
    if (!rows.length) {
      return res.json({ success: 0, total: 0, failed: 0, results: [], status: 'failed', error: 'Нет пользователей по заданным фильтрам' });
    }

    const results = [];
    let successCount = 0;

    // Prepare broadcast message text for chat storage
    const MEDIA_PREFIX = '__media__:';
    let chatMessageText = '';
    if (poll) {
      chatMessageText = `[${poll.type === 'quiz' ? 'Викторина' : 'Опрос'}] ${poll.question}`;
    } else if (media) {
      chatMessageText = `${MEDIA_PREFIX}${JSON.stringify(media)}\n${text?.trim() || ''}`;
    } else {
      chatMessageText = text?.trim() || '';
    }

    let pollId = null;
    if (poll) pollId = await createPoll(poll);

    for (const row of rows) {
      try {
        const data = await sendToChat(row.user_id, text?.trim() || '', media, poll, 'users', pollId);
        results.push({ chatId: row.user_id, name: row.full_name || '', username: row.username || '', ok: data.ok, error: data.description || null });
        if (!data.ok) {
          await markBlockedIfNeeded(row.user_id, data.description || '');
        }
        if (data.ok) {
          successCount++;
          // Save broadcast message to user's chat
          try {
            // Find existing chat or create new one
            const [existingChats] = await dbPool.query(
              'SELECT id FROM wl_admin_chats WHERE user_id = ? LIMIT 1',
              [row.user_id]
            );
            let userChatId;
            if (existingChats.length) {
              userChatId = existingChats[0].id;
            } else {
              const [insertResult] = await dbPool.query(
                'INSERT INTO wl_admin_chats (user_id) VALUES (?)',
                [row.user_id]
              );
              userChatId = insertResult.insertId;
            }
            if (userChatId) {
              await dbPool.query(
                'INSERT INTO wl_admin_chat_messages (chat_id, sender, text) VALUES (?, ?, ?)',
                [userChatId, 'admin', chatMessageText]
              );
            }
          } catch (chatErr) {
            console.warn(`[broadcasts] Failed to save to chat for user ${row.user_id}:`, chatErr.message);
          }
        }
      } catch (err) {
        results.push({ chatId: row.user_id, name: row.full_name || '', username: row.username || '', ok: false, error: err.message });
        await markBlockedIfNeeded(row.user_id, err.message);
      }
    }

    // Limit results to avoid exceeding DB column size
    const truncatedResults = results.slice(0, 100);

    let record;
    try {
      record = await saveBroadcast({
        text: poll ? `[${poll.type === 'quiz' ? 'Викторина' : 'Опрос'}] ${poll.question}` : (text || '').trim(), type: 'users', channels: [`Пользователи (${rows.length})`], channelIds: [],
        total: rows.length, success: successCount, failed: rows.length - successCount, results: truncatedResults, media, pollId,
      });
    } catch (saveErr) {
      console.error('[broadcasts] saveBroadcast failed:', saveErr.message);
      record = {
        text: (text || '').substring(0, 200), type: 'users', channels: [`Пользователи (${rows.length})`],
        total: rows.length, success: successCount, failed: rows.length - successCount,
        date: new Date().toISOString(), status: successCount === rows.length ? 'published' : 'partial',
      };
    }

    res.json(record);
  } catch (err) { next(err); }
});

router.get('/users/count', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    let where = ['u.user_id IS NOT NULL'];
    const params = [];
    let joins = '';
    // Support comma-separated tags (OR logic — user with ANY of the selected tags)
    const tagsParam = req.query.tags?.trim() || req.query.tag?.trim();
    if (tagsParam && tagsParam !== 'all') {
      const tagsArr = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tagsArr.length > 0) {
        joins += ` INNER JOIN wl_admin_user_tags t ON t.user_id = u.user_id AND t.tag IN (${tagsArr.map(() => '?').join(',')})`;
        params.push(...tagsArr);
      }
    }
    const [[{ count }]] = await dbPool.query(`SELECT COUNT(DISTINCT u.user_id) as count FROM users u${joins} WHERE ${where.join(' AND ')}`, params);
    res.json({ count });
  } catch (err) { next(err); }
});

router.get('/users/list', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    let where = ['u.user_id IS NOT NULL'];
    const params = [];
    let joins = '';
    const tagsParam = req.query.tags?.trim() || req.query.tag?.trim();
    if (tagsParam && tagsParam !== 'all') {
      const tagsArr = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tagsArr.length > 0) {
        joins += ` INNER JOIN wl_admin_user_tags t ON t.user_id = u.user_id AND t.tag IN (${tagsArr.map(() => '?').join(',')})`;
        params.push(...tagsArr);
      }
    }
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
    params.push(limit, offset);
    const [rows] = await dbPool.query(
      `SELECT DISTINCT u.user_id, u.full_name, u.username FROM users u${joins} WHERE ${where.join(' AND ')} LIMIT ? OFFSET ?`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/users/tags', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const [rows] = await dbPool.query("SELECT DISTINCT tag FROM wl_admin_user_tags WHERE tag != '__edited__'");
    res.json(rows.map(r => r.tag).sort());
  } catch (err) { next(err); }
});

// ===================== ТЕГИ КАНАЛОВ/ГРУПП =====================

// Ensure channel tags table exists
(async () => {
  try {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_channel_tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      chat_id VARCHAR(100) NOT NULL,
      tag VARCHAR(255) NOT NULL,
      UNIQUE KEY uq_chat_tag (chat_id, tag)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('[channel-tags] Failed to create table:', err.message);
  }
})();

// Get tags for a specific channel/group
router.get('/channels/:chatId/tags', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      'SELECT tag FROM wl_admin_channel_tags WHERE chat_id = ? ORDER BY tag',
      [String(req.params.chatId)]
    );
    res.json(rows.map(r => r.tag));
  } catch (err) { next(err); }
});

// Save tags for a specific channel/group (replace all)
router.put('/channels/:chatId/tags', async (req, res, next) => {
  try {
    const chatId = String(req.params.chatId);
    const tags = Array.isArray(req.body.tags) ? req.body.tags.filter(t => t && typeof t === 'string') : [];
    await dbPool.query('DELETE FROM wl_admin_channel_tags WHERE chat_id = ?', [chatId]);
    if (tags.length > 0) {
      const values = tags.map(t => [chatId, t.trim()]);
      await dbPool.query('INSERT IGNORE INTO wl_admin_channel_tags (chat_id, tag) VALUES ?', [values]);
    }
    res.json({ ok: true, tags });
  } catch (err) { next(err); }
});

// Get all unique channel tags (only for existing channels)
router.get('/channel-tags', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      `SELECT DISTINCT t.tag FROM wl_admin_channel_tags t
       INNER JOIN wl_admin_channels c ON c.chat_id = t.chat_id
       ORDER BY t.tag`
    );
    res.json(rows.map(r => r.tag));
  } catch (err) { next(err); }
});

// ── Group tags (separate from channel tags) ──

(async () => {
  try {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_group_tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      chat_id VARCHAR(100) NOT NULL,
      tag VARCHAR(255) NOT NULL,
      UNIQUE KEY uq_chat_tag (chat_id, tag)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (err) {
    console.error('[group-tags] Failed to create table:', err.message);
  }
})();

router.get('/groups/:chatId/tags', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      'SELECT tag FROM wl_admin_group_tags WHERE chat_id = ? ORDER BY tag',
      [String(req.params.chatId)]
    );
    res.json(rows.map(r => r.tag));
  } catch (err) { next(err); }
});

router.put('/groups/:chatId/tags', async (req, res, next) => {
  try {
    const chatId = String(req.params.chatId);
    const tags = Array.isArray(req.body.tags) ? req.body.tags.filter(t => t && typeof t === 'string') : [];
    await dbPool.query('DELETE FROM wl_admin_group_tags WHERE chat_id = ?', [chatId]);
    if (tags.length > 0) {
      const values = tags.map(t => [chatId, t.trim()]);
      await dbPool.query('INSERT IGNORE INTO wl_admin_group_tags (chat_id, tag) VALUES ?', [values]);
    }
    res.json({ ok: true, tags });
  } catch (err) { next(err); }
});

router.get('/group-tags', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      `SELECT DISTINCT t.tag FROM wl_admin_group_tags t
       INNER JOIN wl_admin_groups g ON g.chat_id = t.chat_id
       ORDER BY t.tag`
    );
    res.json(rows.map(r => r.tag));
  } catch (err) { next(err); }
});

// ===================== ЧЕРНОВИКИ И ЗАПЛАНИРОВАННЫЕ =====================

// Ensure drafts & scheduled tables exist
(async () => {
  try {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_broadcast_drafts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) DEFAULT 'Без названия',
      text TEXT,
      media_json TEXT,
      poll_json TEXT,
      target_type ENUM('channels','groups','users') DEFAULT 'channels',
      target_filter JSON,
      scheduled_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_scheduled_broadcasts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      draft_id INT,
      scheduled_at DATETIME NOT NULL,
      status ENUM('pending','sent','cancelled') DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_status_scheduled (status, scheduled_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // Inline poll system (replaces native Telegram polls)
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_polls (
      id INT AUTO_INCREMENT PRIMARY KEY,
      broadcast_id INT,
      question VARCHAR(500) NOT NULL,
      options_json JSON NOT NULL,
      type ENUM('regular','quiz') DEFAULT 'regular',
      correct_index INT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_admin_poll_votes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      poll_id INT NOT NULL,
      user_id BIGINT NOT NULL,
      option_index INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_vote (poll_id, user_id),
      INDEX idx_poll (poll_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  } catch (err) {
    console.error('[drafts] Failed to create tables:', err.message);
  }
})();

// GET /api/broadcasts/drafts — список черновиков
router.get('/drafts', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      `SELECT d.*, s.id AS schedule_id, s.scheduled_at AS schedule_time, s.status AS schedule_status
       FROM wl_admin_broadcast_drafts d
       LEFT JOIN wl_admin_scheduled_broadcasts s ON s.draft_id = d.id AND s.status = 'pending'
       ORDER BY d.updated_at DESC`
    );
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      text: r.text,
      media: safeJsonParse(r.media_json, null),
      poll: safeJsonParse(r.poll_json, null),
      targetType: r.target_type,
      targetFilter: safeJsonParse(r.target_filter, null),
      scheduledAt: r.schedule_time || r.scheduled_at || null,
      scheduleId: r.schedule_id || null,
      scheduleStatus: r.schedule_status || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  } catch (err) { next(err); }
});

// POST /api/broadcasts/drafts — создать черновик
router.post('/drafts', async (req, res, next) => {
  try {
    const { name, text, media, poll, targetType, targetFilter } = req.body;
    const [result] = await dbPool.query(
      `INSERT INTO wl_admin_broadcast_drafts (name, text, media_json, poll_json, target_type, target_filter)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name || 'Без названия',
        text || null,
        media ? JSON.stringify(media) : null,
        poll ? JSON.stringify(poll) : null,
        targetType || 'channels',
        targetFilter ? JSON.stringify(targetFilter) : null,
      ]
    );
    res.status(201).json({ id: result.insertId, name: name || 'Без названия' });
  } catch (err) { next(err); }
});

// PUT /api/broadcasts/drafts/:id — обновить черновик
router.put('/drafts/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, text, media, poll, targetType, targetFilter } = req.body;
    const [result] = await dbPool.query(
      `UPDATE wl_admin_broadcast_drafts SET name = ?, text = ?, media_json = ?, poll_json = ?, target_type = ?, target_filter = ?
       WHERE id = ?`,
      [
        name || 'Без названия',
        text || null,
        media ? JSON.stringify(media) : null,
        poll ? JSON.stringify(poll) : null,
        targetType || 'channels',
        targetFilter ? JSON.stringify(targetFilter) : null,
        id,
      ]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/broadcasts/drafts/:id — удалить черновик
router.delete('/drafts/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // Also cancel any pending schedules
    await dbPool.query(`UPDATE wl_admin_scheduled_broadcasts SET status = 'cancelled' WHERE draft_id = ? AND status = 'pending'`, [id]);
    const [result] = await dbPool.query('DELETE FROM wl_admin_broadcast_drafts WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/broadcasts/drafts/:id/send — отправить черновик
router.post('/drafts/:id/send', async (req, res, next) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен' });
  try {
    const id = Number(req.params.id);
    const [rows] = await dbPool.query('SELECT * FROM wl_admin_broadcast_drafts WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Черновик не найден' });
    const draft = rows[0];
    const text = draft.text || '';
    const media = safeJsonParse(draft.media_json, null);
    const poll = safeJsonParse(draft.poll_json, null);
    const targetFilter = safeJsonParse(draft.target_filter, null);

    let record;
    if (draft.target_type === 'channels') {
      const channelIds = targetFilter?.channelIds || [];
      if (!channelIds.length) return res.status(400).json({ error: 'Нет каналов для отправки' });
      const results = [];
      for (const chatId of channelIds) {
        try { const d = await sendToChat(chatId, text.trim() || '', media, poll, 'channels'); results.push({ chatId, ok: d.ok, error: d.description || null }); }
        catch (e) { results.push({ chatId, ok: false, error: e.message }); }
      }
      const success = results.filter(r => r.ok).length;
      const [channels] = await dbPool.query('SELECT chat_id, title FROM wl_admin_channels WHERE chat_id IN (?)', [channelIds.map(String)]);
      const channelNames = channelIds.map(cid => { const ch = channels.find(c => String(c.chat_id) === String(cid)); return ch?.title || cid; });
      record = await saveBroadcast({ text: poll ? `[Опрос] ${poll.question}` : text.trim(), type: 'channels', channels: channelNames, channelIds, total: channelIds.length, success, failed: channelIds.length - success, results, media });
    } else if (draft.target_type === 'groups') {
      const groupIds = targetFilter?.groupIds || [];
      if (!groupIds.length) return res.status(400).json({ error: 'Нет групп для отправки' });
      const results = [];
      for (const chatId of groupIds) {
        try { const d = await sendToChat(chatId, text.trim() || '', media, poll, 'groups'); results.push({ chatId, ok: d.ok, error: d.description || null }); }
        catch (e) { results.push({ chatId, ok: false, error: e.message }); }
      }
      const success = results.filter(r => r.ok).length;
      const [groups] = await dbPool.query('SELECT chat_id, title FROM wl_admin_groups WHERE chat_id IN (?)', [groupIds.map(String)]);
      const groupNames = groupIds.map(gid => { const g = groups.find(gr => String(gr.chat_id) === String(gid)); return g?.title || gid; });
      record = await saveBroadcast({ text: poll ? `[Опрос] ${poll.question}` : text.trim(), type: 'groups', channels: groupNames, channelIds: groupIds, total: groupIds.length, success, failed: groupIds.length - success, results, media });
    } else if (draft.target_type === 'users') {
      const filters = targetFilter?.filters || {};
      let where = ['u.user_id IS NOT NULL'];
      const params = [];
      let joins = '';
      const tagsArr = Array.isArray(filters.tags) ? filters.tags : [];
      if (tagsArr.length > 0) {
        joins += ` INNER JOIN wl_admin_user_tags t ON t.user_id = u.user_id AND t.tag IN (${tagsArr.map(() => '?').join(',')})`;
        params.push(...tagsArr);
      }
      const [users] = await dbPool.query(`SELECT DISTINCT u.user_id, u.full_name FROM users u${joins} WHERE ${where.join(' AND ')}`, params);
      let draftPollId = null;
      if (poll) draftPollId = await createPoll(poll);
      const results = [];
      for (const row of users) {
        try { const d = await sendToChat(row.user_id, text.trim() || '', media, poll, 'users', draftPollId); results.push({ chatId: row.user_id, ok: d.ok, error: d.description || null }); }
        catch (e) { results.push({ chatId: row.user_id, ok: false, error: e.message }); }
      }
      const success = results.filter(r => r.ok).length;
      record = await saveBroadcast({ text: poll ? `[Опрос] ${poll.question}` : text.trim(), type: 'users', channels: [`Пользователи (${users.length})`], channelIds: [], total: users.length, success, failed: users.length - success, results: results.slice(0, 100), media, pollId: draftPollId });
    } else {
      return res.status(400).json({ error: 'Неизвестный тип цели' });
    }

    // Delete draft after successful send
    await dbPool.query(`UPDATE wl_admin_scheduled_broadcasts SET status = 'sent' WHERE draft_id = ? AND status = 'pending'`, [id]);
    await dbPool.query('DELETE FROM wl_admin_broadcast_drafts WHERE id = ?', [id]);

    res.json(record);
  } catch (err) { next(err); }
});

// POST /api/broadcasts/drafts/:id/schedule — запланировать отправку
router.post('/drafts/:id/schedule', async (req, res, next) => {
  try {
    const draftId = Number(req.params.id);
    const { scheduledAt } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt is required' });

    const schedDate = new Date(scheduledAt);
    if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
      return res.status(400).json({ error: 'Дата должна быть в будущем' });
    }

    // Check draft exists
    const [drafts] = await dbPool.query('SELECT id FROM wl_admin_broadcast_drafts WHERE id = ?', [draftId]);
    if (!drafts.length) return res.status(404).json({ error: 'Черновик не найден' });

    // Cancel any existing pending schedules for this draft
    await dbPool.query(`UPDATE wl_admin_scheduled_broadcasts SET status = 'cancelled' WHERE draft_id = ? AND status = 'pending'`, [draftId]);

    // Update draft scheduled_at
    await dbPool.query('UPDATE wl_admin_broadcast_drafts SET scheduled_at = ? WHERE id = ?', [schedDate, draftId]);

    // Create scheduled entry
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_scheduled_broadcasts (draft_id, scheduled_at) VALUES (?, ?)',
      [draftId, schedDate]
    );

    res.status(201).json({ id: result.insertId, draftId, scheduledAt: schedDate.toISOString() });
  } catch (err) { next(err); }
});

// GET /api/broadcasts/scheduled — список запланированных
router.get('/scheduled', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      `SELECT s.*, d.name, d.text, d.target_type
       FROM wl_admin_scheduled_broadcasts s
       JOIN wl_admin_broadcast_drafts d ON d.id = s.draft_id
       WHERE s.status = 'pending'
       ORDER BY s.scheduled_at ASC`
    );
    res.json(rows.map(r => ({
      id: r.id,
      draftId: r.draft_id,
      name: r.name,
      text: r.text,
      targetType: r.target_type,
      scheduledAt: r.scheduled_at,
      status: r.status,
    })));
  } catch (err) { next(err); }
});

// DELETE /api/broadcasts/scheduled/:id — отменить запланированную
router.delete('/scheduled/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [result] = await dbPool.query(
      `UPDATE wl_admin_scheduled_broadcasts SET status = 'cancelled' WHERE id = ? AND status = 'pending'`,
      [id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found or already sent' });
    // Clear scheduled_at from draft
    const [sched] = await dbPool.query('SELECT draft_id FROM wl_admin_scheduled_broadcasts WHERE id = ?', [id]);
    if (sched.length) {
      await dbPool.query('UPDATE wl_admin_broadcast_drafts SET scheduled_at = NULL WHERE id = ?', [sched[0].draft_id]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ===================== ПЛАНИРОВЩИК =====================

// Check for pending scheduled broadcasts every 30 seconds
setInterval(async () => {
  try {
    const [pending] = await dbPool.query(
      `SELECT s.id, s.draft_id FROM wl_admin_scheduled_broadcasts s
       WHERE s.status = 'pending' AND s.scheduled_at <= NOW()`
    );
    for (const sched of pending) {
      try {
        console.log(`[scheduler] Sending scheduled broadcast #${sched.id} (draft #${sched.draft_id})`);
        const [drafts] = await dbPool.query('SELECT * FROM wl_admin_broadcast_drafts WHERE id = ?', [sched.draft_id]);
        if (!drafts.length) {
          await dbPool.query(`UPDATE wl_admin_scheduled_broadcasts SET status = 'cancelled' WHERE id = ?`, [sched.id]);
          continue;
        }
        const draft = drafts[0];
        const text = draft.text || '';
        const media = safeJsonParse(draft.media_json, null);
        const poll = safeJsonParse(draft.poll_json, null);
        const targetFilter = safeJsonParse(draft.target_filter, null);

        if (draft.target_type === 'channels') {
          const channelIds = targetFilter?.channelIds || [];
          if (channelIds.length) {
            const results = [];
            for (const chatId of channelIds) {
              try { const d = await sendToChat(chatId, text.trim() || '', media, poll, 'channels'); results.push({ chatId, ok: d.ok }); }
              catch (e) { results.push({ chatId, ok: false, error: e.message }); }
            }
            const success = results.filter(r => r.ok).length;
            const [channels] = await dbPool.query('SELECT chat_id, title FROM wl_admin_channels WHERE chat_id IN (?)', [channelIds.map(String)]);
            const channelNames = channelIds.map(id => { const ch = channels.find(c => String(c.chat_id) === String(id)); return ch?.title || id; });
            await saveBroadcast({ text: poll ? `[Опрос] ${poll.question}` : text.trim(), type: 'channels', channels: channelNames, channelIds, total: channelIds.length, success, failed: channelIds.length - success, results, media });
          }
        } else if (draft.target_type === 'groups') {
          const groupIds = targetFilter?.groupIds || [];
          if (groupIds.length) {
            const results = [];
            for (const chatId of groupIds) {
              try { const d = await sendToChat(chatId, text.trim() || '', media, poll, 'groups'); results.push({ chatId, ok: d.ok }); }
              catch (e) { results.push({ chatId, ok: false, error: e.message }); }
            }
            const success = results.filter(r => r.ok).length;
            const [groups] = await dbPool.query('SELECT chat_id, title FROM wl_admin_groups WHERE chat_id IN (?)', [groupIds.map(String)]);
            const groupNames = groupIds.map(id => { const g = groups.find(gr => String(gr.chat_id) === String(id)); return g?.title || id; });
            await saveBroadcast({ text: poll ? `[Опрос] ${poll.question}` : text.trim(), type: 'groups', channels: groupNames, channelIds: groupIds, total: groupIds.length, success, failed: groupIds.length - success, results, media });
          }
        } else if (draft.target_type === 'users') {
          const filters = targetFilter?.filters || {};
          let where = ['u.user_id IS NOT NULL'];
          const params = [];
          let joins = '';
          const tagsArr = Array.isArray(filters.tags) ? filters.tags : [];
          if (tagsArr.length > 0) {
            joins += ` INNER JOIN wl_admin_user_tags t ON t.user_id = u.user_id AND t.tag IN (${tagsArr.map(() => '?').join(',')})`;
            params.push(...tagsArr);
          }
          const [users] = await dbPool.query(`SELECT DISTINCT u.user_id, u.full_name FROM users u${joins} WHERE ${where.join(' AND ')}`, params);
          let schedPollId = null;
          if (poll) schedPollId = await createPoll(poll);
          const results = [];
          for (const row of users) {
            try { const d = await sendToChat(row.user_id, text.trim() || '', media, poll, 'users', schedPollId); results.push({ chatId: row.user_id, ok: d.ok }); }
            catch (e) { results.push({ chatId: row.user_id, ok: false, error: e.message }); }
          }
          const success = results.filter(r => r.ok).length;
          await saveBroadcast({ text: poll ? `[Опрос] ${poll.question}` : text.trim(), type: 'users', channels: [`Пользователи (${users.length})`], channelIds: [], total: users.length, success, failed: users.length - success, results: results.slice(0, 100), media, pollId: schedPollId });
        }

        // Mark as sent and delete draft
        await dbPool.query(`UPDATE wl_admin_scheduled_broadcasts SET status = 'sent' WHERE id = ?`, [sched.id]);
        await dbPool.query('DELETE FROM wl_admin_broadcast_drafts WHERE id = ?', [sched.draft_id]);
        console.log(`[scheduler] Broadcast #${sched.id} sent successfully`);
      } catch (err) {
        console.error(`[scheduler] Failed to send broadcast #${sched.id}:`, err.message);
      }
    }
  } catch (err) {
    // Silent fail for scheduler
  }
}, 30000);

// ===================== ХЕЛПЕР =====================

async function saveBroadcast({ text, type, channels, channelIds, total, success, failed, results, media, pollId }, conn) {
  const db = conn || dbPool;
  const status = success === total ? 'published' : (success > 0 ? 'partial' : 'failed');
  const withMedia = await checkMediaColumn();

  const baseCols = 'text, type, channels_json, channel_ids_json, total, success, failed, results_json, status';
  const baseVals = [
    (text || '').substring(0, 500), type, JSON.stringify(channels), JSON.stringify(channelIds),
    total, success, failed, JSON.stringify(results), status,
  ];

  let cols = baseCols;
  let vals = [...baseVals];
  if (withMedia) { cols += ', media_json'; vals.push(media ? JSON.stringify(media) : null); }

  const placeholders = vals.map(() => '?').join(', ');
  const sql = `INSERT INTO wl_admin_broadcasts (${cols}) VALUES (${placeholders})`;
  const [result] = await db.query(sql, vals);

  // Link poll to broadcast
  if (pollId) {
    try { await db.query('UPDATE wl_admin_polls SET broadcast_id = ? WHERE id = ?', [result.insertId, pollId]); } catch {}
  }

  return {
    id: result.insertId, text: (text || '').substring(0, 200), type, channels, channelIds,
    total, success, failed, results, media: media || null, date: new Date().toISOString(), status, pollId,
  };
}

// ===================== ОПРОСЫ: ГОЛОСОВАНИЕ И СТАТИСТИКА =====================

// Webhook handler for poll votes (called by bot) — public, no auth
pollVoteRouter.post('/', async (req, res) => {
  try {
    const { poll_id, user_id, option_index } = req.body;
    if (!poll_id || user_id == null || option_index == null) return res.status(400).json({ error: 'Missing fields' });

    // Check poll exists
    const [polls] = await dbPool.query('SELECT * FROM wl_admin_polls WHERE id = ?', [poll_id]);
    if (!polls.length) return res.status(404).json({ error: 'Poll not found' });
    const poll = polls[0];
    const options = safeJsonParse(poll.options_json, []);

    // Check if already voted
    const [existing] = await dbPool.query('SELECT id FROM wl_admin_poll_votes WHERE poll_id = ? AND user_id = ?', [poll_id, user_id]);
    if (existing.length) {
      return res.json({ ok: true, already_voted: true, message: 'Вы уже голосовали' });
    }

    // Save vote
    await dbPool.query('INSERT INTO wl_admin_poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)', [poll_id, user_id, option_index]);

    // Get updated stats
    const [votes] = await dbPool.query('SELECT option_index, COUNT(*) as cnt FROM wl_admin_poll_votes WHERE poll_id = ? GROUP BY option_index', [poll_id]);
    const totalVotes = votes.reduce((s, v) => s + v.cnt, 0);

    // Check if quiz and if answer is correct
    let correct = null;
    if (poll.type === 'quiz' && poll.correct_index != null) {
      correct = option_index === poll.correct_index;
    }

    res.json({ ok: true, correct, option: options[option_index] || '', totalVotes, stats: votes });
  } catch (err) {
    console.error('[poll-vote]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/broadcasts/poll/:id/stats — poll statistics
router.get('/poll/:id/stats', async (req, res, next) => {
  try {
    const pollId = Number(req.params.id);
    const [polls] = await dbPool.query('SELECT * FROM wl_admin_polls WHERE id = ?', [pollId]);
    if (!polls.length) return res.status(404).json({ error: 'Опрос не найден' });
    const poll = polls[0];
    const options = safeJsonParse(poll.options_json, []);

    const [votes] = await dbPool.query(
      'SELECT option_index, COUNT(*) as cnt FROM wl_admin_poll_votes WHERE poll_id = ? GROUP BY option_index',
      [pollId]
    );
    const totalVotes = votes.reduce((s, v) => s + v.cnt, 0);

    const stats = options.map((opt, i) => {
      const v = votes.find(x => x.option_index === i);
      const count = v ? v.cnt : 0;
      return { option: opt, count, percent: totalVotes > 0 ? Math.round(count / totalVotes * 100) : 0 };
    });

    res.json({
      id: pollId,
      question: poll.question,
      type: poll.type,
      correctIndex: poll.correct_index,
      totalVotes,
      stats,
    });
  } catch (err) { next(err); }
});

export default router;
