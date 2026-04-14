import { Router } from 'express';
import bcrypt from 'bcrypt';
import dbPool from '../config/db.js';
import requireAdmin from '../middleware/requireAdmin.js';
import { invalidateProfileCache } from '../middleware/auth.js';
import { logAudit } from '../services/auditLog.js';

const actorName = (req) => req.user?.displayName || req.user?.username || 'unknown';

const router = Router();

router.use(requireAdmin);

// GET /api/admin-users — list all users with profiles
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(`
      SELECT u.id, u.username, u.display_name,
             COALESCE(p.role, 'editor') AS role,
             COALESCE(p.is_active, 1) AS is_active,
             p.created_at AS profile_created_at
      FROM wl_admin_users u
      LEFT JOIN wl_admin_user_profiles p ON p.user_id = u.id
      ORDER BY u.id
    `);
    res.json(rows.map(r => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      display_name: r.display_name,
      role: r.role,
      isActive: r.is_active,
      is_active: r.is_active,
      created_at: r.profile_created_at,
    })));
  } catch (err) { next(err); }
});

// POST /api/admin-users — create new user
router.post('/', async (req, res, next) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username и password обязательны' });
    }
    const uname = username.trim();
    if (uname.length < 3 || uname.length > 50) {
      return res.status(400).json({ error: 'Логин должен быть от 3 до 50 символов' });
    }
    if (!/^[a-zA-Z0-9_.\-]+$/.test(uname)) {
      return res.status(400).json({ error: 'Логин может содержать только латиницу, цифры, _ . -' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Пароль слишком длинный' });
    }
    if (displayName && displayName.length > 100) {
      return res.status(400).json({ error: 'Имя не более 100 символов' });
    }
    const validRoles = ['admin', 'editor'];
    const userRole = validRoles.includes(role) ? role : 'editor';

    const hash = await bcrypt.hash(password, 10);
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_users (username, password_hash, display_name) VALUES (?, ?, ?)',
      [username, hash, displayName || null]
    );
    const userId = result.insertId;

    await dbPool.query(
      'INSERT INTO wl_admin_user_profiles (user_id, role, display_name) VALUES (?, ?, ?)',
      [userId, userRole, displayName || null]
    );

    logAudit(req.user.id, actorName(req), 'create', 'admin_user', userId, username,
      null, { username, displayName: displayName || null, role: userRole });
    res.status(201).json({ id: userId, username, displayName: displayName || null, role: userRole });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
    }
    next(err);
  }
});

// PUT /api/admin-users/:id — update user
router.put('/:id', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { displayName, role, password } = req.body;
    const validRoles = ['admin', 'editor'];

    // Snapshot old state for audit
    const [oldRows] = await dbPool.query(
      `SELECT u.username, u.display_name, COALESCE(p.role, 'editor') AS role
       FROM wl_admin_users u LEFT JOIN wl_admin_user_profiles p ON p.user_id = u.id
       WHERE u.id = ?`, [userId]
    );
    const oldState = oldRows[0] || null;

    // Update display_name in wl_admin_users
    if (displayName !== undefined) {
      await dbPool.query('UPDATE wl_admin_users SET display_name = ? WHERE id = ?', [displayName, userId]);
    }

    // Update profile (upsert)
    const updates = [];
    const vals = [];
    if (role !== undefined && validRoles.includes(role)) {
      updates.push('role = ?');
      vals.push(role);
    }
    if (displayName !== undefined) {
      updates.push('display_name = ?');
      vals.push(displayName);
    }
    if (updates.length) {
      // Ensure profile exists
      await dbPool.query(
        'INSERT IGNORE INTO wl_admin_user_profiles (user_id) VALUES (?)',
        [userId]
      );
      await dbPool.query(
        `UPDATE wl_admin_user_profiles SET ${updates.join(', ')} WHERE user_id = ?`,
        [...vals, userId]
      );
    }

    // Reset password if provided
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
      if (password.length > 128) return res.status(400).json({ error: 'Пароль слишком длинный' });
      const hash = await bcrypt.hash(password, 10);
      await dbPool.query('UPDATE wl_admin_users SET password_hash = ? WHERE id = ?', [hash, userId]);
    }

    const newState = {
      displayName: displayName !== undefined ? displayName : oldState?.display_name,
      role: role !== undefined ? role : oldState?.role,
      passwordChanged: !!password,
    };
    invalidateProfileCache(userId);
    logAudit(req.user.id, actorName(req), 'update', 'admin_user', userId,
      oldState?.username || String(userId), oldState, newState);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/admin-users/:id — soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }

    const [nameRows] = await dbPool.query('SELECT username FROM wl_admin_users WHERE id = ?', [userId]);
    const username = nameRows[0]?.username || String(userId);

    // Fully delete user
    await dbPool.query('DELETE FROM wl_admin_user_profiles WHERE user_id = ?', [userId]);
    await dbPool.query('DELETE FROM wl_admin_users WHERE id = ?', [userId]);

    invalidateProfileCache(userId);
    logAudit(req.user.id, actorName(req), 'delete', 'admin_user', userId, username, { username }, null);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
