import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getAllNested, getById, create, update, remove } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(express.json({ limit: '5mb' }));

// --- API Routes ---

app.get('/api/knowledge', (req, res) => {
  try {
    res.json(getAllNested());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/knowledge/:id', (req, res) => {
  try {
    const article = getById(Number(req.params.id));
    if (!article) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/knowledge', (req, res) => {
  try {
    const { title, content, parent_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const article = create({ title, content, parent_id: parent_id || null });
    res.status(201).json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/knowledge/:id', (req, res) => {
  try {
    const existing = getById(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const article = update(Number(req.params.id), req.body);
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/knowledge/:id', (req, res) => {
  try {
    const existing = getById(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Not found' });
    remove(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Chats helpers ---
const CHATS_FILE = path.join(__dirname, 'data', 'chats.json');
const readChats = () => JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
const writeChats = (data) => fs.writeFileSync(CHATS_FILE, JSON.stringify(data, null, 2), 'utf-8');

// GET /api/chats
app.get('/api/chats', (req, res) => {
  try {
    res.json(readChats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chats/:id
app.delete('/api/chats/:id', (req, res) => {
  try {
    const chats = readChats();
    const idx = chats.findIndex(c => c.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    chats.splice(idx, 1);
    writeChats(chats);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chats/by-user/:userId — find or create chat for user
app.get('/api/chats/by-user/:userId', (req, res) => {
  try {
    const chats = readChats();
    const userId = Number(req.params.userId);
    let chat = chats.find(c => c.userId === userId);
    if (!chat) {
      chat = { id: (chats.at(-1)?.id || 0) + 1, userId, messages: [] };
      chats.push(chat);
      writeChats(chats);
    }
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chats/:id/messages
app.post('/api/chats/:id/messages', (req, res) => {
  try {
    const chats = readChats();
    const chat = chats.find(c => c.id === Number(req.params.id));
    if (!chat) return res.status(404).json({ error: 'Not found' });
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });
    const newMsg = {
      id: (chat.messages.at(-1)?.id || 0) + 1,
      from: 'admin',
      text: text.trim(),
      time: new Date().toISOString()
    };
    chat.messages.push(newMsg);
    writeChats(chats);
    res.status(201).json(newMsg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Production: serve Vite build ---
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('/{0,}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
