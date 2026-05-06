#!/usr/bin/env node
/**
 * Загрузить картинки шаблона OTP-письма в S3 и распечатать публичные URL.
 *
 * Usage:
 *   node server/scripts/upload-email-images.js <header.png> <logo-welcome.png>
 *
 * Получите два URL — пропишите их в .env как EMAIL_HEADER_URL и EMAIL_LOGO_URL,
 * затем `systemctl restart wl_admin_panel`.
 */
import fs from 'fs';
import path from 'path';
import { uploadToS3 } from '../services/s3.js';

async function run() {
  const [, , headerPath, logoPath] = process.argv;
  if (!headerPath || !logoPath) {
    console.error('Usage: node server/scripts/upload-email-images.js <header.png> <logo-welcome.png>');
    process.exit(1);
  }
  for (const p of [headerPath, logoPath]) {
    if (!fs.existsSync(p)) {
      console.error(`Файл не найден: ${p}`);
      process.exit(1);
    }
  }

  const headerBuf = fs.readFileSync(headerPath);
  const logoBuf = fs.readFileSync(logoPath);

  const header = await uploadToS3(headerBuf, path.basename(headerPath), 'image/png', 'email-templates');
  const logo = await uploadToS3(logoBuf, path.basename(logoPath), 'image/png', 'email-templates');

  console.log('\nДобавьте в /var/www/winline-source/.env:\n');
  console.log(`EMAIL_HEADER_URL=${header.url}`);
  console.log(`EMAIL_LOGO_URL=${logo.url}`);
  console.log('\nПотом: systemctl restart wl_admin_panel\n');
}

run().catch(err => { console.error(err); process.exit(1); });
