import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import dbPool from '../config/db.js';

// In-memory cache: userId → { role, displayName, isActive, ts }
const profileCache = new Map();
const CACHE_TTL = 60_000; // 60 seconds

function getCached(userId) {
  const entry = profileCache.get(userId);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry;
  return null;
}

async function loadProfile(userId) {
  try {
    const [rows] = await dbPool.query(
      'SELECT role, display_name, is_active FROM wl_admin_user_profiles WHERE user_id = ?',
      [userId]
    );
    if (rows.length) {
      const entry = {
        role: rows[0].role,
        displayName: rows[0].display_name,
        isActive: !!rows[0].is_active,
        ts: Date.now(),
      };
      profileCache.set(userId, entry);
      return entry;
    }
    // Auto-create profile: first user gets admin, rest get editor
    const autoRole = userId === 1 ? 'admin' : 'editor';
    await dbPool.query(
      'INSERT IGNORE INTO wl_admin_user_profiles (user_id, role) VALUES (?, ?)',
      [userId, autoRole]
    ).catch(() => {});
    const entry = { role: autoRole, displayName: null, isActive: true, ts: Date.now() };
    profileCache.set(userId, entry);
    return entry;
  } catch {
    return null; // DB error — fallback to JWT claims
  }
}

// Clear cache entry when user is updated (called from adminUsers route)
export function invalidateProfileCache(userId) {
  profileCache.delete(userId);
}

export default async function authMiddleware(req, res, next) {
  // Skip auth endpoints
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

    // Load fresh profile (cached, 60s TTL)
    const cached = getCached(payload.id);
    const profile = cached || await loadProfile(payload.id);

    if (profile) {
      req.user.role = profile.role;
      req.user.displayName = profile.displayName || req.user.displayName;

      // Block deactivated users immediately
      if (!profile.isActive) {
        return res.status(403).json({ error: 'Аккаунт деактивирован' });
      }
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Невалидный или истёкший токен' });
  }
}
