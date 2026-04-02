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
      `SELECT u.id, u.username, u.password_hash, u.display_name,
              COALESCE(p.role, 'editor') AS role,
              COALESCE(p.is_active, 1) AS is_active,
              p.display_name AS profile_display_name
       FROM wl_admin_users u
       LEFT JOIN wl_admin_user_profiles p ON p.user_id = u.id
       WHERE u.username = ?`,
      [username]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Учётная запись деактивирована' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Auto-create profile if missing
    if (user.role === 'editor' && !user.profile_display_name && user.profile_display_name === undefined) {
      // No profile row — create one
      const autoRole = user.id === 1 ? 'admin' : 'editor';
      await dbPool.query(
        'INSERT IGNORE INTO wl_admin_user_profiles (user_id, role, display_name) VALUES (?, ?, ?)',
        [user.id, autoRole, user.display_name]
      ).catch(() => {});
      user.role = autoRole;
    }

    const displayName = user.profile_display_name || user.display_name;

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, displayName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set httpOnly cookie (secure from XSS)
    res.cookie('wl_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24h
      path: '/',
    });

    res.json({
      user: { id: user.id, username: user.username, displayName, role: user.role },
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    let token;
    if (header && header.startsWith('Bearer ')) {
      token = header.slice(7);
    } else if (req.cookies?.wl_token) {
      token = req.cookies.wl_token;
    } else {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    const payload = jwt.verify(token, JWT_SECRET);

    const [rows] = await dbPool.query(
      `SELECT u.id, u.username, u.display_name,
              COALESCE(p.role, 'editor') AS role,
              COALESCE(p.is_active, 1) AS is_active,
              p.display_name AS profile_display_name
       FROM wl_admin_users u
       LEFT JOIN wl_admin_user_profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
      [payload.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Пользователь не найден' });

    const u = rows[0];
    const displayName = u.profile_display_name || u.display_name;
    res.json({ id: u.id, username: u.username, displayName, role: u.role });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Невалидный или истёкший токен' });
    }
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('wl_token', { path: '/' });
  res.json({ ok: true });
});

export default router;
