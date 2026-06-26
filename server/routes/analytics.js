import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

function periodToRange(period) {
  const now = new Date();
  let since = null;
  let until = null;
  switch (period) {
    case 'today': { since = new Date(now); since.setHours(0, 0, 0, 0); break; }
    case '24h': since = new Date(now - 24 * 3600_000); break;
    case 'week': since = new Date(now - 7 * 24 * 3600_000); break;
    case 'month': since = new Date(now - 30 * 24 * 3600_000); break;
    case 'year': since = new Date(now - 365 * 24 * 3600_000); break;
    default: break; // all time
  }
  return { since, until };
}

function dateCondition(column, since, until) {
  const parts = [];
  const params = [];
  if (since) { parts.push(`${column} >= ?`); params.push(since); }
  if (until) { parts.push(`${column} <= ?`); params.push(until); }
  return { where: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
}

// Run a query, swallow errors (missing table/column) → fallback. Keeps the
// whole dashboard alive even if one source is unavailable.
async function safe(sql, params, fallback) {
  try { const [rows] = await dbPool.query(sql, params); return rows; }
  catch (e) { console.warn('[analytics]', e.code || e.message, '::', sql.slice(0, 60)); return fallback; }
}
const num = (rows, key = 'c') => (rows && rows[0] ? Number(rows[0][key]) || 0 : 0);

// role / graph have a long free-text tail → keep top N, fold the rest into «Прочее».
function topN(rows, n = 7, otherLabel = 'Прочее') {
  const clean = (rows || [])
    .map(r => ({ label: String(r.label ?? '').trim(), count: Number(r.c) || 0 }))
    .filter(r => r.label && r.label !== '<NULL>');
  clean.sort((a, b) => b.count - a.count);
  if (clean.length <= n) return clean;
  const head = clean.slice(0, n);
  const rest = clean.slice(n).reduce((s, r) => s + r.count, 0);
  if (rest > 0) head.push({ label: otherLabel, count: rest });
  return head;
}

router.get('/', async (req, res, next) => {
  try {
    const { period, from, to } = req.query;
    let since = null, until = null;
    if (from || to) {
      if (from) since = new Date(from + 'T00:00:00');
      if (to) until = new Date(to + 'T23:59:59');
    } else {
      const r = periodToRange(period || 'month'); since = r.since; until = r.until;
    }

    // ── Block 1: audience (current-state totals + period-filtered new) ─────────
    const total = num(await safe('SELECT COUNT(*) c FROM users', [], []));
    const active = num(await safe('SELECT COUNT(*) c FROM users WHERE banned = 0', [], []));
    const blocked = num(await safe('SELECT COUNT(*) c FROM users WHERE banned = 1', [], []));
    const registered = num(await safe('SELECT COUNT(*) c FROM users WHERE registered = 1', [], []));
    const guests = num(await safe('SELECT COUNT(*) c FROM users WHERE registered = 0 OR registered IS NULL', [], []));
    const loggedIn = num(await safe('SELECT COUNT(*) c FROM user_auth', [], []));

    const dcReg = dateCondition('date_reg', since, until);
    const newUsers = num(await safe(`SELECT COUNT(*) c FROM users WHERE 1=1${dcReg.where}`, dcReg.params, []));

    // ── Growth over time (daily, or monthly for long ranges) ───────────────────
    const spanDays = since ? Math.max(1, Math.round(((until || new Date()) - since) / 86400_000)) : 99999;
    const byMonth = spanDays > 92;
    const fmt = byMonth ? '%Y-%m' : '%Y-%m-%d';
    const growthRows = await safe(
      `SELECT DATE_FORMAT(date_reg, '${fmt}') AS bucket, COUNT(*) c
         FROM users WHERE date_reg IS NOT NULL${dcReg.where}
        GROUP BY bucket ORDER BY bucket ASC`,
      dcReg.params, []);
    const growth = (growthRows || []).map(r => ({ date: r.bucket, count: Number(r.c) || 0 }));

    // ── Block 2: segments ──────────────────────────────────────────────────────
    const roleRows = await safe(
      "SELECT role AS label, COUNT(*) c FROM users WHERE role IS NOT NULL AND role <> '' GROUP BY role ORDER BY c DESC LIMIT 30",
      [], []);
    const trafficRows = await safe(
      "SELECT graph AS label, COUNT(*) c FROM users WHERE graph IS NOT NULL AND graph <> '' AND graph <> 'Нет' GROUP BY graph ORDER BY c DESC LIMIT 30",
      [], []);
    const phoneFilled = num(await safe("SELECT COUNT(*) c FROM users WHERE phone_number IS NOT NULL AND phone_number <> ''", [], []));
    const nameFilled = num(await safe("SELECT COUNT(*) c FROM users WHERE rl_full_name IS NOT NULL AND rl_full_name <> ''", [], []));

    // ── Block 3: funnel (current-state) ────────────────────────────────────────
    const funnel = [
      { stage: 'Открыли бота', count: total },
      { stage: 'Активные (не заблокировали)', count: active },
      { stage: 'Залогинились (привязали email)', count: loggedIn },
      { stage: 'Завершили регистрацию', count: registered },
    ];

    // ── Block 4: support (wl_admin_chats is the live system) ────────────────────
    const supChats = num(await safe('SELECT COUNT(*) c FROM wl_admin_chats', [], []));
    const supMessages = num(await safe('SELECT COUNT(*) c FROM wl_admin_chat_messages', [], []));
    const supFromUsers = num(await safe("SELECT COUNT(*) c FROM wl_admin_chat_messages WHERE sender = 'user'", [], []));
    const dcMsg = dateCondition('created_at', since, until);
    const supPeriod = num(await safe(
      `SELECT COUNT(*) c FROM wl_admin_chat_messages WHERE sender = 'user'${dcMsg.where}`, dcMsg.params, []));

    // ── Block 6: broadcasts — two separate systems ─────────────────────────────
    const dcBc = dateCondition('created_at', since, until);
    const bc = await safe(
      `SELECT COUNT(*) c, COALESCE(SUM(total),0) total, COALESCE(SUM(success),0) success, COALESCE(SUM(failed),0) failed
         FROM wl_admin_broadcasts WHERE 1=1${dcBc.where}`, dcBc.params, [{}]);
    const dcAl = dateCondition('date_sent', since, until);
    const al = await safe(
      `SELECT COUNT(*) c, COALESCE(SUM(successfully_sent),0) sent, COALESCE(SUM(error_sent),0) err
         FROM alerts WHERE 1=1${dcAl.where}`, dcAl.params, [{}]);

    // ── Block 7: tags ──────────────────────────────────────────────────────────
    const tagRows = await safe(
      'SELECT tag AS label, COUNT(*) c FROM wl_admin_user_tags GROUP BY tag ORDER BY c DESC LIMIT 40',
      [], []);
    // Hide system tags (prefix «__», e.g. __no_raffle__).
    const tags = (tagRows || [])
      .map(r => ({ label: String(r.label || ''), count: Number(r.c) || 0 }))
      .filter(t => t.label && !t.label.startsWith('__'))
      .slice(0, 14);

    res.json({
      audience: { total, active, blocked, registered, guests, loggedIn, newUsers },
      growth,
      segments: {
        role: topN(roleRows, 7),
        traffic: topN(trafficRows, 7),
        phoneFilled, nameFilled,
      },
      funnel,
      support: { chats: supChats, messages: supMessages, fromUsers: supFromUsers, periodMessages: supPeriod },
      broadcasts: {
        panelCount: Number(bc?.[0]?.c) || 0,
        panelRecipients: Number(bc?.[0]?.total) || 0,
        panelDelivered: Number(bc?.[0]?.success) || 0,
        panelFailed: Number(bc?.[0]?.failed) || 0,
        botCount: Number(al?.[0]?.c) || 0,
        botSent: Number(al?.[0]?.sent) || 0,
        botErrors: Number(al?.[0]?.err) || 0,
      },
      tags,
    });
  } catch (err) { next(err); }
});

export default router;
