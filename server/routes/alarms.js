import { Router } from 'express';
import dbPool from '../config/db.js';
import { logAudit } from '../services/auditLog.js';
import requireAdmin from '../middleware/requireAdmin.js';

const router = Router();

// ─── Trigger catalog ────────────────────────────────────────────────────────
// Fixed set of 6 triggers (agreed spec). The panel exposes them as editable
// cards; the bot (bot/utils/alarms.py) reads enabled rows from wl_alarm_rules.
// `has_threshold` drives the UI — rejected/approved fire on a status *change*,
// so they have no time threshold.
const CATALOG = [
  { trigger_type: 'email_unconfirmed', name: 'Email не подтверждён',
    has_threshold: true, threshold_value: 3, threshold_unit: 'days',
    message_text: '⚠️ Подтвердите email, чтобы получать выплаты.' },
  { trigger_type: 'no_site', name: 'Нет площадки',
    has_threshold: true, threshold_value: 24, threshold_unit: 'hours',
    message_text: '🚀 Создайте первую площадку, чтобы начать зарабатывать.' },
  { trigger_type: 'site_moderation', name: 'Площадка на модерации',
    has_threshold: true, threshold_value: 24, threshold_unit: 'hours',
    message_text: '⏳ Ваша площадка на модерации. Менеджер скоро её рассмотрит.' },
  { trigger_type: 'site_rejected', name: 'Площадка отклонена',
    has_threshold: false, threshold_value: null, threshold_unit: null,
    message_text: '❌ Площадка отклонена. Причина: {reason}. Поможем исправить — напишите в поддержку.' },
  { trigger_type: 'site_approved', name: 'Площадка одобрена',
    has_threshold: false, threshold_value: null, threshold_unit: null,
    message_text: '🎉 Поздравляем! Площадка прошла модерацию и готова к работе.' },
  { trigger_type: 'no_clicks', name: 'Нет трафика',
    has_threshold: true, threshold_value: 48, threshold_unit: 'hours',
    message_text: '📈 Запустите первый поток трафика на вашу площадку.' },
];
const CATALOG_BY_TYPE = Object.fromEntries(CATALOG.map((c) => [c.trigger_type, c]));
const VALID_UNITS = ['days', 'hours', 'minutes'];

// ─── Auto-migration: rules table (panel owns it) + seed the 6 rows ───────────
// Env disallows ALTER, so the table is created once with its final shape and
// only ever read/updated/seeded afterwards (INSERT IGNORE keeps edits).
(async () => {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_alarm_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trigger_type VARCHAR(40) NOT NULL,
        name VARCHAR(200) DEFAULT '',
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        threshold_value INT DEFAULT NULL,
        threshold_unit VARCHAR(10) DEFAULT NULL,
        message_text TEXT,
        buttons_json TEXT DEFAULT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_trigger (trigger_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    for (let i = 0; i < CATALOG.length; i++) {
      const c = CATALOG[i];
      await dbPool.query(
        `INSERT IGNORE INTO wl_alarm_rules
           (trigger_type, name, enabled, threshold_value, threshold_unit, message_text, sort_order)
         VALUES (?,?,0,?,?,?,?)`,
        [c.trigger_type, c.name, c.threshold_value, c.threshold_unit, c.message_text, i]
      );
    }
  } catch (e) {
    console.warn('[alarms] migrate rules:', e.message);
  }
})();

function parseButtons(json) {
  if (!json) return [];
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function shapeRule(row) {
  const cat = CATALOG_BY_TYPE[row.trigger_type] || {};
  return {
    id: row.id,
    trigger_type: row.trigger_type,
    name: row.name || cat.name || row.trigger_type,
    enabled: !!row.enabled,
    threshold_value: row.threshold_value,
    threshold_unit: row.threshold_unit,
    has_threshold: cat.has_threshold !== false,
    message_text: row.message_text || '',
    buttons: parseButtons(row.buttons_json),
    updated_at: row.updated_at,
  };
}

// GET /api/alarms — list the 6 rules (seeded in catalog order)
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT * FROM wl_alarm_rules ORDER BY sort_order ASC, id ASC');
    res.json({ rules: rows.map(shapeRule) });
  } catch (err) { next(err); }
});

// PUT /api/alarms/:id — update one rule (enabled / threshold / message / buttons)
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'bad id' });

    const [existingRows] = await dbPool.query('SELECT * FROM wl_alarm_rules WHERE id=? LIMIT 1', [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'rule not found' });
    const existing = existingRows[0];
    const cat = CATALOG_BY_TYPE[existing.trigger_type] || {};

    const { enabled, threshold_value, threshold_unit, message_text, buttons } = req.body || {};

    // Validate threshold (only for triggers that use one)
    let thrVal = existing.threshold_value;
    let thrUnit = existing.threshold_unit;
    if (cat.has_threshold !== false) {
      if (threshold_value !== undefined) {
        const n = parseInt(threshold_value, 10);
        if (!Number.isFinite(n) || n < 1 || n > 100000) {
          return res.status(400).json({ error: 'threshold_value 1..100000' });
        }
        thrVal = n;
      }
      if (threshold_unit !== undefined) {
        if (!VALID_UNITS.includes(threshold_unit)) {
          return res.status(400).json({ error: `threshold_unit one of ${VALID_UNITS.join(',')}` });
        }
        thrUnit = threshold_unit;
      }
    } else {
      thrVal = null; thrUnit = null;
    }

    const msg = message_text !== undefined ? String(message_text).slice(0, 4000) : existing.message_text;

    // Validate / normalize buttons → [{text,url}]
    let buttonsJson = existing.buttons_json;
    if (buttons !== undefined) {
      if (!Array.isArray(buttons)) return res.status(400).json({ error: 'buttons must be an array' });
      const clean = buttons
        .map((b) => ({ text: String(b?.text || '').trim().slice(0, 100), url: String(b?.url || '').trim().slice(0, 500) }))
        .filter((b) => b.text && b.url);
      for (const b of clean) {
        if (!/^https?:\/\//i.test(b.url) && !/^tg:\/\//i.test(b.url)) {
          return res.status(400).json({ error: `URL кнопки должен начинаться с http(s):// — «${b.url}»` });
        }
      }
      buttonsJson = clean.length ? JSON.stringify(clean) : null;
    }

    const en = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;

    await dbPool.query(
      `UPDATE wl_alarm_rules
         SET enabled=?, threshold_value=?, threshold_unit=?, message_text=?, buttons_json=?
       WHERE id=?`,
      [en, thrVal, thrUnit, msg, buttonsJson, id]
    );

    const [updated] = await dbPool.query('SELECT * FROM wl_alarm_rules WHERE id=? LIMIT 1', [id]);
    const userName = req.user.displayName || req.user.username;
    logAudit(
      req.user.id, userName, 'update', 'alarm', existing.trigger_type,
      `Аларм «${cat.name || existing.trigger_type}»: ${en ? 'вкл' : 'выкл'}` +
      (cat.has_threshold !== false ? `, порог ${thrVal} ${thrUnit}` : ''),
      { enabled: !!existing.enabled, threshold_value: existing.threshold_value },
      { enabled: !!en, threshold_value: thrVal }
    );

    res.json({ ok: true, rule: shapeRule(updated[0]) });
  } catch (err) { next(err); }
});

// GET /api/alarms/log — recent send log (written by the bot). Tolerates a
// missing table (bot not deployed yet) → empty list.
router.get('/log', async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    let rows = [];
    try {
      const [r] = await dbPool.query(
        `SELECT l.id, l.trigger_type, l.telegram_id, l.entity_key, l.dry_run, l.ok,
                l.message_preview, l.sent_at, u.full_name, u.username
           FROM wl_alarm_log l
           LEFT JOIN users u ON u.user_id = l.telegram_id
          ORDER BY l.sent_at DESC, l.id DESC
          LIMIT ?`,
        [limit]
      );
      rows = r;
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    res.json({
      log: rows.map((r) => ({
        ...r,
        dry_run: !!r.dry_run,
        ok: !!r.ok,
        name: CATALOG_BY_TYPE[r.trigger_type]?.name || r.trigger_type,
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/alarms/reset-log — clear dedup/send log. body: { scope: 'dry'|'all' }
// 'dry' (default) wipes only test rows so going live isn't suppressed by tests.
router.post('/reset-log', requireAdmin, async (req, res, next) => {
  try {
    const scope = (req.body?.scope || 'dry') === 'all' ? 'all' : 'dry';
    let affected = 0;
    try {
      const sql = scope === 'all'
        ? 'DELETE FROM wl_alarm_log'
        : 'DELETE FROM wl_alarm_log WHERE dry_run = 1';
      const [r] = await dbPool.query(sql);
      affected = r.affectedRows || 0;
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'delete', 'alarm', `log:${scope}`,
      `Сброс журнала алармов (${scope}): удалено ${affected}`, null, { scope });
    res.json({ ok: true, deleted: affected, scope });
  } catch (err) { next(err); }
});

export default router;
