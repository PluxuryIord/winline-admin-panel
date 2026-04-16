import { Router } from 'express';
import dbPool from '../config/db.js';
import { logAudit } from '../services/auditLog.js';

const router = Router();

// GET /api/raffles/eligible — список юзеров, получивших QR коды (без TEST-)
router.get('/eligible', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      `SELECT DISTINCT c.user_id, c.code, c.created_at,
        u.full_name, u.rl_full_name, u.username
       FROM wl_event_codes c
       LEFT JOIN users u ON u.user_id = c.user_id
       WHERE c.code NOT LIKE 'TEST-%'
         AND c.user_id > 0
       ORDER BY c.created_at DESC`
    );
    res.json({ users: rows, total: rows.length });
  } catch (err) { next(err); }
});

// POST /api/raffles/draw — выбрать N случайных победителей
// body: { count: number, excludeUserIds?: number[] }
router.post('/draw', async (req, res, next) => {
  try {
    const count = Math.max(1, parseInt(req.body?.count, 10) || 1);
    const exclude = Array.isArray(req.body?.excludeUserIds)
      ? req.body.excludeUserIds.map(Number).filter(Boolean)
      : [];

    // Subquery picks random user_ids first (compatible with ONLY_FULL_GROUP_BY).
    let inner = `
      SELECT user_id, MIN(code) AS code
      FROM wl_event_codes
      WHERE code NOT LIKE 'TEST-%' AND user_id > 0
    `;
    const params = [];
    if (exclude.length) {
      inner += ' AND user_id NOT IN (?)';
      params.push(exclude);
    }
    inner += ' GROUP BY user_id ORDER BY RAND() LIMIT ?';
    params.push(count);

    const sql = `
      SELECT t.user_id, t.code,
        u.full_name, u.rl_full_name, u.username
      FROM (${inner}) t
      LEFT JOIN users u ON u.user_id = t.user_id
    `;

    try {
      const [rows] = await dbPool.query(sql, params);
      return res.json({ winners: rows, requested: count, drawn: rows.length });
    } catch (sqlErr) {
      console.error('[raffles/draw] SQL error:', sqlErr.code, sqlErr.message);
      return res.status(500).json({ error: `SQL: ${sqlErr.code || sqlErr.message}` });
    }
  } catch (err) { next(err); }
});

// POST /api/raffles/tag-winners — присвоить тег списку победителей
// body: { userIds: number[], tag: string }
router.post('/tag-winners', async (req, res, next) => {
  try {
    const { userIds, tag } = req.body || {};
    const ids = Array.isArray(userIds) ? userIds.map(Number).filter(Boolean) : [];
    const tagName = String(tag || '').trim();
    if (!ids.length) return res.status(400).json({ error: 'userIds required' });
    if (!tagName) return res.status(400).json({ error: 'tag required' });

    // Idempotent: delete then insert
    await dbPool.query(
      'DELETE FROM wl_admin_user_tags WHERE user_id IN (?) AND tag = ?',
      [ids, tagName]
    );
    const values = ids.map(uid => [uid, tagName]);
    await dbPool.query(
      'INSERT INTO wl_admin_user_tags (user_id, tag) VALUES ?',
      [values]
    );

    const userName = req.user.displayName || req.user.username;
    logAudit(
      req.user.id, userName, 'create', 'raffle',
      `winners:${ids.length}`,
      `Розыгрыш: тег "${tagName}" → ${ids.length} победителей`,
      null, { userIds: ids, tag: tagName }
    );

    res.json({ ok: true, tagged: ids.length, tag: tagName });
  } catch (err) { next(err); }
});

export default router;
