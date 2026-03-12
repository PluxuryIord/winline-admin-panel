import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { getAllNested, getById, create, update, remove } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.API_PORT || 3001;

// --- Автоинициализация данных ---
// Если файл данных не существует — копируем из .example.json
// Это защищает от потери данных при git pull
const dataFiles = ['chats', 'knowledge'];
for (const name of dataFiles) {
  const dataPath = path.join(__dirname, 'data', `${name}.json`);
  const examplePath = path.join(__dirname, 'data', `${name}.example.json`);
  if (!fs.existsSync(dataPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, dataPath);
    console.log(`[init] Created ${name}.json from ${name}.example.json`);
  }
}

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

// --- Bot API Proxy (port 5050 → /api/bot/*) ---
// Routes that proxy to admin_api.py running alongside the bot

const BOT_API_HOST = '127.0.0.1';
const BOT_API_PORT = 5050;

function proxyBotApi(req, res, targetPath, method, bodyObj) {
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
  const options = {
    hostname: BOT_API_HOST,
    port: BOT_API_PORT,
    path: targetPath,
    method: method || req.method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

  const proxyReq = http.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', chunk => { data += chunk; });
    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode);
      try { res.json(JSON.parse(data)); } catch { res.send(data); }
    });
  });

  proxyReq.on('error', () => {
    res.status(503).json({ error: 'Bot API unavailable. Is admin_api.py running?' });
  });

  if (bodyStr) proxyReq.write(bodyStr);
  proxyReq.end();
}

app.get('/api/bot/users/count', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  proxyBotApi(req, res, `/users/count${qs ? '?' + qs : ''}`);
});

app.get('/api/bot/broadcasts', (req, res) => {
  proxyBotApi(req, res, '/broadcasts');
});

app.post('/api/bot/broadcasts', (req, res) => {
  proxyBotApi(req, res, '/broadcasts', 'POST', req.body);
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
