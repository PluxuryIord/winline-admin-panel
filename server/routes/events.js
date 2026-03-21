import { Router } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import dbPool from '../config/db.js';

const router = Router();

// ─── Auto-migrate tables ────────────────────────────────────────────────────

// Tables wl_event_codes and wl_admin_event_scans are pre-created

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateCode() {
  return 'EVT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function getSettings() {
  const [rows] = await dbPool.query("SELECT data FROM texts WHERE category = 'event_settings' LIMIT 1");
  const base = { event_starts: false, code_limit: 0 };
  if (rows.length) {
    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    Object.assign(base, data);
  }
  // Always read event_starts from bot's settings table (source of truth)
  try {
    const [botSettings] = await dbPool.query('SELECT event_starts FROM settings LIMIT 1');
    if (botSettings.length) {
      base.event_starts = !!botSettings[0].event_starts;
    }
  } catch (e) { /* settings table may not exist */ }
  return base;
}

async function saveSettings(settings) {
  const [rows] = await dbPool.query("SELECT id FROM texts WHERE category = 'event_settings' LIMIT 1");
  if (rows.length) {
    await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(settings), rows[0].id]);
  } else {
    await dbPool.query('INSERT INTO texts (category, description, data) VALUES (?, ?, ?)', ['event_settings', 'Event settings', JSON.stringify(settings)]);
  }
}


// ─── GET /api/events/codes — список кодов с юзерами ─────────────────────────

router.get('/codes', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const search = (req.query.search || '').trim();
    const status = req.query.status || ''; // 'active' | 'used' | ''

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (c.code LIKE ? OR c.label LIKE ? OR u.full_name LIKE ? OR u.username LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (status === 'active' || status === 'used') {
      where += ' AND c.status = ?';
      params.push(status);
    }

    // Count total
    const [[{ total }]] = await dbPool.query(
      `SELECT COUNT(*) as total FROM wl_event_codes c LEFT JOIN users u ON u.user_id = c.user_id ${where}`, params
    );

    // Get codes with user info
    const [rows] = await dbPool.query(`
      SELECT c.id, c.code, c.label, c.user_id, c.status, c.created_at, c.used_at,
        u.full_name, u.rl_full_name, u.username
      FROM wl_event_codes c
      LEFT JOIN users u ON u.user_id = c.user_id
      ${where}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const codes = rows.map(r => ({
      id: r.id,
      code: r.code,
      label: r.label || '',
      userId: r.user_id,
      userName: r.rl_full_name || r.full_name || null,
      username: r.username || null,
      status: r.status || 'active',
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      usedAt: r.used_at ? new Date(r.used_at).toISOString() : null,
    }));

    res.json({ codes, total, limit, offset });
  } catch (err) { next(err); }
});

// ─── PATCH /api/events/codes/:id/status — toggle active↔used ────────────────

router.patch('/codes/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!['active', 'used'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status, must be active or used' });
    }

    const usedAt = status === 'used' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
    await dbPool.query(
      'UPDATE wl_event_codes SET status = ?, used_at = ? WHERE id = ?',
      [status, usedAt, id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── DELETE /api/events/codes/all — сбросить все коды (новое мероприятие) ────

router.delete('/codes/all', async (req, res, next) => {
  try {
    const [[{ count }]] = await dbPool.query('SELECT COUNT(*) as count FROM wl_event_codes');
    await dbPool.query('DELETE FROM wl_event_codes');
    await dbPool.query('DELETE FROM wl_admin_event_scans');
    res.json({ ok: true, deleted: count });
  } catch (err) { next(err); }
});

// ─── DELETE /api/events/codes/:id — удалить код ─────────────────────────────

router.delete('/codes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await dbPool.query('DELETE FROM wl_event_codes WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET /api/events/codes/:code/qr — генерация QR PNG ──────────────────────

export async function qrHandler(req, res, next) {
  try {
    const code = req.params.code;
    const buffer = await QRCode.toBuffer(String(code), {
      type: 'png',
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) { next(err); }
}
router.get('/codes/:code/qr', qrHandler);

// ─── POST /api/events/scan — сканирование (публичный) ────────────────────────

export async function scanHandler(req, res, next) {
  try {
    const { code: rawCode } = req.body;
    // Support both {code} and legacy {user_id} field
    const scannedValue = String(rawCode || req.body.user_id || '').trim();
    if (!scannedValue) return res.status(400).json({ error: 'code is required' });

    // Find code in event_codes
    const [codes] = await dbPool.query(
      `SELECT c.id, c.code, c.status, c.user_id, c.label,
        u.full_name, u.rl_full_name, u.username
       FROM wl_event_codes c
       LEFT JOIN users u ON u.user_id = c.user_id
       WHERE c.code = ?`,
      [scannedValue]
    );

    if (!codes.length) {
      return res.json({ status: 'not_found', message: 'Код не найден' });
    }

    const eventCode = codes[0];
    const userName = eventCode.rl_full_name || eventCode.full_name || eventCode.label || eventCode.code;

    if (eventCode.status === 'used') {
      return res.json({
        status: 'already',
        user_name: userName,
        message: 'Код уже использован',
      });
    }

    // Mark as used
    await dbPool.query(
      'UPDATE wl_event_codes SET status = ?, used_at = NOW() WHERE id = ?',
      ['used', eventCode.id]
    );

    // Record scan log
    await dbPool.query(
      'INSERT INTO wl_admin_event_scans (code, prize_given) VALUES (?, 1)',
      [scannedValue]
    );

    return res.json({
      status: 'give',
      user_name: userName,
      message: 'Выдайте гостю приз',
    });
  } catch (err) { next(err); }
}
router.post('/scan', scanHandler);

// ─── GET /api/events/stats — статистика ─────────────────────────────────────

export async function statsHandler(req, res, next) {
  try {
    const from = req.query.from || null;
    const to = req.query.to || null;

    let dateFilter = '';
    const params = [];
    if (from) { dateFilter += ' AND c.created_at >= ?'; params.push(from); }
    if (to) { dateFilter += ' AND c.created_at <= ?'; params.push(to + ' 23:59:59'); }

    const [[{ totalCodes }]] = await dbPool.query(
      `SELECT COUNT(*) as totalCodes FROM wl_event_codes c WHERE 1=1 ${dateFilter}`, params
    );

    const [[{ activeCodes }]] = await dbPool.query(
      `SELECT COUNT(*) as activeCodes FROM wl_event_codes c WHERE status = 'active' ${dateFilter}`, params
    );

    const [[{ usedCodes }]] = await dbPool.query(
      `SELECT COUNT(*) as usedCodes FROM wl_event_codes c WHERE status = 'used' ${dateFilter}`, params
    );

    const [[{ scansToday }]] = await dbPool.query(
      'SELECT COUNT(*) as scansToday FROM wl_admin_event_scans WHERE DATE(scanned_at) = CURDATE()'
    );

    const settings = await getSettings();

    res.json({ totalCodes, activeCodes, usedCodes, scansToday, codeLimit: settings.code_limit || 0 });
  } catch (err) { next(err); }
}
router.get('/stats', statsHandler);

// ─── GET /api/events/scans — история сканирований ───────────────────────────

router.get('/scans', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const [[{ total }]] = await dbPool.query('SELECT COUNT(*) as total FROM wl_admin_event_scans');

    const [rows] = await dbPool.query(`
      SELECT s.id, s.code, s.scanned_at, s.prize_given,
        c.label AS code_label, c.user_id,
        u.full_name, u.rl_full_name, u.username
      FROM wl_admin_event_scans s
      LEFT JOIN wl_event_codes c ON c.code = s.code
      LEFT JOIN users u ON u.user_id = c.user_id
      ORDER BY s.scanned_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const scans = rows.map(r => ({
      id: r.id,
      code: r.code,
      label: r.rl_full_name || r.full_name || r.code_label || r.code,
      username: r.username || null,
      scannedAt: r.scanned_at ? new Date(r.scanned_at).toISOString() : null,
      prizeGiven: !!r.prize_given,
    }));

    res.json({ scans, total, limit, offset });
  } catch (err) { next(err); }
});

// ─── GET /api/events/settings ───────────────────────────────────────────────

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) { next(err); }
});

// ─── PUT /api/events/settings ───────────────────────────────────────────────

router.put('/settings', async (req, res, next) => {
  try {
    const current = await getSettings();
    const updated = { ...current };
    if (req.body.code_limit !== undefined) updated.code_limit = Math.max(0, Number(req.body.code_limit) || 0);
    if (req.body.event_starts !== undefined) updated.event_starts = !!req.body.event_starts;
    if (req.body.qr_caption_text !== undefined) updated.qr_caption_text = String(req.body.qr_caption_text || '');
    await saveSettings(updated);
    res.json({ ok: true, settings: updated });
  } catch (err) { next(err); }
});

// ─── PUT /api/events/toggle — вкл/выкл мероприятие ──────────────────────────

router.put('/toggle', async (req, res, next) => {
  try {
    const { enabled } = req.body;
    const eventStarts = !!enabled;

    // 1. Update event_settings
    const settings = await getSettings();
    settings.event_starts = eventStarts;
    await saveSettings(settings);

    // 2. Update bot's settings table
    try {
      await dbPool.query('UPDATE settings SET event_starts = ? LIMIT 1', [eventStarts ? 1 : 0]);
    } catch (e) {
      console.warn('[events] Could not update settings.event_starts:', e.message);
    }

    res.json({ ok: true, event_starts: eventStarts });
  } catch (err) { next(err); }
});

export default router;
