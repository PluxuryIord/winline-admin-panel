import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

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

    const result = chats.map(c => ({
      id: c.id,
      userId: c.userId,
      messages: messagesMap[c.id] || [],
    }));

    res.json(result);
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

// POST /api/chats/:id/messages
router.post('/:id/messages', async (req, res, next) => {
  try {
    const chatId = Number(req.params.id);
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

    // Проверяем что чат существует
    const [chats] = await dbPool.query('SELECT id FROM wl_admin_chats WHERE id = ?', [chatId]);
    if (!chats.length) return res.status(404).json({ error: 'Чат не найден' });

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

    res.status(201).json(newMsg);
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
