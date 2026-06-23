import { Router } from 'express';
import dbPool from '../config/db.js';
import { logAudit } from '../services/auditLog.js';
import requireAdmin from '../middleware/requireAdmin.js';

const router = Router();

// ─── Trigger catalog ────────────────────────────────────────────────────────
// Six trigger TYPES (agreed spec). Each type can now hold MANY rules (a drip:
// e.g. email-unconfirmed → one message at 3 days, another at 7 days…). The bot
// (bot/utils/alarms.py) reads every enabled row from wl_alarm_rules_v2 and
// dedups per-rule. `has_threshold` drives the UI — rejected/approved fire on a
// status *change*, so they carry no time threshold.
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

// ─── Auto-migration ──────────────────────────────────────────────────────────
// Env disallows ALTER *and* DROP (confirmed: FDMSport has neither). The original
// wl_alarm_rules had a UNIQUE(trigger_type) constraint that capped each trigger
// at one rule — we can't drop it, so we move to a fresh table without it.
// Seeding is one-shot (guarded by wl_alarm_meta) so deleting rules never makes
// the defaults resurrect on the next boot.
const RULES_TABLE = 'wl_alarm_rules_v2';
(async () => {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS ${RULES_TABLE} (
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
        INDEX idx_trigger (trigger_type),
        INDEX idx_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_alarm_meta (
        k VARCHAR(40) PRIMARY KEY,
        v VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    const [seeded] = await dbPool.query("SELECT v FROM wl_alarm_meta WHERE k='seeded_v2' LIMIT 1");
    if (!seeded.length) {
      for (let i = 0; i < CATALOG.length; i++) {
        const c = CATALOG[i];
        await dbPool.query(
          `INSERT INTO ${RULES_TABLE}
             (trigger_type, name, enabled, threshold_value, threshold_unit, message_text, sort_order)
           VALUES (?,?,0,?,?,?,?)`,
          [c.trigger_type, c.name, c.threshold_value, c.threshold_unit, c.message_text, i]
        );
      }
      await dbPool.query("INSERT INTO wl_alarm_meta (k, v) VALUES ('seeded_v2', '1')");
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

// GET /api/alarms — all rules, grouped client-side by trigger_type
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      `SELECT * FROM ${RULES_TABLE} ORDER BY sort_order ASC, id ASC`
    );
    res.json({ rules: rows.map(shapeRule), catalog: CATALOG });
  } catch (err) { next(err); }
});

// POST /api/alarms — add a new rule for a trigger_type (seeded from catalog defaults)
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const trigger_type = String(req.body?.trigger_type || '');
    const cat = CATALOG_BY_TYPE[trigger_type];
    if (!cat) return res.status(400).json({ error: 'unknown trigger_type' });

    const [mx] = await dbPool.query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM ${RULES_TABLE} WHERE trigger_type=?`,
      [trigger_type]
    );
    const sortOrder = mx[0]?.n || 0;
    const [r] = await dbPool.query(
      `INSERT INTO ${RULES_TABLE}
         (trigger_type, name, enabled, threshold_value, threshold_unit, message_text, sort_order)
       VALUES (?,?,0,?,?,?,?)`,
      [trigger_type, cat.name, cat.threshold_value, cat.threshold_unit, cat.message_text, sortOrder]
    );
    const [created] = await dbPool.query(`SELECT * FROM ${RULES_TABLE} WHERE id=? LIMIT 1`, [r.insertId]);

    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'create', 'alarm', trigger_type,
      `Добавлено правило «${cat.name}»`, null, { trigger_type, id: r.insertId });

    res.status(201).json({ ok: true, rule: shapeRule(created[0]) });
  } catch (err) { next(err); }
});

// PUT /api/alarms/:id — update one rule (enabled / threshold / message / buttons)
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'bad id' });

    const [existingRows] = await dbPool.query(`SELECT * FROM ${RULES_TABLE} WHERE id=? LIMIT 1`, [id]);
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

    // Validate / normalize buttons → [{text,url}] (UI hides this for now; API kept)
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
      `UPDATE ${RULES_TABLE}
         SET enabled=?, threshold_value=?, threshold_unit=?, message_text=?, buttons_json=?
       WHERE id=?`,
      [en, thrVal, thrUnit, msg, buttonsJson, id]
    );

    const [updated] = await dbPool.query(`SELECT * FROM ${RULES_TABLE} WHERE id=? LIMIT 1`, [id]);
    const userName = req.user.displayName || req.user.username;
    logAudit(
      req.user.id, userName, 'update', 'alarm', existing.trigger_type,
      `Аларм «${cat.name || existing.trigger_type}» (#${id}): ${en ? 'вкл' : 'выкл'}` +
      (cat.has_threshold !== false ? `, порог ${thrVal} ${thrUnit}` : ''),
      { enabled: !!existing.enabled, threshold_value: existing.threshold_value },
      { enabled: !!en, threshold_value: thrVal }
    );

    res.json({ ok: true, rule: shapeRule(updated[0]) });
  } catch (err) { next(err); }
});

// DELETE /api/alarms/:id — remove a rule
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'bad id' });

    const [existingRows] = await dbPool.query(`SELECT * FROM ${RULES_TABLE} WHERE id=? LIMIT 1`, [id]);
    if (!existingRows.length) return res.status(404).json({ error: 'rule not found' });
    const existing = existingRows[0];
    const cat = CATALOG_BY_TYPE[existing.trigger_type] || {};

    await dbPool.query(`DELETE FROM ${RULES_TABLE} WHERE id=?`, [id]);

    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'delete', 'alarm', existing.trigger_type,
      `Удалено правило «${cat.name || existing.trigger_type}» (#${id})`, null, { id });

    res.json({ ok: true, deleted: id });
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
