import { Router } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import dbPool from '../config/db.js';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateCode() {
  // 8-значный уникальный код: EVT-XXXXXXXX
  return 'EVT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

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

// ─── GET /api/events/codes — список сгенерированных QR-кодов ────────────────

router.get('/codes', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const search = (req.query.search || '').trim();
    const status = req.query.status || ''; // 'scanned' | 'not_scanned' | ''

    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      where += ' AND (c.code LIKE ? OR c.label LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like);
    }

    // Count total
    const [[{ total }]] = await dbPool.query(
      `SELECT COUNT(*) as total FROM wl_admin_event_codes c ${where}`, params
    );

    // Get codes with scan stats
    let havingClause = '';
    if (status === 'scanned') havingClause = 'HAVING scan_count > 0';
    else if (status === 'not_scanned') havingClause = 'HAVING scan_count = 0';

    const [rows] = await dbPool.query(`
      SELECT c.id, c.code, c.label, c.created_at,
        COUNT(s.id) AS scan_count,
        MAX(s.scanned_at) AS last_scan_at
      FROM wl_admin_event_codes c
      LEFT JOIN wl_admin_event_scans s ON s.code = c.code
      ${where}
      GROUP BY c.id
      ${havingClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const codes = rows.map(r => ({
      id: r.id,
      code: r.code,
      label: r.label || '',
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      scanCount: Number(r.scan_count),
      lastScanAt: r.last_scan_at ? new Date(r.last_scan_at).toISOString() : null,
    }));

    res.json({ codes, total, limit, offset });
  } catch (err) { next(err); }
});

// ─── POST /api/events/codes/generate — сгенерировать новые QR-коды ──────────

router.post('/codes/generate', async (req, res, next) => {
  try {
    const count = Math.min(Math.max(Number(req.body.count) || 1, 1), 100);
    const label = (req.body.label || '').trim();

    const generated = [];
    for (let i = 0; i < count; i++) {
      let code;
      let attempts = 0;
      // Ensure unique
      while (attempts < 10) {
        code = generateCode();
        const [existing] = await dbPool.query('SELECT id FROM wl_admin_event_codes WHERE code = ?', [code]);
        if (!existing.length) break;
        attempts++;
      }
      await dbPool.query(
        'INSERT INTO wl_admin_event_codes (code, label) VALUES (?, ?)',
        [code, label]
      );
      generated.push(code);
    }

    res.json({ ok: true, count: generated.length, codes: generated });
  } catch (err) { next(err); }
});

// ─── DELETE /api/events/codes/:id — удалить QR-код ──────────────────────────

router.delete('/codes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await dbPool.query('DELETE FROM wl_admin_event_codes WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET /api/events/codes/:code/qr — генерация QR-кода PNG ────────────────

router.get('/codes/:code/qr', async (req, res, next) => {
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
});

// ─── POST /api/events/scan — сканирование (публичный, вызывается из хостес) ─

export async function scanHandler(req, res, next) {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const scannedValue = String(user_id).trim();

    // Check if it's an event code (EVT-XXXXXXXX)
    const [eventCodes] = await dbPool.query(
      'SELECT id, code, label FROM wl_admin_event_codes WHERE code = ?', [scannedValue]
    );

    if (eventCodes.length) {
      // It's a generated event code
      const eventCode = eventCodes[0];
      const codeName = eventCode.label || eventCode.code;

      // Check prize limit
      const settings = await getSettings();
      const prizeLimit = Number(settings.prize_limit) || 0;

      const [[{ scanCount }]] = await dbPool.query(
        'SELECT COUNT(*) as scanCount FROM wl_admin_event_scans WHERE code = ? AND prize_given = 1',
        [scannedValue]
      );

      if (prizeLimit > 0 && scanCount >= prizeLimit) {
        return res.json({
          status: 'already',
          scan_count: scanCount,
          user_name: codeName,
          message: 'Код уже использован',
        });
      }

      // Record scan
      await dbPool.query(
        'INSERT INTO wl_admin_event_scans (code, prize_given) VALUES (?, 1)',
        [scannedValue]
      );

      return res.json({
        status: 'give',
        scan_count: scanCount + 1,
        user_name: codeName,
        message: 'Выдайте гостю приз',
      });
    }

    // Fallback: check if it's a user_id (numeric)
    const uid = Number(scannedValue);
    if (!isNaN(uid) && uid > 0) {
      const [users] = await dbPool.query(
        'SELECT user_id, full_name, rl_full_name, username FROM users WHERE user_id = ?', [uid]
      );
      if (users.length) {
        const userName = users[0].rl_full_name || users[0].full_name || `ID ${uid}`;

        const settings = await getSettings();
        const prizeLimit = Number(settings.prize_limit) || 0;

        const [[{ scanCount }]] = await dbPool.query(
          'SELECT COUNT(*) as scanCount FROM wl_admin_event_scans WHERE code = ? AND prize_given = 1',
          [scannedValue]
        );

        if (prizeLimit > 0 && scanCount >= prizeLimit) {
          return res.json({
            status: 'already',
            scan_count: scanCount,
            user_name: userName,
            message: 'Гость уже получил приз',
          });
        }

        await dbPool.query(
          'INSERT INTO wl_admin_event_scans (code, prize_given) VALUES (?, 1)',
          [scannedValue]
        );

        return res.json({
          status: 'give',
          scan_count: scanCount + 1,
          user_name: userName,
          message: 'Выдайте гостю приз',
        });
      }
    }

    return res.json({ status: 'not_found', message: 'Код не найден' });
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

    // Total generated codes
    const [[{ totalCodes }]] = await dbPool.query(
      'SELECT COUNT(*) as totalCodes FROM wl_admin_event_codes'
    );

    // Total scans
    const [[{ totalScans }]] = await dbPool.query(
      `SELECT COUNT(*) as totalScans FROM wl_admin_event_scans s WHERE 1=1 ${dateFilter}`, params
    );

    // Unique codes scanned
    const [[{ uniqueGuests }]] = await dbPool.query(
      `SELECT COUNT(DISTINCT code) as uniqueGuests FROM wl_admin_event_scans s WHERE 1=1 ${dateFilter}`, params
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
      SELECT s.id, s.code, s.scanned_at, s.prize_given,
        c.label AS code_label,
        u.full_name, u.rl_full_name, u.username
      FROM wl_admin_event_scans s
      LEFT JOIN wl_admin_event_codes c ON c.code = s.code
      LEFT JOIN users u ON u.user_id = CAST(s.code AS UNSIGNED)
      ORDER BY s.scanned_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const scans = rows.map(r => ({
      id: r.id,
      code: r.code,
      label: r.code_label || r.rl_full_name || r.full_name || r.code,
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
    if (updated.prize_limit !== undefined) updated.prize_limit = Math.max(0, Number(updated.prize_limit) || 0);
    await saveSettings(updated);
    res.json({ ok: true, settings: updated });
  } catch (err) { next(err); }
});

export default router;
