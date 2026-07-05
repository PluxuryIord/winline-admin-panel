import crypto from 'crypto';
import { BOT_TOKEN } from '../config/env.js';

// Validates Telegram WebApp initData (X-Telegram-Init-Data header) per
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// secret = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN); signature over the
// sorted key=value data-check-string. Identity is ALWAYS taken from here —
// request bodies never carry a user id.

const MAX_AGE_SEC = Number(process.env.MINIAPP_INITDATA_MAX_AGE || 86400);
// Dev bypass is double-gated: explicit flag AND not production.
const DEV_BYPASS = process.env.MINIAPP_DEV_BYPASS === '1' && process.env.NODE_ENV !== 'production';

export default function telegramInitData(req, res, next) {
  if (DEV_BYPASS && req.headers['x-dev-telegram-id']) {
    const id = Number(req.headers['x-dev-telegram-id']);
    if (!Number.isFinite(id) || id <= 0) return res.status(401).json({ error: 'bad dev id' });
    req.tgUser = { id, first_name: 'Dev' };
    return next();
  }

  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен' });

  const raw = String(req.headers['x-telegram-init-data'] || '');
  if (!raw || raw.length > 4096) return res.status(401).json({ error: 'no_init_data' });

  let params;
  try { params = new URLSearchParams(raw); } catch { return res.status(401).json({ error: 'bad_init_data' }); }
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return res.status(401).json({ error: 'no_hash' });
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'bad_signature' });
  }

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) {
    // Distinct code: the client shows "reopen the mini app" instead of a generic error.
    return res.status(401).json({ error: 'initData устарела', code: 'INITDATA_EXPIRED' });
  }

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { /* noop */ }
  if (!user?.id) return res.status(401).json({ error: 'no_user' });

  req.tgUser = user; // { id, first_name, last_name?, username?, ... }
  next();
}
