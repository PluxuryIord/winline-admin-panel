import { Router } from 'express';
import { BOT_API_URL, BOT_API_KEY } from '../../config/env.js';
import requireAuthorized from './requireAuthorized.js';

// Partner stats for the Mini App. The aggregation lives bot-side (admin_api →
// db_admon, single implementation shared with the bot's stats screen); this is
// a thin proxy in the alarms.js /counts style. tg id comes ONLY from validated
// initData — never from the client query.

const router = Router();

async function proxy(path, res) {
  if (!BOT_API_URL) {
    return res.json({ unavailable: 'BOT_API_URL не задан' });
  }
  try {
    const r = await fetch(`${BOT_API_URL.replace(/\/$/, '')}${path}`, {
      headers: { ...(BOT_API_KEY ? { 'X-API-Key': BOT_API_KEY } : {}) },
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 404) return res.status(404).json(data);
      return res.json({ unavailable: data.error || `бот ответил ${r.status}` });
    }
    res.json(data);
  } catch (e) {
    res.json({ unavailable: e.message });
  }
}

// GET /api/miniapp/stats/summary
router.get('/summary', requireAuthorized, (req, res) =>
  proxy(`/miniapp/stats/summary?tg_user_id=${req.tgUser.id}`, res));

// GET /api/miniapp/stats/daily?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/daily', requireAuthorized, (req, res) => {
  const start = String(req.query.start || '').slice(0, 10);
  const end = String(req.query.end || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return res.status(400).json({ error: 'start/end в формате YYYY-MM-DD' });
  }
  proxy(`/miniapp/stats/daily?tg_user_id=${req.tgUser.id}&start=${start}&end=${end}`, res);
});

export default router;
