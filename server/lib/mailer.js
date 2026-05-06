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
  if (!SMTP_HOST) return null;
  const opts = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    // Таймауты: короткие, но дают серверу дохнуть
    connectionTimeout: 30_000,
    greetingTimeout: 30_000,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: false },
    logger: false,
    debug: false,
  };
  // Internal relays may auth by IP and not require user/pass
  if (SMTP_USER && SMTP_PASS) {
    opts.auth = { user: SMTP_USER, pass: SMTP_PASS };
  }
  _transporter = nodemailer.createTransport(opts);
  return _transporter;
}

// Диагностический метод — проверить соединение и креды одной командой
export async function verifyMailer() {
  if (isResend()) return verifyResend();
  const t = getTransporter();
  if (!t) throw new Error('SMTP не настроен (SMTP_HOST пуст)');
  return t.verify();
}

function isResend() { return MAIL_PROVIDER === 'resend'; }

export function isMailerConfigured() {
  if (isResend()) return !!(RESEND_API_KEY && RESEND_FROM);
  return !!SMTP_HOST;
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

// URLs картинок шаблона. Загружаются в S3 один раз через
// `node server/scripts/upload-email-images.js header.png logo-welcome.png`,
// результат — в .env как EMAIL_HEADER_URL и EMAIL_LOGO_URL.
const EMAIL_HEADER_URL = process.env.EMAIL_HEADER_URL || '';
const EMAIL_LOGO_URL   = process.env.EMAIL_LOGO_URL   || '';

function otpHtml(code) {
  // Шаблон от дизайн-команды Winline. {{CODE}} заменяется на 6-значный код.
  // Картинки берутся по абсолютным URL из EMAIL_HEADER_URL / EMAIL_LOGO_URL.
  const headerImg = EMAIL_HEADER_URL
    ? `<img alt="Код подтверждения" src="${EMAIL_HEADER_URL}" style="border:0;display:block;height:auto;line-height:100%;outline:0;padding:0;text-decoration:none;width:100%" width="536" height="144">`
    : '';
  const logoImg = EMAIL_LOGO_URL
    ? `<img alt="logo" src="${EMAIL_LOGO_URL}" style="border:0;display:block;height:auto;line-height:100%;outline:0;padding:0;text-decoration:none;width:100%;max-width:314px" width="314" height="40">`
    : '';
  return `<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<title> </title>
<!--[if !mso]><!-- --><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]-->
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>a{text-decoration:none!important}p span{color:#2b2d34!important}</style>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style type="text/css">.btn_i{text-decoration:none!important}a{text-decoration:none!important}</style>
<![endif]-->
</head>
<body style="-webkit-text-size-adjust:100%;Margin:0;background-color:#d6d6d6;color:#ffffff;font-family:Arial,Verdana,sans-serif;font-size:13px;line-height:22px;padding:0">
<div style="background-color:#d6d6d6">
<table align="center" border="0" cellpadding="0" cellspacing="0" style="background-color:#d6d6d6;border:0;border-collapse:collapse;border-spacing:0;padding:0;width:100%" width="100%">
<tr><td align="center" style="border:0;font-size:0;height:0;line-height:0;padding:1px;vertical-align:top"><center>
<div style="Margin:0 auto;background:#e6eaf2;background-color:#e6eaf2;color:#ffffff;max-width:600px">
<table align="center" border="0" cellpadding="0" cellspacing="0" style="background:#e6eaf2;border:0;border-collapse:collapse;border-spacing:0;padding:0;width:100%"><tbody>
<tr><td style="border:0;font-size:0;line-height:0;padding:0;text-align:left;vertical-align:top">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:0;border-collapse:collapse;border-spacing:0;padding:0">
  <tr><td align="center" style="font-size:0;padding:16px 20px;word-break:break-word">
    <div style="max-width:536px;Margin:0 auto"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
      <tr><td align="left" valign="middle" style="vertical-align:middle;line-height:1;height:40px"><div style="width:314px">${logoImg}</div></td></tr>
    </table></div>
  </td></tr>
  <tr><td align="center" style="font-size:0;padding:24px 20px;word-break:break-word">
    <div style="max-width:536px;Margin:0 auto"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:0;border-collapse:collapse;border-spacing:0;padding:0"><tbody>
      <tr><td style="border:0;font-size:0;line-height:1;padding:0;text-align:center;vertical-align:top;width:536px" width="536">${headerImg}</td></tr>
    </tbody></table></div>
  </td></tr>
  <tr><td align="center" style="font-size:0;padding:0 20px 24px;word-break:break-word">
    <div style="Margin:0 auto;background:#f9f9fa;background-color:#f9f9fa;border-radius:16px;overflow:hidden;max-width:536px">
    <table align="center" border="0" cellpadding="0" cellspacing="0" style="border:0;border-collapse:collapse;border-spacing:0;padding:0;width:100%" width="536"><tbody>
      <tr><td style="background:#fff;background-color:#fff;border:0;color:#141419;font-size:0;line-height:0;padding:24px;text-align:left;vertical-align:top;width:488px;border-radius:16px;overflow:hidden">
        <div style="max-width:488px;Margin:0 auto"><table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;background-color:#fff;width:100%"><tbody>
          <tr><td align="center" style="font-size:0;padding:0;word-break:break-word">
            <p style="Margin:0 0 16px;color:#141419;display:block;font-family:Arial,Verdana,sans-serif;font-size:18px;line-height:21.6px;text-align:left;font-weight:700;letter-spacing:-0.36px;text-transform:uppercase;font-style:italic"><b style="color:#141419;font-weight:700">Код подтверждения</b></p>
            <p style="Margin:0 0 16px;color:#141419;display:block;font-family:Arial,Verdana,sans-serif;font-size:16px;line-height:22.4px;text-align:left;font-weight:400">Вы пытаетесь войти в админ-панель WINLINE</p>
          </td></tr>
          <tr><td align="center" style="padding:0;text-align:center">
            <div style="background-color:#F2F4F7;border-radius:12px;padding:24px;color:#141419;display:block;font-family:Arial,Verdana,sans-serif;font-size:24px;line-height:28.8px;text-align:center;font-weight:700;font-style:italic">${code}</div>
          </td></tr>
          <tr><td style="font-size:0;padding:0;word-break:break-word">
            <p style="Margin:16px 0 0;color:#707070;width:100%;max-width:336px;display:block;font-family:Arial,Verdana,sans-serif;font-size:12px;line-height:14.4px;text-align:left;font-weight:400">Код действителен 10&nbsp;минут. Если это были не&nbsp;вы&nbsp;— проигнорируйте это письмо и&nbsp;немедленно смените пароль.</p>
          </td></tr>
        </tbody></table></div>
      </td></tr>
    </tbody></table></div>
  </td></tr>
  <tr><td style="font-size:0;padding:0 20px 24px;word-break:break-word">
    <div style="max-width:536px;margin:0 auto;padding-top:24px;border-top:1px solid #CCCCCC">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse"><tbody>
      <tr><td>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:0;border-collapse:collapse;border-spacing:0;padding:0;width:100%">
          <tr><td style="display:block;text-align:left;padding-bottom:16px"><div style="width:314px">${logoImg}</div></td></tr>
          <tr><td style="display:block;word-wrap:break-word">
            <p style="margin:0;font-family:Arial,Verdana;font-size:12px;font-weight:400;font-style:normal;line-height:14.4px;color:#707070;white-space:normal;letter-spacing:0px">2025 © Букмекерская контора WINLINE – российская букмекерская контора, осуществляющая деятельность на территории РФ на основании лицензии на осуществление деятельности по организации и проведению азартных игр в букмекерских конторах или тотализаторах № Л027‑00108-77/00395482 от 09.07.2009 г., предоставленной ООО «Управляющая компания НКС» (ОГРН: 1077758954635; ИНН: 7714707736; место нахождения: 123112, г. Москва, Пресненская набережная, д. 8, стр. 1, этаж 11; полное фирменное наименование: Общество с ограниченной ответственностью «Управляющая компания Национального коневодческого союза»; сокращенное фирменное наименование: ООО «Управляющая компания НКС»; коммерческое обозначение: Букмекерская контора WINLINE, БК WINLINE; товарный знак: WINLINE).</p>
          </td></tr>
        </table>
      </td></tr>
    </tbody></table></div>
  </td></tr>
</table>
</td></tr></tbody></table>
</div>
</center></td></tr></table>
</div>
</body></html>`;
}

export async function sendOtpEmail(to, code) {
  const subject = `Код подтверждения: ${code}`;
  const text = `Ваш одноразовый код для входа в админ-панель Winline: ${code}\n\n` +
    `Код действителен 10 минут. Если это были не вы — проигнорируйте письмо и немедленно смените пароль.`;
  const html = otpHtml(code);
  return sendMail({ to, subject, text, html });
}
