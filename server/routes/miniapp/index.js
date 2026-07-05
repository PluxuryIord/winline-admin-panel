import { Router } from 'express';
import dbPool from '../../config/db.js';

// Mini App API. Mounted PUBLIC (before the panel's JWT authMiddleware) — every
// request here has already passed telegramInitData, so req.tgUser.id is the
// verified Telegram user. "Authorized" = has a user_auth row (logged into the
// bot / mini app with a partner email).

const router = Router();

// Middleware for partner-only sections: resolves the user_auth email or 403s.
export async function requireAuthorized(req, res, next) {
  try {
    if (!dbPool) return res.status(503).json({ error: 'База данных недоступна' });
    const [rows] = await dbPool.query(
      'SELECT email FROM user_auth WHERE user_id = ? LIMIT 1',
      [req.tgUser.id]
    );
    if (!rows.length || !rows[0].email) {
      return res.status(403).json({ error: 'not_authorized' });
    }
    req.partnerEmail = String(rows[0].email).trim().toLowerCase();
    next();
  } catch (err) { next(err); }
}

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
