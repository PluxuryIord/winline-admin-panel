import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import dbPool from '../config/db.js';

export default function authMiddleware(req, res, next) {
  // Пропускаем auth endpoints
  if (req.path.startsWith('/auth/')) return next();

  const header = req.headers.authorization;
  let token;

  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.cookies?.wl_token) {
    token = req.cookies.wl_token;
  } else {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role || 'editor',
      displayName: payload.displayName || null,
    };

    // Load fresh role from DB in background (non-blocking for perf,
    // but the JWT payload is the primary source within token lifetime)
    if (dbPool) {
      dbPool.query(
        'SELECT role, display_name, is_active FROM wl_admin_user_profiles WHERE user_id = ?',
        [payload.id]
      ).then(([rows]) => {
        if (rows.length) {
          req.user.role = rows[0].role;
          req.user.displayName = rows[0].display_name;
          if (!rows[0].is_active) {
            // User was deactivated — but request already in flight, handled at route level
          }
        } else {
          // Auto-create profile: first user (id=1) gets admin, others get editor
          const autoRole = payload.id === 1 ? 'admin' : 'editor';
          dbPool.query(
            'INSERT IGNORE INTO wl_admin_user_profiles (user_id, role) VALUES (?, ?)',
            [payload.id, autoRole]
          ).catch(() => {});
          req.user.role = autoRole;
        }
      }).catch(() => {});
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Невалидный или истёкший токен' });
  }
}
