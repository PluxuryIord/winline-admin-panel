import { Router } from 'express';
import dbPool from '../../config/db.js';
import authRouter from './auth.js';
import contentRouter from './content.js';
import statsRouter from './stats.js';

// Mini App API. Mounted PUBLIC (before the panel's JWT authMiddleware) — every
// request here has already passed telegramInitData, so req.tgUser.id is the
// verified Telegram user. "Authorized" = has a user_auth row (logged into the
// bot / mini app with a partner email).

const router = Router();

router.use('/auth', authRouter);
router.use('/content', contentRouter);
router.use('/stats', statsRouter);

// GET /api/miniapp/me — who am I (from validated initData) + auth state.
router.get('/me', async (req, res, next) => {
  try {
    let email = null;
    let name = null;
    if (dbPool) {
      const [rows] = await dbPool.query(
        `SELECT a.email, u.rl_full_name, u.full_name
           FROM user_auth a
           LEFT JOIN users u ON u.user_id = a.user_id
          WHERE a.user_id = ? LIMIT 1`,
        [req.tgUser.id]
      );
      if (rows.length) {
        email = rows[0].email || null;
        name = rows[0].rl_full_name || rows[0].full_name || null;
      }
    }
    res.json({
      authorized: !!email,
      email,
      name,
      tg: {
        id: req.tgUser.id,
        first_name: req.tgUser.first_name || '',
        username: req.tgUser.username || '',
      },
    });
  } catch (err) { next(err); }
});

export default router;
