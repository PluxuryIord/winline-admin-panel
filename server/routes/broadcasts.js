import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import dbPool from '../config/db.js';
import { BOT_TOKEN, WEBHOOK_SECRET } from '../config/env.js';
import { tgSend, tgSendMedia, tgSendPoll } from '../services/telegram.js';
import { uploadToS3, downloadBuffer } from '../services/s3.js';

const router = Router();

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

/** Отправить сообщение (текст/медиа/опрос) одному chatId */
async function sendToChat(chatId, text, media, poll) {
  if (poll) {
    return tgSendPoll(chatId, poll.question, poll.options, {
      type: poll.type || 'regular',
      correct_option_id: poll.type === 'quiz' ? poll.correctIndex : undefined,
    });
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
        const data = await sendToChat(chatId, text?.trim() || '', media, poll);
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
    res.json(rows.map(r => ({
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
      date: r.date,
      status: r.status,
    })));
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
        const data = await sendToChat(chatId, text?.trim() || '', media, poll);
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
        tagsArr.forEach((tag, i) => {
          const alias = `t${i}`;
          joins += ` INNER JOIN wl_admin_user_tags ${alias} ON ${alias}.user_id = u.user_id AND ${alias}.tag = ?`;
          params.push(tag);
        });
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

    for (const row of rows) {
      try {
        const data = await sendToChat(row.user_id, text?.trim() || '', media, poll);
        results.push({ chatId: row.user_id, name: row.full_name || '', username: row.username || '', ok: data.ok, error: data.description || null });
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
      }
    }

    // Limit results to avoid exceeding DB column size
    const truncatedResults = results.slice(0, 100);

    let record;
    try {
      record = await saveBroadcast({
        text: poll ? `[${poll.type === 'quiz' ? 'Викторина' : 'Опрос'}] ${poll.question}` : (text || '').trim(), type: 'users', channels: [`Пользователи (${rows.length})`], channelIds: [],
        total: rows.length, success: successCount, failed: rows.length - successCount, results: truncatedResults, media,
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
    // Support comma-separated tags (AND logic)
    const tagsParam = req.query.tags?.trim() || req.query.tag?.trim();
    if (tagsParam && tagsParam !== 'all') {
      const tagsArr = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tagsArr.length > 0) {
        tagsArr.forEach((tag, i) => {
          const alias = `t${i}`;
          joins += ` INNER JOIN wl_admin_user_tags ${alias} ON ${alias}.user_id = u.user_id AND ${alias}.tag = ?`;
          params.push(tag);
        });
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
        tagsArr.forEach((tag, i) => {
          const alias = `t${i}`;
          joins += ` INNER JOIN wl_admin_user_tags ${alias} ON ${alias}.user_id = u.user_id AND ${alias}.tag = ?`;
          params.push(tag);
        });
      }
    }
    const [rows] = await dbPool.query(
      `SELECT DISTINCT u.user_id, u.full_name, u.username FROM users u${joins} WHERE ${where.join(' AND ')} LIMIT 100`,
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

// Get all unique channel tags
router.get('/channel-tags', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT DISTINCT tag FROM wl_admin_channel_tags ORDER BY tag');
    res.json(rows.map(r => r.tag));
  } catch (err) { next(err); }
});

// ===================== ХЕЛПЕР =====================

async function saveBroadcast({ text, type, channels, channelIds, total, success, failed, results, media }, conn) {
  const db = conn || dbPool;
  const status = success === total ? 'published' : (success > 0 ? 'partial' : 'failed');
  const withMedia = await checkMediaColumn();

  const baseCols = 'text, type, channels_json, channel_ids_json, total, success, failed, results_json, status';
  const baseVals = [
    (text || '').substring(0, 500), type, JSON.stringify(channels), JSON.stringify(channelIds),
    total, success, failed, JSON.stringify(results), status,
  ];

  let sql, params;
  if (withMedia) {
    sql = `INSERT INTO wl_admin_broadcasts (${baseCols}, media_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    params = [...baseVals, media ? JSON.stringify(media) : null];
  } else {
    sql = `INSERT INTO wl_admin_broadcasts (${baseCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    params = baseVals;
  }

  const [result] = await db.query(sql, params);
  return {
    id: result.insertId, text: (text || '').substring(0, 200), type, channels, channelIds,
    total, success, failed, results, media: media || null, date: new Date().toISOString(), status,
  };
}

export default router;
