import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dbPool from '../config/db.js';
import { JWT_SECRET, OTP_2FA_ENABLED } from '../config/env.js';
import { logAudit } from '../services/auditLog.js';
import { sendOtpEmail, isMailerConfigured } from '../lib/mailer.js';

const router = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SESSION_TTL = '15m';
const TRUSTED_COOKIE_NAME = 'wl_trust';
const TRUSTED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = 'wl_token';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function genOtp()  { return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); }

function maskEmail(email) {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const masked = name.length <= 2 ? name[0] + '*' : name[0] + '***' + name[name.length - 1];
  return `${masked}@${domain}`;
}

function issueSessionCookie(res, { id, username, role, displayName }) {
  const token = jwt.sign(
    { id, username, role, displayName },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

async function loadUserFull(whereCol, whereVal) {
  const [rows] = await dbPool.query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.display_name,
            COALESCE(p.role, 'editor') AS role,
            COALESCE(p.is_active, 1) AS is_active,
            p.display_name AS profile_display_name
       FROM wl_admin_users u
       LEFT JOIN wl_admin_user_profiles p ON p.user_id = u.id
      WHERE u.${whereCol} = ?
      LIMIT 1`,
    [whereVal]
  );
  return rows[0] || null;
}

async function checkTrustedDevice(req, userId) {
  const token = req.cookies?.[TRUSTED_COOKIE_NAME];
  if (!token) return false;
  const hash = sha256(token);
  const [rows] = await dbPool.query(
    `SELECT id FROM wl_admin_trusted_devices
       WHERE token_hash = ? AND user_id = ? AND expires_at > NOW()
       LIMIT 1`,
    [hash, userId]
  );
  if (!rows.length) return false;
  await dbPool.query(
    'UPDATE wl_admin_trusted_devices SET last_used_at = NOW() WHERE id = ?',
    [rows[0].id]
  );
  return true;
}

async function createTrustedDevice(res, req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = sha256(token);
  const ua = (req.headers['user-agent'] || '').slice(0, 500);
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .toString().split(',')[0].trim().slice(0, 64);
  const expiresAt = new Date(Date.now() + TRUSTED_TTL_MS);
  await dbPool.query(
    `INSERT INTO wl_admin_trusted_devices (user_id, token_hash, user_agent, ip, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, hash, ua || null, ip || null, expiresAt]
  );
  res.cookie(TRUSTED_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TRUSTED_TTL_MS,
    path: '/',
  });
}

async function ensureProfile(user) {
  if (user.profile_display_name == null) {
    const autoRole = user.id === 1 ? 'admin' : 'editor';
    await dbPool.query(
      'INSERT IGNORE INTO wl_admin_user_profiles (user_id, role, display_name) VALUES (?, ?, ?)',
      [user.id, autoRole, user.display_name]
    ).catch(err => console.error('[auth] auto-create profile failed:', err.message));
    user.role = autoRole;
  }
}

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const user = await loadUserFull('username', username);
    if (!user) {
      logAudit(null, username, 'login_failed', 'auth', null, 'unknown user', null, null);
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    if (!user.is_active) {
      logAudit(user.id, user.username, 'login_blocked', 'auth', user.id, 'inactive account', null, null);
      return res.status(403).json({ error: 'Учётная запись деактивирована' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      logAudit(user.id, user.username, 'login_failed', 'auth', user.id, 'wrong password', null, null);
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    await ensureProfile(user);
    const displayName = user.profile_display_name || user.display_name;

    const finishLogin = (reason) => {
      issueSessionCookie(res, { id: user.id, username: user.username, role: user.role, displayName });
      logAudit(user.id, displayName || user.username, 'login', 'auth', user.id, `${user.username} (${reason})`, null, null);
      return res.json({
        user: { id: user.id, username: user.username, displayName, role: user.role },
      });
    };

    // 2FA выключен или у пользователя не задан email → старое поведение
    if (!OTP_2FA_ENABLED || !user.email) return finishLogin('no-2fa');

    // Доверенное устройство — пропускаем OTP
    if (await checkTrustedDevice(req, user.id)) return finishLogin('trusted-device');

    // --- Нужен OTP: генерим, сохраняем, шлём ---
    if (!isMailerConfigured()) {
      console.error('[auth] SMTP не настроен, но у пользователя включён 2FA');
      return res.status(500).json({ error: 'Отправка кода недоступна. Обратитесь к администратору.' });
    }

    const code = genOtp();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await dbPool.query(
      `INSERT INTO wl_admin_otp (user_id, code_hash, expires_at, attempts, sent_to)
           VALUES (?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE
           code_hash = VALUES(code_hash),
           expires_at = VALUES(expires_at),
           attempts = 0,
           created_at = CURRENT_TIMESTAMP,
           sent_to = VALUES(sent_to)`,
      [user.id, codeHash, expiresAt, user.email]
    );

    try {
      await sendOtpEmail(user.email, code);
    } catch (mailErr) {
      console.error('[auth] sendOtpEmail failed:', mailErr.message);
      return res.status(500).json({ error: 'Не удалось отправить код. Попробуйте ещё раз.' });
    }

    logAudit(user.id, displayName || user.username, 'login_otp_sent', 'auth', user.id, maskEmail(user.email), null, null);

    const otpSession = jwt.sign(
      { purpose: 'otp', uid: user.id },
      JWT_SECRET,
      { expiresIn: OTP_SESSION_TTL }
    );

    return res.json({
      needsOtp: true,
      otpSession,
      maskedEmail: maskEmail(user.email),
    });
  } catch (err) { next(err); }
});

// ── POST /api/auth/verify-otp ───────────────────────────────────────────────
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { otpSession, code, trustDevice } = req.body;
    if (!otpSession || !code) {
      return res.status(400).json({ error: 'Код обязателен' });
    }

    let payload;
    try { payload = jwt.verify(otpSession, JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Сессия входа истекла. Войдите заново.' }); }
    if (payload.purpose !== 'otp' || !payload.uid) {
      return res.status(401).json({ error: 'Некорректная сессия' });
    }

    const user = await loadUserFull('id', payload.uid);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    if (!user.is_active) return res.status(403).json({ error: 'Учётная запись деактивирована' });

    const [otpRows] = await dbPool.query(
      'SELECT code_hash, expires_at, attempts FROM wl_admin_otp WHERE user_id = ?',
      [user.id]
    );
    if (!otpRows.length) {
      return res.status(401).json({ error: 'Код не запрашивался. Начните вход заново.' });
    }
    const otp = otpRows[0];
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: 'Код истёк. Начните вход заново.' });
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Слишком много попыток. Начните вход заново.' });
    }

    const ok = await bcrypt.compare(String(code).trim(), otp.code_hash);
    if (!ok) {
      await dbPool.query('UPDATE wl_admin_otp SET attempts = attempts + 1 WHERE user_id = ?', [user.id]);
      logAudit(user.id, user.username, 'otp_wrong', 'auth', user.id, user.username, null, null);
      return res.status(401).json({ error: 'Неверный код' });
    }

    await dbPool.query('DELETE FROM wl_admin_otp WHERE user_id = ?', [user.id]);
    await ensureProfile(user);
    const displayName = user.profile_display_name || user.display_name;
    issueSessionCookie(res, { id: user.id, username: user.username, role: user.role, displayName });

    if (trustDevice) {
      try { await createTrustedDevice(res, req, user.id); }
      catch (e) { console.warn('[auth] createTrustedDevice failed:', e.message); }
    }

    logAudit(user.id, displayName || user.username, 'login', 'auth', user.id,
             `${user.username} (otp${trustDevice ? '+trust' : ''})`, null, null);

    return res.json({
      user: { id: user.id, username: user.username, displayName, role: user.role },
    });
  } catch (err) { next(err); }
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    let token;
    if (header && header.startsWith('Bearer ')) token = header.slice(7);
    else if (req.cookies?.wl_token) token = req.cookies.wl_token;
    else return res.status(401).json({ error: 'Требуется авторизация' });
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

// ── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  try {
    const token = req.cookies?.wl_token;
    if (token) {
      const payload = jwt.verify(token, JWT_SECRET);
      logAudit(payload.id, payload.displayName || payload.username, 'logout', 'auth', payload.id, payload.username, null, null);
    }
  } catch { /* ignore */ }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  // wl_trust не сносим — хотим сохранить trust-устройства между сессиями
  res.json({ ok: true });
});

// ── POST /api/auth/forget-trusted-devices ───────────────────────────────────
// Отозвать все доверенные устройства текущего пользователя (вызывается из настроек).
// Требует валидной сессии.
router.post('/forget-trusted-devices', async (req, res) => {
  try {
    const token = req.cookies?.wl_token;
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
    const payload = jwt.verify(token, JWT_SECRET);
    await dbPool.query('DELETE FROM wl_admin_trusted_devices WHERE user_id = ?', [payload.id]);
    res.clearCookie(TRUSTED_COOKIE_NAME, { path: '/' });
    logAudit(payload.id, payload.displayName || payload.username, 'trusted_devices_cleared', 'auth', payload.id, null, null, null);
    res.json({ ok: true });
  } catch {
    return res.status(401).json({ error: 'Невалидный токен' });
  }
});

export default router;
