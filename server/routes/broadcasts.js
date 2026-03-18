import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dbPool from '../config/db.js';
import { BOT_TOKEN } from '../config/env.js';
import { tgSend, tgSendMedia, tgSendPoll } from '../services/telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');

const router = Router();

// ===================== MULTER =====================

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

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
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [val];
  }
}

function safeJsonParse(val, fallback = []) {
  if (!val) return fallback;
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
  if (media?.filename) {
    const filePath = path.join(UPLOADS_DIR, media.filename);
    return tgSendMedia(chatId, filePath, media.mimeType, text || '');
  }
  return tgSend(chatId, text);
}

// ===================== ЗАГРУЗКА ФАЙЛОВ =====================

// POST /api/broadcasts/upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
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
      text: (text || '').trim(), type: 'groups', channels: groupNames, channelIds: groupIds,
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
  try {
    const { text, channelIds, media, poll } = req.body;
    console.log('[broadcasts POST /] body keys:', Object.keys(req.body), 'poll:', !!poll, 'text:', !!text?.trim(), 'media:', !!media);
    if (!text?.trim() && !media && !poll) return res.status(400).json({ error: 'Введите текст, прикрепите файл или создайте опрос' });
    if (!channelIds?.length) return res.status(400).json({ error: 'Выберите хотя бы один канал' });

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
    const [channels] = await dbPool.query('SELECT chat_id, title FROM wl_admin_channels WHERE chat_id IN (?)', [channelIds.map(String)]);
    const channelNames = channelIds.map(id => {
      const ch = channels.find(c => String(c.chat_id) === String(id));
      return ch?.title || id;
    });

    const broadcastType = poll ? (poll.type === 'quiz' ? 'quiz' : 'poll') : 'channels';
    const broadcastText = poll ? `${poll.question}` : (text || '').trim();

    const record = await saveBroadcast({
      text: broadcastText, type: broadcastType, channels: channelNames, channelIds,
      total: channelIds.length, success, failed: channelIds.length - success, results, media,
    });

    res.json(record);
  } catch (err) { next(err); }
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
    let join = '';
    if (filters) {
      if (filters.tag && filters.tag !== 'all') {
        join = 'INNER JOIN wl_admin_user_tags t ON t.user_id = u.user_id';
        where.push('t.tag = ?');
        params.push(filters.tag);
      }
    }

    const [rows] = await dbPool.query(`SELECT DISTINCT u.user_id FROM users u ${join} WHERE ${where.join(' AND ')}`, params);
    if (!rows.length) {
      return res.json({ success: 0, total: 0, failed: 0, results: [], status: 'failed', error: 'Нет пользователей по заданным фильтрам' });
    }

    const results = [];
    let successCount = 0;
    for (const row of rows) {
      try {
        const data = await sendToChat(row.user_id, text?.trim() || '', media, poll);
        results.push({ chatId: row.user_id, ok: data.ok, error: data.description || null });
        if (data.ok) successCount++;
      } catch (err) {
        results.push({ chatId: row.user_id, ok: false, error: err.message });
      }
    }

    const record = await saveBroadcast({
      text: (text || '').trim(), type: 'users', channels: [`Пользователи (${rows.length})`], channelIds: [],
      total: rows.length, success: successCount, failed: rows.length - successCount, results, media,
    });

    res.json(record);
  } catch (err) { next(err); }
});

router.get('/users/count', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    let where = ['u.user_id IS NOT NULL'];
    const params = [];
    let join = '';
    if (req.query.tag && req.query.tag !== 'all') {
      join = 'INNER JOIN wl_admin_user_tags t ON t.user_id = u.user_id';
      where.push('t.tag = ?');
      params.push(req.query.tag);
    }
    const [[{ count }]] = await dbPool.query(`SELECT COUNT(DISTINCT u.user_id) as count FROM users u ${join} WHERE ${where.join(' AND ')}`, params);
    res.json({ count });
  } catch (err) { next(err); }
});

router.get('/users/tags', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const [rows] = await dbPool.query("SELECT DISTINCT tag FROM wl_admin_user_tags WHERE tag != '__edited__'");
    res.json(rows.map(r => r.tag).sort());
  } catch (err) { next(err); }
});

// ===================== ХЕЛПЕР =====================

async function saveBroadcast({ text, type, channels, channelIds, total, success, failed, results, media }) {
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

  const [result] = await dbPool.query(sql, params);
  return {
    id: result.insertId, text: (text || '').substring(0, 200), type, channels, channelIds,
    total, success, failed, results, media: media || null, date: new Date().toISOString(), status,
  };
}

export default router;
