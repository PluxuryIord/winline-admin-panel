import { Router } from 'express';
import dbPool from '../config/db.js';
import { WEBHOOK_SECRET } from '../config/env.js';
import { tgSend } from '../services/telegram.js';

const router = Router();

// ===================== SSE =====================

const sseClients = new Set();

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { client.write(data); } catch { sseClients.delete(client); }
  }
}

// GET /api/chats/stream — SSE поток
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ===================== WEBHOOK (отдельный роутер, без JWT) =====================

async function handleWebhook(req, res, next) {
  if (!WEBHOOK_SECRET || req.headers['x-webhook-secret'] !== WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Invalid webhook secret' });
  }

  try {
    const { user_id, text, username, full_name } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    // Находим или создаём чат
    let [chats] = await dbPool.query('SELECT id FROM wl_admin_chats WHERE user_id = ?', [user_id]);
    let chatId;
    if (!chats.length) {
      const [result] = await dbPool.query('INSERT INTO wl_admin_chats (user_id) VALUES (?)', [user_id]);
      chatId = result.insertId;
    } else {
      chatId = chats[0].id;
    }

    // Сохраняем сообщение
    const msgText = text || '';
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_chat_messages (chat_id, sender, text) VALUES (?, ?, ?)',
      [chatId, 'user', msgText]
    );

    const newMsg = {
      id: result.insertId,
      from: 'user',
      text: msgText,
      time: new Date().toISOString(),
    };

    // SSE push
    broadcast({
      type: 'new_message',
      chatId,
      userId: user_id,
      username: username || '',
      fullName: full_name || '',
      message: newMsg,
    });

    res.json({ ok: true, chatId, messageId: result.insertId });
  } catch (err) { next(err); }
}

// Отдельный роутер для монтирования ДО JWT middleware
export const webhookRouter = Router();
webhookRouter.post('/', handleWebhook);

// ===================== CRUD =====================

// GET /api/chats
router.get('/', async (req, res, next) => {
  try {
    const [chats] = await dbPool.query('SELECT id, user_id AS userId, created_at FROM wl_admin_chats ORDER BY created_at DESC');
    const chatIds = chats.map(c => c.id);

    let messagesMap = {};
    if (chatIds.length) {
      const [msgs] = await dbPool.query(
        'SELECT id, chat_id, sender AS `from`, text, created_at AS time FROM wl_admin_chat_messages WHERE chat_id IN (?) ORDER BY created_at ASC',
        [chatIds]
      );
      for (const m of msgs) {
        if (!messagesMap[m.chat_id]) messagesMap[m.chat_id] = [];
        messagesMap[m.chat_id].push({ id: m.id, from: m.from, text: m.text, time: m.time });
      }
    }

    res.json(chats.map(c => ({
      id: c.id,
      userId: c.userId,
      messages: messagesMap[c.id] || [],
    })));
  } catch (err) { next(err); }
});

// GET /api/chats/by-user/:userId
router.get('/by-user/:userId', async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    let [chats] = await dbPool.query('SELECT id, user_id AS userId FROM wl_admin_chats WHERE user_id = ?', [userId]);

    let chat;
    if (!chats.length) {
      const [result] = await dbPool.query('INSERT INTO wl_admin_chats (user_id) VALUES (?)', [userId]);
      chat = { id: result.insertId, userId, messages: [] };
    } else {
      chat = { id: chats[0].id, userId: chats[0].userId };
      const [msgs] = await dbPool.query(
        'SELECT id, sender AS `from`, text, created_at AS time FROM wl_admin_chat_messages WHERE chat_id = ? ORDER BY created_at ASC',
        [chat.id]
      );
      chat.messages = msgs.map(m => ({ id: m.id, from: m.from, text: m.text, time: m.time }));
    }

    res.json(chat);
  } catch (err) { next(err); }
});

// POST /api/chats/:id/messages — админ отправляет сообщение → Telegram
router.post('/:id/messages', async (req, res, next) => {
  try {
    const chatId = Number(req.params.id);
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

    // Чат + user_id
    const [chats] = await dbPool.query('SELECT id, user_id FROM wl_admin_chats WHERE id = ?', [chatId]);
    if (!chats.length) return res.status(404).json({ error: 'Чат не найден' });

    const userId = chats[0].user_id;

    // Сохраняем в БД
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_chat_messages (chat_id, sender, text) VALUES (?, ?, ?)',
      [chatId, 'admin', text.trim()]
    );

    const newMsg = {
      id: result.insertId,
      from: 'admin',
      text: text.trim(),
      time: new Date().toISOString(),
    };

    // Отправляем в Telegram
    let tgError = null;
    try {
      const tgResult = await tgSend(userId, text.trim());
      if (!tgResult.ok) {
        tgError = tgResult.description || 'Telegram error';
      }
    } catch (err) {
      tgError = err.message;
    }

    // SSE push
    broadcast({
      type: 'new_message',
      chatId,
      userId,
      message: newMsg,
    });

    res.status(201).json({
      ...newMsg,
      tgError: tgError || undefined,
    });
  } catch (err) { next(err); }
});

// DELETE /api/chats/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await dbPool.query('DELETE FROM wl_admin_chats WHERE id = ?', [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
