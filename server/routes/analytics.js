import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

function periodToRange(period) {
  const now = new Date();
  let since = null;
  let until = null;
  switch (period) {
    case 'today': {
      since = new Date(now);
      since.setHours(0, 0, 0, 0);
      break;
    }
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

router.get('/', async (req, res, next) => {
  try {
    const { period, from, to } = req.query;

    let since = null;
    let until = null;

    if (from || to) {
      if (from) since = new Date(from + 'T00:00:00');
      if (to) until = new Date(to + 'T23:59:59');
    } else {
      const range = periodToRange(period || 'all');
      since = range.since;
      until = range.until;
    }

    // Users — totalUsers, partners, guests are always total (no period filter)
    const [[{ totalUsers }]] = await dbPool.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ partners }]] = await dbPool.query('SELECT COUNT(*) AS partners FROM users WHERE registered = 1');
    const [[{ guests }]] = await dbPool.query('SELECT COUNT(*) AS guests FROM users WHERE registered = 0 OR registered IS NULL');

    // Period-filtered metrics
    const dc1 = dateCondition('date_reg', since, until);
    const [[{ blocked }]] = await dbPool.query(
      `SELECT COUNT(*) AS blocked FROM users WHERE banned = 1${dc1.where}`, dc1.params
    );
    const [[{ newUsers }]] = await dbPool.query(
      `SELECT COUNT(*) AS newUsers FROM users WHERE 1=1${dc1.where}`, dc1.params
    );

    const dc2 = dateCondition('created_at', since, until);
    const [[{ requests }]] = await dbPool.query(
      `SELECT COUNT(*) AS requests FROM wl_admin_chat_messages WHERE sender = 'user'${dc2.where}`, dc2.params
    );

    // Channels & groups — always total
    const [[{ channels }]] = await dbPool.query('SELECT COUNT(*) AS channels FROM wl_admin_channels');
    const [[{ cnt: groups }]] = await dbPool.query('SELECT COUNT(*) AS cnt FROM wl_admin_groups');

    // Broadcasts — period filtered
    const dc3 = dateCondition('created_at', since, until);
    const [[{ posts }]] = await dbPool.query(
      `SELECT COUNT(*) AS posts FROM wl_admin_broadcasts WHERE 1=1${dc3.where}`, dc3.params
    );

    res.json({
      totalUsers, partners, guests, blocked,
      requests, newUsers, channels, groups, posts,
    });
  } catch (err) { next(err); }
});

export default router;
