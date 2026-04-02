import { Router } from 'express';
import dbPool from '../config/db.js';
import { BOT_TOKEN } from '../config/env.js';

const router = Router();

// GET /api/bot/status
router.get('/', async (req, res, next) => {
  try {
    const [[{ channelsCount }]] = await dbPool.query('SELECT COUNT(*) as channelsCount FROM wl_admin_channels');
    const [[{ broadcastsCount }]] = await dbPool.query('SELECT COUNT(*) as broadcastsCount FROM wl_admin_broadcasts');
    res.json({
      botToken: BOT_TOKEN ? 'set' : 'not set',
      channelsCount,
      broadcastsCount,
    });
  } catch (err) { next(err); }
});

export default router;
