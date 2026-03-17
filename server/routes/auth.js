import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dbPool from '../config/db.js';
import { JWT_SECRET } from '../config/env.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const [rows] = await dbPool.query(
      'SELECT id, username, password_hash, display_name FROM wl_admin_users WHERE username = ?',
      [username]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.display_name },
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);

    const [rows] = await dbPool.query(
      'SELECT id, username, display_name FROM wl_admin_users WHERE id = ?',
      [payload.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Пользователь не найден' });

    const u = rows[0];
    res.json({ id: u.id, username: u.username, displayName: u.display_name });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Невалидный или истёкший токен' });
    }
    next(err);
  }
});

export default router;
