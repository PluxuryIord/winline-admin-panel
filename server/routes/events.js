import { Router } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';
import dbPool from '../config/db.js';
import { BOT_API_URL } from '../config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createSheetForQuestions, getSpreadsheetUrl } from '../services/googleSheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const QR_TEMPLATE_PATH = path.join(ASSETS_DIR, 'qr-template.jpg');
const FONT_PATH = path.join(ASSETS_DIR, 'pfdintextcomppro-bold.ttf');

// Preload font as base64 for SVG embedding
const FONT_BASE64 = fs.existsSync(FONT_PATH) ? fs.readFileSync(FONT_PATH).toString('base64') : '';

const router = Router();

// ─── Auto-migrate tables ────────────────────────────────────────────────────

// Tables wl_event_codes and wl_admin_event_scans are pre-created.
// Side-table holds v2 per-code metadata (env disallows ALTER on wl_event_codes):
(async () => {
  try {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS wl_event_code_meta (
      code VARCHAR(32) PRIMARY KEY,
      kind VARCHAR(20) NOT NULL DEFAULT 'merch',
      raffle_participant TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) { console.warn('[events] meta table:', e.message); }
})();

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateCode() {
  return 'EVT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function getSettings() {
  const [rows] = await dbPool.query("SELECT data FROM texts WHERE category = 'event_settings' LIMIT 1");
  const base = { event_starts: false, code_limit: 0, qr_bg_url: '', qr_caption_text: '', raffle_hidden: false };
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

    const [rows] = await dbPool.query(`
      SELECT c.id, c.code, c.label, c.user_id, c.status, c.created_at, c.used_at,
        m.kind, m.raffle_participant,
        u.full_name, u.rl_full_name, u.username
      FROM wl_event_codes c
      LEFT JOIN wl_event_code_meta m ON m.code = c.code
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
      kind: r.kind || 'merch',
      raffleParticipant: !!r.raffle_participant,
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
      color: { dark: '#FF6A13', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) { next(err); }
}
router.get('/codes/:code/qr', qrHandler);

// ─── GET /api/events/codes/:code/qr-card — карточка: фон + QR + текст ────────

export async function qrCardHandler(req, res, next) {
  try {
    const code = req.params.code;
    const settings = await getSettings();
    const captionText = settings.qr_caption_text || '';
    const bgUrl = settings.qr_bg_url || '';

    // Template dimensions (match qr.jpg aspect ratio ~530x800)
    const CARD_W = 530;
    const CARD_H = 800;
    const QR_SIZE = 320;
    const QR_TOP = 200;

    // 1. Background — custom URL or default template
    let bg;
    if (bgUrl) {
      try {
        const bgRes = await fetch(bgUrl);
        const bgBuf = Buffer.from(await bgRes.arrayBuffer());
        bg = await sharp(bgBuf).resize(CARD_W, CARD_H, { fit: 'cover' }).png().toBuffer();
      } catch {
        // Fallback to template on fetch error
        if (fs.existsSync(QR_TEMPLATE_PATH)) {
          bg = await sharp(QR_TEMPLATE_PATH).resize(CARD_W, CARD_H, { fit: 'cover' }).png().toBuffer();
        } else {
          bg = await sharp({ create: { width: CARD_W, height: CARD_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } }).png().toBuffer();
        }
      }
    } else if (fs.existsSync(QR_TEMPLATE_PATH)) {
      bg = await sharp(QR_TEMPLATE_PATH).resize(CARD_W, CARD_H, { fit: 'cover' }).png().toBuffer();
    } else {
      bg = await sharp({ create: { width: CARD_W, height: CARD_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } }).png().toBuffer();
    }

    // 2. QR code — orange on transparent, then we'll composite on black bg
    const qrDataUrl = await QRCode.toDataURL(String(code), {
      type: 'image/png',
      width: QR_SIZE,
      margin: 2,
      color: { dark: '#FF6A13', light: '#00000000' },
      errorCorrectionLevel: 'H',
    });
    const qrBase64 = qrDataUrl.split(',')[1];
    const qrRawBuffer = Buffer.from(qrBase64, 'base64');

    // Create rounded QR: overlay QR on transparent, then apply rounded corners via SVG mask
    const qrWithRounding = await sharp(qrRawBuffer)
      .resize(QR_SIZE, QR_SIZE)
      .png()
      .toBuffer();

    // 3. Build composites
    const composites = [
      {
        input: qrWithRounding,
        left: Math.round((CARD_W - QR_SIZE) / 2),
        top: QR_TOP,
      },
    ];

    // 4. Text overlay using TT Bluescreens Bold via SVG — centered between QR bottom and card bottom
    if (captionText) {
      const escaped = captionText
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      const lines = escaped.split('\n');
      const fontSize = 72;
      const lineH = fontSize + 16;
      const textBlockH = lines.length * lineH;

      // Center text vertically in the space between QR bottom and card bottom
      const spaceTop = QR_TOP + QR_SIZE;
      const availableH = CARD_H - spaceTop;
      const textTop = spaceTop + Math.round((availableH - textBlockH) / 2);
      const svgH = textBlockH + 20;

      const tspans = lines.map((line, i) =>
        `<tspan x="50%" dy="${i === 0 ? 0 : lineH}">${line}</tspan>`
      ).join('');

      const svgText = Buffer.from(`
        <svg width="${CARD_W}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
          <defs><style>
            @font-face { font-family: 'PFDinTextCompPro'; src: url('data:font/truetype;base64,${FONT_BASE64}') format('truetype'); font-weight: bold; }
          </style></defs>
          <text x="50%" y="${fontSize + 4}" font-family="PFDinTextCompPro, Arial, sans-serif" font-size="${fontSize}"
            font-weight="bold" fill="#FFFFFF" text-anchor="middle">${tspans}</text>
        </svg>
      `);

      composites.push({ input: svgText, left: 0, top: textTop });
    }

    // 5. Compose
    const result = await sharp(bg).composite(composites).png().toBuffer();

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(result);
  } catch (err) { next(err); }
}
router.get('/codes/:code/qr-card', qrCardHandler);

// ─── POST /api/events/scan — сканирование (публичный) ────────────────────────

export async function scanHandler(req, res, next) {
  try {
    const { code: rawCode } = req.body;
    // Support both {code} and legacy {user_id} field
    const scannedValue = String(rawCode || req.body.user_id || '').trim();
    if (!scannedValue) return res.status(400).json({ error: 'code is required' });

    const [codes] = await dbPool.query(
      `SELECT c.id, c.code, c.status, c.user_id, c.label,
        m.kind,
        u.full_name, u.rl_full_name, u.username
       FROM wl_event_codes c
       LEFT JOIN wl_event_code_meta m ON m.code = c.code
       LEFT JOIN users u ON u.user_id = c.user_id
       WHERE c.code = ?`,
      [scannedValue]
    );

    if (!codes.length) {
      return res.json({ status: 'not_found', message: 'Код не найден' });
    }

    const eventCode = codes[0];
    const userName = eventCode.rl_full_name || eventCode.full_name || eventCode.label || eventCode.code;

    if (eventCode.kind === 'raffle_only') {
      return res.json({ status: 'raffle_only', user_name: userName, message: 'Этот код только для розыгрыша — мерч не выдаётся' });
    }

    // Atomic claim: only the caller whose UPDATE flips status='active'→'used' wins.
    // Protects against double-scans from retries on flaky network.
    const [updateResult] = await dbPool.query(
      "UPDATE wl_event_codes SET status = 'used', used_at = NOW() WHERE id = ? AND status = 'active'",
      [eventCode.id]
    );

    if (updateResult.affectedRows === 0) {
      return res.json({
        status: 'already',
        user_name: userName,
        message: 'Код уже использован',
      });
    }

    // Record scan log (only the winning caller reaches here)
    await dbPool.query(
      'INSERT INTO wl_admin_event_scans (code, prize_given) VALUES (?, 1)',
      [scannedValue]
    );

    // Push registration promo to user (scenario 3 «Не работаю»: после мерча → промо)
    if (BOT_API_URL && eventCode.user_id) {
      fetch(`${BOT_API_URL}/event/merch-given`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: eventCode.user_id }),
      }).catch(err => console.warn('[scan] merch-given push failed:', err.message));
    }

    return res.json({
      status: 'give',
      user_name: userName,
      message: 'Выдайте гостю приз',
    });
  } catch (err) { next(err); }
}
router.post('/scan', scanHandler);

// ─── POST /api/events/test-qr — создать тестовый QR-код ──────────────────────

router.post('/test-qr', async (req, res, next) => {
  try {
    const testCode = 'TEST-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // Insert test code
    await dbPool.query(
      'INSERT INTO wl_event_codes (code, label, user_id, status) VALUES (?, ?, ?, ?)',
      [testCode, 'Тестовый код', 0, 'active']
    );

    // Return card URL
    const cardUrl = `/api/events/codes/${testCode}/qr-card`;
    res.json({ ok: true, code: testCode, cardUrl });
  } catch (err) { next(err); }
});

// ─── DELETE /api/events/test-qr — удалить все тестовые коды ──────────────────

router.delete('/test-qr', async (req, res, next) => {
  try {
    const [result] = await dbPool.query(
      "DELETE FROM wl_event_codes WHERE code LIKE 'TEST-%'"
    );
    // Also clean scan logs for test codes
    await dbPool.query(
      "DELETE FROM wl_admin_event_scans WHERE code LIKE 'TEST-%'"
    );
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) { next(err); }
});

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
    if (req.body.qr_bg_url !== undefined) updated.qr_bg_url = String(req.body.qr_bg_url || '');
    if (req.body.raffle_hidden !== undefined) updated.raffle_hidden = !!req.body.raffle_hidden;
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

// ─── Anketa Questions CRUD ──────────────────────────────────────────────────

// Auto-create a new Google Sheet tab when questions change
async function autoCreateSheet() {
  try {
    const [rows] = await dbPool.query(
      'SELECT question_text FROM event_questions WHERE is_active = 1 ORDER BY `order` ASC'
    );
    const questions = rows.map(r => r.question_text);
    if (questions.length === 0) return;
    const title = await createSheetForQuestions(questions);
    if (title) console.log(`[events] Auto-created sheet "${title}" after question change`);
  } catch (err) {
    console.error('[events] Auto-create sheet failed:', err.message);
  }
}

// Ensure table exists (lazy, called before first query)
let _tableReady = false;
async function ensureQuestionsTable() {
  if (_tableReady) return;
  try {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS event_questions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      question_text TEXT NOT NULL,
      question_type VARCHAR(20) NOT NULL DEFAULT 'text',
      options JSON DEFAULT NULL,
      \`order\` INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    _tableReady = true;
    console.log('[events] event_questions table ready');
  } catch (err) {
    console.error('[events] Failed to create event_questions table:', err.message);
    throw err;
  }
}

// GET /api/events/questions
router.get('/questions', async (req, res, next) => {
  try {
    await ensureQuestionsTable();
    const [rows] = await dbPool.query('SELECT id, question_text, question_type, options, `order`, is_active FROM event_questions ORDER BY `order` ASC');
    res.json(rows.map(r => ({
      ...r,
      options: typeof r.options === 'string' ? JSON.parse(r.options) : (r.options || null),
      is_active: !!r.is_active,
    })));
  } catch (err) { next(err); }
});

// POST /api/events/questions
router.post('/questions', async (req, res, next) => {
  try {
    await ensureQuestionsTable();
    const { question_text, question_type = 'text', options = null } = req.body;
    if (!question_text?.trim()) return res.status(400).json({ error: 'question_text required' });
    const [maxRow] = await dbPool.query('SELECT COALESCE(MAX(`order`), 0) AS mx FROM event_questions');
    const nextOrder = (maxRow[0]?.mx || 0) + 1;
    const [result] = await dbPool.query(
      'INSERT INTO event_questions (question_text, question_type, options, `order`, is_active) VALUES (?, ?, ?, ?, 1)',
      [question_text.trim(), question_type, options ? JSON.stringify(options) : null, nextOrder]
    );
    res.json({ id: result.insertId, question_text: question_text.trim(), question_type, options, order: nextOrder, is_active: true });
    autoCreateSheet(); // fire-and-forget
  } catch (err) { next(err); }
});

// PUT /api/events/questions/reorder — [{id, order}, ...] (MUST be before :id)
router.put('/questions/reorder', async (req, res, next) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array expected' });
    for (const item of items) {
      await dbPool.query('UPDATE event_questions SET `order` = ? WHERE id = ?', [item.order, item.id]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/events/questions/:id
router.put('/questions/:id', async (req, res, next) => {
  try {
    await ensureQuestionsTable();
    const id = Number(req.params.id);
    const updates = [];
    const params = [];
    if (req.body.question_text !== undefined) { updates.push('question_text = ?'); params.push(req.body.question_text); }
    if (req.body.question_type !== undefined) { updates.push('question_type = ?'); params.push(req.body.question_type); }
    if (req.body.options !== undefined) { updates.push('options = ?'); params.push(req.body.options ? JSON.stringify(req.body.options) : null); }
    if (req.body.order !== undefined) { updates.push('`order` = ?'); params.push(Number(req.body.order)); }
    if (req.body.is_active !== undefined) { updates.push('is_active = ?'); params.push(req.body.is_active ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(id);
    await dbPool.query(`UPDATE event_questions SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
    // Auto-create sheet if question content changed (not just reorder/toggle)
    if (req.body.question_text !== undefined || req.body.question_type !== undefined || req.body.options !== undefined) {
      autoCreateSheet();
    }
  } catch (err) { next(err); }
});

// DELETE /api/events/questions/:id
router.delete('/questions/:id', async (req, res, next) => {
  try {
    await ensureQuestionsTable();
    const id = Number(req.params.id);
    console.log('[events] Deleting question id:', id);
    // Try to delete related answers first (bot may have created FK tables)
    try { await dbPool.query('DELETE FROM event_anketa_answers WHERE question_id = ?', [id]); } catch {}
    try { await dbPool.query('DELETE FROM event_answers WHERE question_id = ?', [id]); } catch {}
    const [result] = await dbPool.query('DELETE FROM event_questions WHERE id = ?', [id]);
    console.log('[events] Delete result:', JSON.stringify(result));
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: 'Вопрос не найден в БД', id });
    }
    res.json({ ok: true, deleted: id });
    autoCreateSheet(); // fire-and-forget
  } catch (err) {
    console.error('[events] Delete question error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});



// GET /api/events/spreadsheet-url — get Google Sheets link
router.get('/spreadsheet-url', async (req, res) => {
  const settings = await getSettings();
  res.json({ url: settings.spreadsheet_url || getSpreadsheetUrl() || null });
});

// PUT /api/events/spreadsheet-url — save Google Sheets link
router.put('/spreadsheet-url', async (req, res) => {
  const { url } = req.body;
  const settings = await getSettings();
  settings.spreadsheet_url = (url || '').trim();
  await saveSettings(settings);
  res.json({ ok: true });
});

// POST /api/events/questions/new-sheet — create new sheet tab with current questions
router.post('/questions/new-sheet', async (req, res, next) => {
  try {
    await ensureQuestionsTable();
    const [rows] = await dbPool.query(
      'SELECT question_text FROM event_questions WHERE is_active = 1 ORDER BY `order` ASC'
    );
    const questions = rows.map(r => r.question_text);
    if (questions.length === 0) return res.status(400).json({ error: 'Нет активных вопросов' });
    const sheetTitle = await createSheetForQuestions(questions);
    if (!sheetTitle) return res.status(500).json({ error: 'Google Sheets не настроен или ошибка' });
    res.json({ ok: true, sheetTitle });
  } catch (err) { next(err); }
});

export default router;
