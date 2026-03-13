import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import mysql from 'mysql2/promise';
import { getAllNested, getById, create, update, remove } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.API_PORT || 3001;

// --- Читаем .env проекта (IAP_TOKEN, IAP_URL и т.д.) ---
function parseProjectEnv() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf-8');
    return Object.fromEntries(
      raw.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}
const projectEnv = parseProjectEnv();
const IAP_URL   = process.env.IAP_URL   || projectEnv.IAP_URL   || '';
const IAP_TOKEN = process.env.IAP_TOKEN || projectEnv.IAP_TOKEN || '';

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

// --- Bot DB: прямое подключение к MySQL бота ---
// Читаем .env бота (оба проекта лежат рядом: ../WLPartnersBot)

// BOT_DIR берётся из переменной окружения (задаётся в .env или systemd-сервисе)
// Fallback: папка рядом с проектом называется WLPartnersBot (локальная разработка)
const BOT_DIR = process.env.BOT_DIR || path.resolve(__dirname, '..', '..', 'WLPartnersBot');
const PYTHON_BIN = process.platform === 'win32'
  ? path.join(BOT_DIR, 'venv', 'Scripts', 'python.exe')
  : path.join(BOT_DIR, 'venv', 'bin', 'python3');

// Парсим .env файл бота
function parseBotEnv() {
  try {
    const raw = fs.readFileSync(path.join(BOT_DIR, '.env'), 'utf-8');
    return Object.fromEntries(
      raw.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return null; }
}

let botDb = null;
const botEnv = parseBotEnv();
if (botEnv?.MYSQL_HOST) {
  botDb = mysql.createPool({
    host: botEnv.MYSQL_HOST,
    port: parseInt(botEnv.MYSQL_PORT || '3306'),
    user: botEnv.MYSQL_USER,
    password: botEnv.MYSQL_PASSWORD,
    database: botEnv.MYSQL_DATABASE,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
  });
  console.log('[bot-db] Connected to bot MySQL:', botEnv.MYSQL_DATABASE);
} else {
  console.warn('[bot-db] Bot .env not found or MYSQL_* vars missing — bot routes unavailable');
}

// Alert data template (matches bot's Alert.add() format)
const makeAlertData = (text) => JSON.stringify({
  alert_type: 'text',
  text,
  files: [],
  buttons: [],
  files_counter: { all: 0, photo: 0, video: 0, document: 0, animation: 0, sticker: false, video_note: false, voice: false },
});

// GET /api/bot/users/count?audience=all|registered|me
app.get('/api/bot/users/count', async (req, res) => {
  if (!botDb) return res.status(503).json({ error: 'Bot DB not configured' });
  try {
    const audience = req.query.audience || 'all';
    let sql = 'SELECT COUNT(*) AS count FROM users WHERE banned = 0';
    if (audience === 'registered') sql += ' AND registered = 1';
    if (audience === 'me') sql += ' AND user_id IN (SELECT admin_id FROM admins LIMIT 1)';
    const [[row]] = await botDb.query(sql);
    res.json({ count: Number(row.count), audience });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bot/broadcasts — история рассылок из БД бота
app.get('/api/bot/broadcasts', async (req, res) => {
  if (!botDb) return res.status(503).json({ error: 'Bot DB not configured' });
  try {
    const [rows] = await botDb.query(
      'SELECT id, data, status_code, date_sent, successfully_sent, error_sent FROM alerts WHERE status_code != 0 ORDER BY id DESC LIMIT 100'
    );
    const statusMap = { 1: 'sending', 201: 'published' };
    res.json(rows.map(r => {
      const d = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
      return {
        id: r.id,
        text: (d.text || '').substring(0, 120),
        alert_type: d.alert_type,
        status: statusMap[r.status_code] || 'unknown',
        date_sent: r.date_sent,
        successfully_sent: r.successfully_sent,
        error_sent: r.error_sent,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bot/broadcasts — создать и отправить рассылку
app.post('/api/bot/broadcasts', async (req, res) => {
  if (!botDb) return res.status(503).json({ error: 'Bot DB not configured' });
  const { text, audience } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  try {
    // Получаем admin_id
    const [[admin]] = await botDb.query('SELECT admin_id FROM admins LIMIT 1');
    if (!admin) return res.status(500).json({ error: 'No admins in bot DB' });

    // Получаем список получателей
    let usersSql = 'SELECT user_id FROM users WHERE banned = 0';
    if (audience === 'registered') usersSql += ' AND registered = 1';
    if (audience === 'me')         usersSql += ' AND user_id IN (SELECT admin_id FROM admins LIMIT 1)';
    const [users] = await botDb.query(usersSql);
    if (!users.length) return res.status(400).json({ error: 'No users found for selected audience' });

    // Создаём запись рассылки
    const recipients = JSON.stringify(Object.fromEntries(users.map(u => [u.user_id, 0])));
    const [result] = await botDb.query(
      `INSERT INTO alerts (data, status_code, admin_id, recipients, successfully_sent, error_sent, dispatch_log)
       VALUES (?, 0, ?, ?, 0, 0, '⏳Рассылка запускается...\n\n')`,
      [makeAlertData(text.trim()), admin.admin_id, recipients]
    );
    const alertId = result.insertId;

    // Запускаем background_alert.py (фоновый процесс)
    spawn(PYTHON_BIN, ['-m', 'background_alert', String(alertId)], {
      cwd: BOT_DIR,
      detached: true,
      stdio: 'ignore',
    }).unref();

    res.json({ alert_id: alertId, recipients_count: users.length, status: 'sending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- IAP API helpers ---

// Вычисляем диапазон дат по названию периода
function getPeriodDates(period) {
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const ago = (days) => { const d = new Date(now); d.setDate(d.getDate() - days); return d; };
  const today = fmt(now);
  switch (period) {
    case 'today':  return { start: today, end: today };
    case '24h':    return { start: fmt(ago(1)), end: today };
    case 'week':   return { start: fmt(ago(7)), end: today };
    case 'month':  return { start: fmt(ago(30)), end: today };
    case 'year':   return { start: fmt(ago(365)), end: today };
    default:       return { start: '2020-01-01', end: today }; // all time
  }
}

// Кеш IAP ответов: ключ = period, значение = { data, ts }
const iapCache = new Map();
const IAP_CACHE_TTL = 5 * 60 * 1000; // 5 минут

// Одиночный GraphQL запрос к IAP
async function iapQuery(query, timeoutMs = 40000) {
  if (!IAP_URL || !IAP_TOKEN) throw new Error('IAP не настроен (нет IAP_URL или IAP_TOKEN в .env)');
  const res = await fetch(IAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${IAP_TOKEN}`,
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`IAP HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.[0]) throw new Error(json.errors[0].message);
  return json.data;
}

// GET /api/iap/analytics?period=today|24h|week|month|year|all
app.get('/api/iap/analytics', async (req, res) => {
  res.setTimeout(180000); // 3 мин — запас на медленный демо-сервер

  const period = req.query.period || 'month';

  // Отдаём кеш если свежий
  const cached = iapCache.get(period);
  if (cached && Date.now() - cached.ts < IAP_CACHE_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const { start, end } = getPeriodDates(period);

  const makeQuery = (statusFilter) => {
    const where = statusFilter !== null
      ? `where: { status: ${statusFilter}, start: "${start}", end: "${end}" }`
      : `where: { start: "${start}", end: "${end}" }`;
    return `{ conversions(${where}) { count } }`;
  };

  try {
    // Пробуем параллельно (быстрее на нормальном сервере)
    const [rTotal, rConfirmed, rPending, rCancelled] = await Promise.all([
      iapQuery(makeQuery(null)),
      iapQuery(makeQuery(2)),
      iapQuery(makeQuery(1)),
      iapQuery(makeQuery(3)),
    ]);

    const total     = rTotal.conversions.count;
    const confirmed = rConfirmed.conversions.count;
    const pending   = rPending.conversions.count;
    const cancelled = rCancelled.conversions.count;
    const confirmRate = total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0.0';

    const data = { total, confirmed, pending, cancelled, confirmRate, period, start, end };
    iapCache.set(period, { data, ts: Date.now() });
    res.json(data);
  } catch (parallelErr) {
    // Если параллельные упали — пробуем последовательно
    console.warn('[iap] Parallel failed, trying sequential:', parallelErr.message);
    try {
      const rTotal     = await iapQuery(makeQuery(null), 45000);
      const rConfirmed = await iapQuery(makeQuery(2), 45000);
      const rPending   = await iapQuery(makeQuery(1), 45000);
      const rCancelled = await iapQuery(makeQuery(3), 45000);

      const total     = rTotal.conversions.count;
      const confirmed = rConfirmed.conversions.count;
      const pending   = rPending.conversions.count;
      const cancelled = rCancelled.conversions.count;
      const confirmRate = total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0.0';

      const data = { total, confirmed, pending, cancelled, confirmRate, period, start, end };
      iapCache.set(period, { data, ts: Date.now() });
      res.json(data);
    } catch (seqErr) {
      res.status(500).json({ error: seqErr.message });
    }
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
