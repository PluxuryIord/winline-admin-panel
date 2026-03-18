import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

function periodToDate(period) {
  const now = new Date();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case '24h': return new Date(now - 24 * 60 * 60 * 1000);
    case 'week': return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case 'month': return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case 'year': return new Date(now - 365 * 24 * 60 * 60 * 1000);
    default: return null; // all time
  }
}

router.get('/', async (req, res, next) => {
  try {
    const period = req.query.period || 'all';
    const since = periodToDate(period);

    // Users stats (from bot's `users` table)
    const [[{ totalUsers }]] = await dbPool.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ partners }]] = await dbPool.query('SELECT COUNT(*) AS partners FROM users WHERE registered = 1');
    const [[{ guests }]] = await dbPool.query('SELECT COUNT(*) AS guests FROM users WHERE registered = 0 OR registered IS NULL');
    const [[{ blocked }]] = await dbPool.query(
      since
        ? 'SELECT COUNT(*) AS blocked FROM users WHERE banned = 1 AND date_reg >= ?'
        : 'SELECT COUNT(*) AS blocked FROM users WHERE banned = 1',
      since ? [since] : []
    );
    const [[{ newUsers }]] = await dbPool.query(
      since
        ? 'SELECT COUNT(*) AS newUsers FROM users WHERE date_reg >= ?'
        : 'SELECT COUNT(*) AS newUsers FROM users',
      since ? [since] : []
    );

    // Chat messages (requests to bot)
    const [[{ requests }]] = await dbPool.query(
      since
        ? 'SELECT COUNT(*) AS requests FROM wl_admin_chat_messages WHERE sender = ? AND created_at >= ?'
        : 'SELECT COUNT(*) AS requests FROM wl_admin_chat_messages WHERE sender = ?',
      since ? ['user', since] : ['user']
    );

    // Channels & groups
    const [[{ channels }]] = await dbPool.query('SELECT COUNT(*) AS channels FROM wl_admin_channels');
    const [[{ groups }]] = await dbPool.query('SELECT COUNT(*) AS groups FROM wl_admin_groups');

    // Broadcasts (posts)
    const [[{ posts }]] = await dbPool.query(
      since
        ? 'SELECT COUNT(*) AS posts FROM wl_admin_broadcasts WHERE created_at >= ?'
        : 'SELECT COUNT(*) AS posts FROM wl_admin_broadcasts',
      since ? [since] : []
    );

    res.json({
      totalUsers, partners, guests, blocked,
      requests, newUsers, channels, groups, posts,
    });
  } catch (err) { next(err); }
});

export default router;
