import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

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
    req.user = { id: payload.id, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'Невалидный или истёкший токен' });
  }
}
