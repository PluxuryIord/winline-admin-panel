import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseProjectEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', '.env'), 'utf-8');
    return Object.fromEntries(
      raw.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}

const projectEnv = parseProjectEnv();

export const API_PORT = Number(process.env.API_PORT || projectEnv.API_PORT || 3001);
export const BOT_TOKEN = process.env.BOT_TOKEN || projectEnv.BOT_TOKEN || '';
export const JWT_SECRET = process.env.JWT_SECRET || projectEnv.JWT_SECRET || '';
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || projectEnv.WEBHOOK_SECRET || '';

export const MYSQL_HOST = process.env.MYSQL_HOST || projectEnv.MYSQL_HOST || '';
export const MYSQL_PORT = Number(process.env.MYSQL_PORT || projectEnv.MYSQL_PORT || 3306);
export const MYSQL_USER = process.env.MYSQL_USER || projectEnv.MYSQL_USER || '';
export const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || projectEnv.MYSQL_PASSWORD || '';
export const MYSQL_DATABASE = process.env.MYSQL_DATABASE || projectEnv.MYSQL_DATABASE || '';

// S3 (Timeweb Cloud)
export const S3_ENDPOINT = process.env.S3_ENDPOINT || projectEnv.S3_ENDPOINT || '';
export const S3_BUCKET = process.env.S3_BUCKET || projectEnv.S3_BUCKET || '';
export const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || projectEnv.S3_ACCESS_KEY || '';
export const S3_SECRET_KEY = process.env.S3_SECRET_KEY || projectEnv.S3_SECRET_KEY || '';

// Telegram admin chat ID for getting file_id (bot sends photo here and deletes it)
export const TG_ADMIN_CHAT_ID = process.env.TG_ADMIN_CHAT_ID || projectEnv.TG_ADMIN_CHAT_ID || '';

// Bot admin API (Python aiohttp on bot server, port 5050)
export const BOT_API_URL = process.env.BOT_API_URL || projectEnv.BOT_API_URL || '';

// Google Sheets (service account credentials JSON string)
export const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT || projectEnv.GOOGLE_SERVICE_ACCOUNT || '';
export const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || projectEnv.GOOGLE_SPREADSHEET_ID || '';

// --- SMTP (2FA OTP emails) ---
export const SMTP_HOST = process.env.SMTP_HOST || projectEnv.SMTP_HOST || '';
export const SMTP_PORT = Number(process.env.SMTP_PORT || projectEnv.SMTP_PORT || 465);
export const SMTP_SECURE = String(process.env.SMTP_SECURE || projectEnv.SMTP_SECURE || 'true') === 'true';
export const SMTP_USER = process.env.SMTP_USER || projectEnv.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || projectEnv.SMTP_PASS || '';
export const SMTP_FROM = process.env.SMTP_FROM || projectEnv.SMTP_FROM || '';
export const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || projectEnv.SMTP_FROM_NAME || 'Winline Admin';

// Set OTP_2FA=0 в .env чтобы выключить 2FA (нужно при первой раскатке, пока у админов нет email)
export const OTP_2FA_ENABLED = String(process.env.OTP_2FA || projectEnv.OTP_2FA || '1') !== '0';
