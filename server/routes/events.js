import { Router } from 'express';
import QRCode from 'qrcode';
import dbPool from '../config/db.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getSettings() {
  const [rows] = await dbPool.query("SELECT data FROM texts WHERE category = 'event_settings' LIMIT 1");
  if (!rows.length) return { prize_limit: 1 };
  const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  return data;
}

async function saveSettings(settings) {
  const [rows] = await dbPool.query("SELECT id FROM texts WHERE category = 'event_settings' LIMIT 1");
  if (rows.length) {
    await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(settings), rows[0].id]);
  } else {
    await dbPool.query('INSERT INTO texts (category, data) VALUES (?, ?)', ['event_settings', JSON.stringify(settings)]);
  }
}

// ─── GET /api/events/codes — список пользователей с QR ─────────────────────

router.get('/codes', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const search = (req.query.search || '').trim();
    const status = req.query.status || ''; // 'scanned' | 'not_scanned' | ''

    let where = 'WHERE u.show_qr = 1';
    const params = [];

    if (search) {
      where += ' AND (u.full_name LIKE ? OR u.username LIKE ? OR u.user_id LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    // Count total
    const [[{ total }]] = await dbPool.query(
      `SELECT COUNT(*) as total FROM users u ${where}`, params
    );

    // Get users with scan stats
    let havingClause = '';
    if (status === 'scanned') havingClause = 'HAVING scan_count > 0';
    else if (status === 'not_scanned') havingClause = 'HAVING scan_count = 0';

    const [rows] = await dbPool.query(`
      SELECT u.user_id, u.full_name, u.username, u.rl_full_name,
        COUNT(s.id) AS scan_count,
        MAX(s.scanned_at) AS last_scan_at
      FROM users u
      LEFT JOIN wl_admin_event_scans s ON s.user_id = u.user_id
      ${where}
      GROUP BY u.user_id
      ${havingClause}
      ORDER BY u.date_reg DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const codes = rows.map(r => ({
      userId: r.user_id,
      fullName: r.rl_full_name || r.full_name || '—',
      username: r.username || null,
      scanCount: Number(r.scan_count),
      lastScanAt: r.last_scan_at ? new Date(r.last_scan_at).toISOString() : null,
    }));

    res.json({ codes, total, limit, offset });
  } catch (err) { next(err); }
});

// ─── GET /api/events/codes/:userId/qr — генерация QR-кода PNG ──────────────

router.get('/codes/:userId/qr', async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const buffer = await QRCode.toBuffer(String(userId), {
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
});

// ─── POST /api/events/scan — сканирование (публичный, вызывается из хостес) ─

export async function scanHandler(req, res, next) {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const uid = Number(user_id);

    // Check user exists
    const [users] = await dbPool.query(
      'SELECT user_id, full_name, rl_full_name, username FROM users WHERE user_id = ?', [uid]
    );
    if (!users.length) {
      return res.json({ status: 'not_found', message: 'Пользователь не найден' });
    }

    const userName = users[0].rl_full_name || users[0].full_name || `ID ${uid}`;

    // Check prize limit
    const settings = await getSettings();
    const prizeLimit = Number(settings.prize_limit) || 0; // 0 = unlimited

    const [[{ scanCount }]] = await dbPool.query(
      'SELECT COUNT(*) as scanCount FROM wl_admin_event_scans WHERE user_id = ? AND prize_given = 1',
      [uid]
    );

    if (prizeLimit > 0 && scanCount >= prizeLimit) {
      return res.json({
        status: 'already',
        scan_count: scanCount,
        user_name: userName,
        message: 'Гость уже получил приз',
      });
    }

    // Record scan
    await dbPool.query(
      'INSERT INTO wl_admin_event_scans (user_id, prize_given) VALUES (?, 1)',
      [uid]
    );

    res.json({
      status: 'give',
      scan_count: scanCount + 1,
      user_name: userName,
      message: 'Выдайте гостю приз',
    });
  } catch (err) { next(err); }
}
router.post('/scan', scanHandler);

// ─── GET /api/events/stats — статистика ─────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const from = req.query.from || null;
    const to = req.query.to || null;

    let dateFilter = '';
    const params = [];
    if (from) { dateFilter += ' AND s.scanned_at >= ?'; params.push(from); }
    if (to) { dateFilter += ' AND s.scanned_at <= ?'; params.push(to + ' 23:59:59'); }

    // Total codes (users with show_qr)
    const [[{ totalCodes }]] = await dbPool.query(
      'SELECT COUNT(*) as totalCodes FROM users WHERE show_qr = 1'
    );

    // Total scans
    const [[{ totalScans }]] = await dbPool.query(
      `SELECT COUNT(*) as totalScans FROM wl_admin_event_scans s WHERE 1=1 ${dateFilter}`, params
    );

    // Unique guests
    const [[{ uniqueGuests }]] = await dbPool.query(
      `SELECT COUNT(DISTINCT user_id) as uniqueGuests FROM wl_admin_event_scans s WHERE 1=1 ${dateFilter}`, params
    );

    // Prizes given
    const [[{ prizesGiven }]] = await dbPool.query(
      `SELECT COUNT(*) as prizesGiven FROM wl_admin_event_scans s WHERE prize_given = 1 ${dateFilter}`, params
    );

    // Scans today
    const [[{ scansToday }]] = await dbPool.query(
      'SELECT COUNT(*) as scansToday FROM wl_admin_event_scans WHERE DATE(scanned_at) = CURDATE()'
    );

    res.json({ totalCodes, totalScans, uniqueGuests, prizesGiven, scansToday });
  } catch (err) { next(err); }
});

// ─── GET /api/events/scans — история сканирований ───────────────────────────

router.get('/scans', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const [[{ total }]] = await dbPool.query('SELECT COUNT(*) as total FROM wl_admin_event_scans');

    const [rows] = await dbPool.query(`
      SELECT s.id, s.user_id, s.scanned_at, s.prize_given,
        u.full_name, u.rl_full_name, u.username
      FROM wl_admin_event_scans s
      LEFT JOIN users u ON u.user_id = s.user_id
      ORDER BY s.scanned_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const scans = rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      fullName: r.rl_full_name || r.full_name || '—',
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
    const updated = { ...current, ...req.body };
    // Sanitize
    if (updated.prize_limit !== undefined) updated.prize_limit = Math.max(0, Number(updated.prize_limit) || 0);
    await saveSettings(updated);
    res.json({ ok: true, settings: updated });
  } catch (err) { next(err); }
});

export default router;
