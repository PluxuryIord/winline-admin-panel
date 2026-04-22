#!/usr/bin/env node
/**
 * Проверка SMTP-конфига без захода в панель.
 * Usage:
 *   node server/scripts/test-smtp.js                  # только verify (соединение + креды)
 *   node server/scripts/test-smtp.js you@example.com  # + отправить тестовое письмо
 */
import { verifyMailer, sendMail, isMailerConfigured } from '../lib/mailer.js';
import {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_FROM,
} from '../config/env.js';

(async () => {
  console.log('[smtp] config:',
    { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_FROM, configured: isMailerConfigured() });

  try {
    console.log('[smtp] verify...');
    await verifyMailer();
    console.log('[smtp] ✓ verify OK');
  } catch (e) {
    console.error('[smtp] ✗ verify FAILED:', e.code || '', e.message);
    process.exit(1);
  }

  const to = process.argv[2];
  if (to) {
    try {
      console.log(`[smtp] sending test email to ${to}...`);
      const info = await sendMail({
        to,
        subject: 'Winline Admin — тест SMTP',
        text: 'Если ты это читаешь — SMTP настроен правильно.',
        html: '<p>Если ты это читаешь — SMTP настроен правильно.</p>',
      });
      console.log('[smtp] ✓ sent:', info.messageId, 'response:', info.response);
    } catch (e) {
      console.error('[smtp] ✗ send FAILED:', e.code || '', e.message);
      process.exit(1);
    }
  }
  process.exit(0);
})();
