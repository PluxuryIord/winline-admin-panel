import { Router } from 'express';
import bcrypt from 'bcrypt';
import dbPool from '../../config/db.js';
import admonPool from '../../config/dbAdmon.js';
import { sendOtpEmail, isMailerConfigured } from '../../lib/mailer.js';
import { BOT_API_URL, BOT_API_KEY } from '../../config/env.js';

// Mini App login: email → check against the wl_admon partner mirror → 6-digit
// OTP to that email → verify → bot admin_api POST /auth writes user_auth and
// refreshes the user's bot menu. Identity (tg id) always comes from validated
// initData (req.tgUser), never from the request body.

const router = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

// Sidecar table (DB user has no ALTER/DROP — schema must be right first try;
// if it ever changes, make wl_miniapp_otp_v2 like wl_alarm_rules_v2).
(async () => {
  if (!dbPool) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_miniapp_otp (
        tg_user_id BIGINT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code_hash VARCHAR(100) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        resend_after DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (e) {
    console.warn('[miniapp/auth] create wl_miniapp_otp:', e.message);
  }
})();

const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
const maskEmail = (em) => {
  const [u, d] = String(em).split('@');
  if (!d) return em;
  return `${u.slice(0, 2)}***@${d}`;
};

async function botApi(path, body) {
  if (!BOT_API_URL) return { ok: false, status: 0, data: { error: 'BOT_API_URL не задан' } };
  try {
    const r = await fetch(`${BOT_API_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BOT_API_KEY ? { 'X-API-Key': BOT_API_KEY } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

// POST /api/miniapp/auth/request-otp { email }
router.post('/request-otp', async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ error: 'База данных недоступна' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'bad_email', message: 'Некорректный формат email' });
    }
    if (!isMailerConfigured()) {
      return res.status(503).json({ error: 'mailer_unavailable', message: 'Отправка кода временно недоступна' });
    }

    // Cooldown before hitting the mirror.
    const [cd] = await dbPool.query(
      'SELECT resend_after FROM wl_miniapp_otp WHERE tg_user_id = ? LIMIT 1',
      [req.tgUser.id]
    );
    if (cd.length && new Date(cd[0].resend_after).getTime() > Date.now()) {
      const retryIn = Math.ceil((new Date(cd[0].resend_after).getTime() - Date.now()) / 1000);
      return res.status(429).json({ error: 'cooldown', retry_after_sec: retryIn });
    }

    // Partner check against the mirror (same rule as the bot: found + status 1).
    if (!admonPool) {
      return res.status(503).json({ error: 'mirror_unavailable', message: 'Проверка email временно недоступна, попробуйте позже' });
    }
    let partner;
    try {
      const [rows] = await admonPool.query(
        'SELECT id, status FROM wl_admon_users WHERE LOWER(email) = ? LIMIT 1',
        [email]
      );
      partner = rows[0];
    } catch (e) {
      console.warn('[miniapp/auth] mirror query failed:', e.message);
      return res.status(503).json({ error: 'mirror_unavailable', message: 'Проверка email временно недоступна, попробуйте позже' });
    }
    if (!partner) {
      return res.status(404).json({ error: 'email_not_found', message: 'Этот email не зарегистрирован на платформе' });
    }
    if (partner.status !== null && partner.status !== undefined && Number(partner.status) !== 1) {
      return res.status(403).json({ error: 'account_blocked', message: 'Аккаунт на платформе заблокирован. Обратитесь в поддержку.' });
    }

    const code = genOtp();
    const codeHash = await bcrypt.hash(code, 10);
    await dbPool.query(
      `INSERT INTO wl_miniapp_otp (tg_user_id, email, code_hash, expires_at, attempts, resend_after)
         VALUES (?, ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE
         email = VALUES(email), code_hash = VALUES(code_hash),
         expires_at = VALUES(expires_at), attempts = 0,
         resend_after = VALUES(resend_after), created_at = CURRENT_TIMESTAMP`,
      [req.tgUser.id, email, codeHash,
       new Date(Date.now() + OTP_TTL_MS), new Date(Date.now() + OTP_RESEND_MS)]
    );

    try {
      await sendOtpEmail(email, code);
    } catch (mailErr) {
      console.error('[miniapp/auth] sendOtpEmail failed:', mailErr.message);
      return res.status(502).json({ error: 'send_failed', message: 'Не удалось отправить код, попробуйте ещё раз' });
    }

    res.json({ ok: true, masked_email: maskEmail(email), resend_after_sec: OTP_RESEND_MS / 1000 });
  } catch (err) { next(err); }
});

// POST /api/miniapp/auth/verify-otp { code }
router.post('/verify-otp', async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ error: 'База данных недоступна' });
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'bad_code', message: 'Введите 6 цифр' });

    const [rows] = await dbPool.query(
      'SELECT email, code_hash, expires_at, attempts FROM wl_miniapp_otp WHERE tg_user_id = ? LIMIT 1',
      [req.tgUser.id]
    );
    if (!rows.length) return res.status(410).json({ error: 'no_otp', message: 'Код не запрашивался. Начните заново.' });
    const otp = rows[0];

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'expired', message: 'Код истёк. Запросите новый.' });
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'too_many_attempts', message: 'Слишком много попыток. Запросите новый код.' });
    }

    const ok = await bcrypt.compare(code, otp.code_hash);
    if (!ok) {
      await dbPool.query('UPDATE wl_miniapp_otp SET attempts = attempts + 1 WHERE tg_user_id = ?', [req.tgUser.id]);
      return res.status(401).json({
        error: 'wrong_code',
        attempts_left: OTP_MAX_ATTEMPTS - otp.attempts - 1,
        message: 'Неверный код',
      });
    }

    // Code verified → the bot writes user_auth + refreshes the user's TG menu
    // (single implementation of "finalize auth", shared with the bot's own flow).
    const bot = await botApi('/auth', { email: otp.email, user_id: req.tgUser.id });
    if (!bot.ok) {
      if (bot.status === 404) {
        return res.status(409).json({ error: 'not_partner', message: 'Email не найден среди партнёров' });
      }
      console.warn('[miniapp/auth] bot /auth failed:', bot.status, bot.data);
      return res.status(502).json({ error: 'bot_unavailable', message: 'Сервис авторизации недоступен, попробуйте позже' });
    }

    await dbPool.query('DELETE FROM wl_miniapp_otp WHERE tg_user_id = ?', [req.tgUser.id]);
    res.json({ ok: true, email: otp.email });
  } catch (err) { next(err); }
});

// POST /api/miniapp/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ error: 'База данных недоступна' });
    const bot = await botApi('/logout', { user_id: req.tgUser.id });
    if (!bot.ok) {
      // Bot down → still log the user out; their bot menu refreshes next /start.
      console.warn('[miniapp/auth] bot /logout failed, direct delete:', bot.status, bot.data);
      await dbPool.query('DELETE FROM user_auth WHERE user_id = ?', [req.tgUser.id]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
