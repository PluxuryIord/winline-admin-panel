import { Router } from 'express';
import dbPool from '../config/db.js';
import { BOT_TOKEN } from '../config/env.js';
import { tgSend } from '../services/telegram.js';

const router = Router();

// Безопасный JSON.parse — если невалидный JSON, оборачивает строку в массив
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

// ===================== КАНАЛЫ =====================

// GET /api/broadcasts/channels
router.get('/channels', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT id, chat_id AS chatId, title, added_at AS addedAt FROM wl_admin_channels ORDER BY id ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/broadcasts/channels
router.post('/channels', async (req, res, next) => {
  try {
    const { chatId, title } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });

    const [existing] = await dbPool.query('SELECT id FROM wl_admin_channels WHERE chat_id = ?', [String(chatId)]);
    if (existing.length) return res.status(409).json({ error: 'Канал уже добавлен' });

    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_channels (chat_id, title) VALUES (?, ?)',
      [String(chatId), title || chatId]
    );

    res.status(201).json({
      id: result.insertId,
      chatId: String(chatId),
      title: title || chatId,
      addedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// DELETE /api/broadcasts/channels/:id
router.delete('/channels/:id', async (req, res, next) => {
  try {
    const [result] = await dbPool.query('DELETE FROM wl_admin_channels WHERE id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ===================== ГРУППЫ =====================

// GET /api/broadcasts/groups
router.get('/groups', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT id, chat_id AS chatId, title, added_at AS addedAt FROM wl_admin_groups ORDER BY id ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/broadcasts/groups
router.post('/groups', async (req, res, next) => {
  try {
    const { chatId, title } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });

    const [existing] = await dbPool.query('SELECT id FROM wl_admin_groups WHERE chat_id = ?', [String(chatId)]);
    if (existing.length) return res.status(409).json({ error: 'Группа уже добавлена' });

    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_groups (chat_id, title) VALUES (?, ?)',
      [String(chatId), title || chatId]
    );

    res.status(201).json({
      id: result.insertId,
      chatId: String(chatId),
      title: title || chatId,
      addedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

// DELETE /api/broadcasts/groups/:id
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
    const { text, groupIds } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    if (!groupIds?.length) return res.status(400).json({ error: 'Выберите хотя бы одну группу' });

    const results = [];
    for (const chatId of groupIds) {
      try {
        const data = await tgSend(chatId, text.trim());
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
      text: text.trim(), type: 'groups', channels: groupNames, channelIds: groupIds,
      total: groupIds.length, success, failed: groupIds.length - success, results,
    });

    res.json(record);
  } catch (err) { next(err); }
});

// ===================== РАССЫЛКИ (ИСТОРИЯ) =====================

// GET /api/broadcasts
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      'SELECT id, text, type, channels_json, channel_ids_json, total, success, failed, results_json, status, created_at AS date FROM wl_admin_broadcasts ORDER BY created_at DESC LIMIT 200'
    );
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
      date: r.date,
      status: r.status,
    })));
  } catch (err) { next(err); }
});

// POST /api/broadcasts — отправить в каналы
router.post('/', async (req, res, next) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен' });
  try {
    const { text, channelIds } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    if (!channelIds?.length) return res.status(400).json({ error: 'Выберите хотя бы один канал' });

    const results = [];
    for (const chatId of channelIds) {
      try {
        const data = await tgSend(chatId, text.trim());
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

    const record = await saveBroadcast({
      text: text.trim(), type: 'channels', channels: channelNames, channelIds,
      total: channelIds.length, success, failed: channelIds.length - success, results,
    });

    res.json(record);
  } catch (err) { next(err); }
});

// DELETE /api/broadcasts/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await dbPool.query('DELETE FROM wl_admin_broadcasts WHERE id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ===================== РАССЫЛКА ПОЛЬЗОВАТЕЛЯМ =====================

// POST /api/broadcasts/users
router.post('/users', async (req, res, next) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен' });
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const { text, filters } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    let where = ['u.user_id IS NOT NULL'];
    const params = [];
    let join = '';
    if (filters) {
      if (filters.tag && filters.tag !== 'all') {
        join = 'INNER JOIN wl_admin_user_tags t ON t.user_id = u.user_id';
        where.push('t.tag = ?');
        params.push(filters.tag);
      }
      if (filters.banned === 'active') where.push('(u.banned = 0 OR u.banned IS NULL)');
      else if (filters.banned === 'banned') where.push('u.banned = 1');
      if (filters.registered === 'yes') where.push('u.registered = 1');
      else if (filters.registered === 'no') where.push('(u.registered = 0 OR u.registered IS NULL)');
    }

    const [rows] = await dbPool.query(`SELECT DISTINCT u.user_id FROM users u ${join} WHERE ${where.join(' AND ')}`, params);
    if (!rows.length) {
      return res.json({ success: 0, total: 0, failed: 0, results: [], status: 'failed', error: 'Нет пользователей по заданным фильтрам' });
    }

    const results = [];
    let successCount = 0;
    for (const row of rows) {
      try {
        const data = await tgSend(row.user_id, text.trim());
        results.push({ chatId: row.user_id, ok: data.ok, error: data.description || null });
        if (data.ok) successCount++;
      } catch (err) {
        results.push({ chatId: row.user_id, ok: false, error: err.message });
      }
    }

    const record = await saveBroadcast({
      text: text.trim(), type: 'users', channels: [`Пользователи (${rows.length})`], channelIds: [],
      total: rows.length, success: successCount, failed: rows.length - successCount, results,
    });

    res.json(record);
  } catch (err) { next(err); }
});

// GET /api/broadcasts/users/count
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
    if (req.query.banned === 'active') where.push('(u.banned = 0 OR u.banned IS NULL)');
    else if (req.query.banned === 'banned') where.push('u.banned = 1');
    if (req.query.registered === 'yes') where.push('u.registered = 1');
    else if (req.query.registered === 'no') where.push('(u.registered = 0 OR u.registered IS NULL)');

    const [[{ count }]] = await dbPool.query(`SELECT COUNT(DISTINCT u.user_id) as count FROM users u ${join} WHERE ${where.join(' AND ')}`, params);
    res.json({ count });
  } catch (err) { next(err); }
});

// GET /api/broadcasts/users/tags
router.get('/users/tags', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const [rows] = await dbPool.query("SELECT DISTINCT tag FROM wl_admin_user_tags WHERE tag != '__edited__' ORDER BY tag");
    res.json(rows.map(r => r.tag));
  } catch (err) { next(err); }
});

// ===================== ХЕЛПЕР =====================

async function saveBroadcast({ text, type, channels, channelIds, total, success, failed, results }) {
  const status = success === total ? 'published' : (success > 0 ? 'partial' : 'failed');
  const [result] = await dbPool.query(
    `INSERT INTO wl_admin_broadcasts (text, type, channels_json, channel_ids_json, total, success, failed, results_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [text.substring(0, 500), type, JSON.stringify(channels), JSON.stringify(channelIds), total, success, failed, JSON.stringify(results), status]
  );
  return {
    id: result.insertId, text: text.substring(0, 200), type, channels, channelIds,
    total, success, failed, results, date: new Date().toISOString(), status,
  };
}

export default router;
