import dbPool from '../../config/db.js';

// Partner-only gate for Mini App sections: the verified Telegram user must
// have a user_auth row (i.e. logged in with a partner email). Attaches
// req.partnerEmail for downstream handlers.
export default async function requireAuthorized(req, res, next) {
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
