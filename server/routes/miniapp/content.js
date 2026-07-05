import { Router } from 'express';
import dbPool from '../../config/db.js';
import { getPublicKnowledge } from '../knowledge.js';
import requireAuthorized from './requireAuthorized.js';

// Read-only content for the Mini App, sourced from the same `texts` rows the
// bot renders: knowledge_base JSON and bot_scenarios screens. Editing stays in
// the panel; the mini app only mirrors what the bot would show.

const router = Router();

// Screens a partner may read. Everything else (admin/event/system screens) 404s.
const SCREEN_WHITELIST = new Set(['offer_page', 'promo_page', 'socials_page']);

async function loadScreens() {
  const [rows] = await dbPool.query(
    "SELECT data FROM texts WHERE category = 'bot_scenarios' LIMIT 1"
  );
  if (!rows.length) return null;
  const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  return data?.screens || null;
}

function shapeScreen(id, screen) {
  const messages = [];
  for (const [key, m] of Object.entries(screen.messages || {})) {
    if (m?.text) messages.push({ key, label: m.label || '', text: m.text });
  }
  const buttons = [];
  const order = screen.buttons?._order || [];
  for (const bk of order) {
    const b = screen.buttons?.[bk];
    const action = String(b?.action || '');
    if (action.startsWith('url:')) {
      buttons.push({ key: bk, label: b.label || '', url: action.slice(4) });
    }
    // callback:-кнопки бота в Mini App не имеют смысла — пропускаем
  }
  return { id, title: screen.title || id, messages, buttons };
}

// GET /api/miniapp/content/kb
router.get('/kb', requireAuthorized, async (req, res, next) => {
  try {
    const { articles } = await getPublicKnowledge();
    res.json({ articles });
  } catch (err) { next(err); }
});

// GET /api/miniapp/content/screen/:id — offer_page | promo_page | socials_page
router.get('/screen/:id', requireAuthorized, async (req, res, next) => {
  try {
    const id = String(req.params.id || '');
    if (!SCREEN_WHITELIST.has(id)) return res.status(404).json({ error: 'unknown screen' });
    const screens = await loadScreens();
    const screen = screens?.[id];
    if (!screen) return res.status(404).json({ error: 'screen not found' });
    res.json(shapeScreen(id, screen));
  } catch (err) { next(err); }
});

// GET /api/miniapp/content/links — url-кнопки главного меню (чат с менеджером и пр.)
router.get('/links', requireAuthorized, async (req, res, next) => {
  try {
    const screens = await loadScreens();
    const menu = screens?.main_menu;
    let chatManagerUrl = null;
    if (menu?.buttons) {
      const chat = menu.buttons.btn_chat;
      const action = String(chat?.action || '');
      if (action.startsWith('url:')) chatManagerUrl = action.slice(4);
      if (!chatManagerUrl) {
        // fallback: первая url-кнопка меню, ведущая в t.me
        for (const bk of menu.buttons._order || []) {
          const a = String(menu.buttons[bk]?.action || '');
          if (a.startsWith('url:https://t.me/')) { chatManagerUrl = a.slice(4); break; }
        }
      }
    }
    res.json({ chat_manager_url: chatManagerUrl });
  } catch (err) { next(err); }
});

export default router;
