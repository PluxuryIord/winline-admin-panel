import { Router } from 'express';
import crypto from 'crypto';
import dbPool from '../config/db.js';
import { WEBHOOK_SECRET } from '../config/env.js';
import { logAudit } from '../services/auditLog.js';

const router = Router();

// ─── Auto-migration: scenario-3 raffle tickets ──────────────────────────────
(async () => {
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_event_raffle_tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL DEFAULT 0,
        user_id BIGINT NOT NULL,
        telegram_id BIGINT NOT NULL,
        email VARCHAR(255) NOT NULL,
        ticket_number INT NOT NULL,
        is_winner TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_event_user (event_id, telegram_id),
        UNIQUE KEY uniq_event_ticket (event_id, ticket_number),
        INDEX idx_event (event_id),
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    try { await dbPool.query("ALTER TABLE wl_event_raffle_tickets ADD COLUMN ticket_code VARCHAR(16) NULL"); }
    catch (e) { if (!/Duplicate column/i.test(e.message)) console.warn('[raffles] migrate ticket_code:', e.message); }
  } catch (e) { console.warn('[raffles] migrate v2:', e.message); }
})();

async function isRaffleHidden() {
  try {
    const [rows] = await dbPool.query("SELECT data FROM texts WHERE category = 'event_settings' LIMIT 1");
    if (!rows.length) return false;
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    return !!data?.raffle_hidden;
  } catch { return false; }
}

// ─── Internal: bot issues / fetches a raffle ticket for a user ──────────────
// Idempotent: same (event_id, telegram_id) → returns existing ticket_number.
// Auth: x-webhook-secret OR x-webhook-signature (HMAC-sha256 of body).
function verifyBotCall(req) {
  if (!WEBHOOK_SECRET) return false;
  const plain = req.headers['x-webhook-secret'];
  if (plain && plain === WEBHOOK_SECRET) return true;
  const sig = req.headers['x-webhook-signature'];
  if (!sig) return false;
  try {
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(req.body)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

export const raffleInternalRouter = Router();
raffleInternalRouter.post('/issue', async (req, res) => {
  if (!verifyBotCall(req)) return res.status(401).json({ error: 'unauthorized' });
  const event_id = parseInt(req.body?.event_id, 10) || 0;
  const telegram_id = parseInt(req.body?.telegram_id, 10);
  const user_id = parseInt(req.body?.user_id, 10) || telegram_id;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const ticket_code = String(req.body?.ticket_code || '').trim().toUpperCase().slice(0, 16) || null;
  if (!telegram_id || !email) return res.status(400).json({ error: 'telegram_id and email required' });

  if (await isRaffleHidden()) {
    return res.json({ ok: true, disabled: true });
  }

  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();
    // Existing ticket? (fallback if ticket_code column not yet added)
    let existing;
    try {
      [existing] = await conn.query(
        'SELECT ticket_number, ticket_code FROM wl_event_raffle_tickets WHERE event_id=? AND telegram_id=? LIMIT 1',
        [event_id, telegram_id]
      );
    } catch (e) {
      if (!/Unknown column/i.test(e.message)) throw e;
      [existing] = await conn.query(
        'SELECT ticket_number FROM wl_event_raffle_tickets WHERE event_id=? AND telegram_id=? LIMIT 1',
        [event_id, telegram_id]
      );
    }
    if (existing.length) {
      await conn.commit();
      // mark merch row as raffle participant if applicable
      if (ticket_code) {
        try { await dbPool.query("UPDATE wl_event_codes SET raffle_participant=1 WHERE code = ?", [`EVT-${ticket_code}`]); } catch {}
      }
      return res.json({ ok: true, ticket_number: existing[0].ticket_number, ticket_code: existing[0].ticket_code, existing: true });
    }
    // Next sequential number per event
    const [maxRow] = await conn.query(
      'SELECT COALESCE(MAX(ticket_number),0)+1 AS next FROM wl_event_raffle_tickets WHERE event_id=? FOR UPDATE',
      [event_id]
    );
    const next = maxRow[0].next;
    try {
      await conn.query(
        'INSERT INTO wl_event_raffle_tickets (event_id, user_id, telegram_id, email, ticket_number, ticket_code) VALUES (?,?,?,?,?,?)',
        [event_id, user_id, telegram_id, email, next, ticket_code]
      );
    } catch (e) {
      if (!/Unknown column/i.test(e.message)) throw e;
      await conn.query(
        'INSERT INTO wl_event_raffle_tickets (event_id, user_id, telegram_id, email, ticket_number) VALUES (?,?,?,?,?)',
        [event_id, user_id, telegram_id, email, next]
      );
    }
    if (ticket_code) {
      try { await conn.query("UPDATE wl_event_codes SET raffle_participant=1 WHERE code = ?", [`EVT-${ticket_code}`]); } catch {}
    }
    await conn.commit();
    res.json({ ok: true, ticket_number: next, ticket_code, existing: false });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error('[raffle/issue]', e.message);
    res.status(500).json({ error: 'db error' });
  } finally {
    conn.release();
  }
});

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

// ─── V2 admin: list / draw / mark winners on raffle tickets ─────────────────
router.get('/v2/list', async (req, res, next) => {
  try {
    const eventId = parseInt(req.query.event_id, 10) || 0;
    const [rows] = await dbPool.query(
      `SELECT t.id, t.event_id, t.user_id, t.telegram_id, t.email,
              t.ticket_number, t.is_winner, t.created_at,
              u.full_name, u.rl_full_name, u.username
         FROM wl_event_raffle_tickets t
         LEFT JOIN users u ON u.user_id = t.telegram_id
        WHERE t.event_id = ?
        ORDER BY t.ticket_number ASC`,
      [eventId]
    );
    res.json({ tickets: rows, total: rows.length });
  } catch (err) { next(err); }
});

router.post('/v2/draw', async (req, res, next) => {
  try {
    const eventId = parseInt(req.body?.event_id, 10) || 0;
    const count = Math.max(1, parseInt(req.body?.count, 10) || 1);
    const [winners] = await dbPool.query(
      `SELECT t.ticket_number, t.telegram_id, t.email,
              u.full_name, u.rl_full_name, u.username
         FROM wl_event_raffle_tickets t
         LEFT JOIN users u ON u.user_id = t.telegram_id
        WHERE t.event_id = ?
        ORDER BY RAND() LIMIT ?`,
      [eventId, count]
    );
    res.json({ winners, requested: count, drawn: winners.length });
  } catch (err) { next(err); }
});

router.post('/v2/mark-winners', async (req, res, next) => {
  try {
    const eventId = parseInt(req.body?.event_id, 10) || 0;
    const numbers = Array.isArray(req.body?.ticket_numbers)
      ? req.body.ticket_numbers.map(Number).filter(Number.isFinite) : [];
    if (!numbers.length) return res.status(400).json({ error: 'ticket_numbers required' });
    await dbPool.query(
      'UPDATE wl_event_raffle_tickets SET is_winner=1 WHERE event_id=? AND ticket_number IN (?)',
      [eventId, numbers]
    );
    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'update', 'raffle_v2', `event:${eventId}`,
      `Розыгрыш v2: ${numbers.length} победителей`, null, { event_id: eventId, ticket_numbers: numbers });
    res.json({ ok: true, marked: numbers.length });
  } catch (err) { next(err); }
});

export default router;
