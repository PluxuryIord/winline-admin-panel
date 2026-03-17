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

export const MYSQL_HOST = process.env.MYSQL_HOST || projectEnv.MYSQL_HOST || '';
export const MYSQL_PORT = Number(process.env.MYSQL_PORT || projectEnv.MYSQL_PORT || 3306);
export const MYSQL_USER = process.env.MYSQL_USER || projectEnv.MYSQL_USER || '';
export const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || projectEnv.MYSQL_PASSWORD || '';
export const MYSQL_DATABASE = process.env.MYSQL_DATABASE || projectEnv.MYSQL_DATABASE || '';
