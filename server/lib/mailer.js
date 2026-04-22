/**
 * SMTP-клиент для рассылки email-уведомлений (пока только 2FA OTP).
 * Конфиг берётся из env (см. server/config/env.js).
 */
import nodemailer from 'nodemailer';
import {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_FROM_NAME,
  MAIL_PROVIDER, RESEND_API_KEY, RESEND_FROM,
} from '../config/env.js';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Жёсткие таймауты чтобы login не висел, если порт закрыт / креды битые
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return _transporter;
}

// Диагностический метод — проверить соединение и креды одной командой
export async function verifyMailer() {
  if (isResend()) return verifyResend();
  const t = getTransporter();
  if (!t) throw new Error('SMTP не настроен (SMTP_HOST/USER/PASS пустые)');
  return t.verify();
}

function isResend() { return MAIL_PROVIDER === 'resend'; }

export function isMailerConfigured() {
  if (isResend()) return !!(RESEND_API_KEY && RESEND_FROM);
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

async function sendViaResend({ to, subject, text, html }) {
  const fromAddr = RESEND_FROM;
  const from = SMTP_FROM_NAME ? `${SMTP_FROM_NAME} <${fromAddr}>` : fromAddr;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    const err = new Error(`Resend: ${msg}`);
    err.code = data?.name || 'RESEND_ERR';
    throw err;
  }
  return { messageId: data.id || '(unknown)', response: 'resend ok' };
}

async function verifyResend() {
  // У Resend нет verify-ручки; считаем сконфигурированный ключ валидным.
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY пуст');
  if (!RESEND_FROM) throw new Error('RESEND_FROM пуст');
  return true;
}

export async function sendMail({ to, subject, text, html }) {
  if (isResend()) return sendViaResend({ to, subject, text, html });
  const t = getTransporter();
  if (!t) throw new Error('SMTP не настроен');
  const fromAddr = SMTP_FROM || SMTP_USER;
  const from = SMTP_FROM_NAME ? `"${SMTP_FROM_NAME}" <${fromAddr}>` : fromAddr;
  return t.sendMail({ from, to, subject, text, html });
}

export async function sendOtpEmail(to, code) {
  const subject = `Код подтверждения: ${code}`;
  const text = `Ваш одноразовый код для входа в админ-панель Winline: ${code}\n\n` +
    `Код действителен 10 минут. Если это были не вы — проигнорируйте письмо и немедленно смените пароль.`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#222">
      <h2 style="margin:0 0 12px">Код подтверждения входа</h2>
      <p style="margin:0 0 16px;color:#555">Вы пытаетесь войти в админ-панель Winline.</p>
      <div style="font-size:32px;letter-spacing:8px;font-weight:700;padding:16px 20px;background:#f3f4f6;border-radius:8px;text-align:center">${code}</div>
      <p style="margin:16px 0 0;color:#888;font-size:13px">Код действителен 10 минут. Если это были не вы — проигнорируйте это письмо и немедленно смените пароль.</p>
    </div>`;
  return sendMail({ to, subject, text, html });
}
