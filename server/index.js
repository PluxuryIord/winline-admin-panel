import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { getAllNested, getById, create, update, remove } from './db.js';

// --- Ловим необработанные ошибки чтобы сервер не падал молча ---
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.API_PORT || 3001;

console.log('[env] NODE_ENV:', process.env.NODE_ENV);
console.log('[env] node:', process.version);

// --- Читаем .env проекта ---
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
const BOT_TOKEN = process.env.BOT_TOKEN || projectEnv.BOT_TOKEN || '';
console.log('[bot] BOT_TOKEN:', BOT_TOKEN ? 'set' : 'NOT SET');

// --- MySQL пул для таблицы users ---
const MYSQL_HOST = process.env.MYSQL_HOST || projectEnv.MYSQL_HOST || '';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || projectEnv.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || projectEnv.MYSQL_USER || '';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || projectEnv.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || projectEnv.MYSQL_DATABASE || '';

let dbPool = null;
if (MYSQL_HOST && MYSQL_USER && MYSQL_DATABASE) {
  dbPool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10000,
  });
  console.log('[db] MySQL pool created for', MYSQL_DATABASE, '@', MYSQL_HOST);
} else {
  console.warn('[db] MySQL не настроен — добавьте MYSQL_HOST/USER/DATABASE в .env');
}

// --- Автоинициализация данных ---
const dataFiles = ['chats', 'knowledge'];
for (const name of dataFiles) {
  const dataPath = path.join(__dirname, 'data', `${name}.json`);
  const examplePath = path.join(__dirname, 'data', `${name}.example.json`);
  if (!fs.existsSync(dataPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, dataPath);
    console.log(`[init] Created ${name}.json from ${name}.example.json`);
  }
}

// Инициализация JSON-файлов для рассылок
const BROADCASTS_FILE = path.join(__dirname, 'data', 'broadcasts.json');
const CHANNELS_FILE = path.join(__dirname, 'data', 'channels.json');
const TAGS_FILE = path.join(__dirname, 'data', 'tags.json');
const GROUPS_FILE = path.join(__dirname, 'data', 'groups.json');
if (!fs.existsSync(BROADCASTS_FILE)) fs.writeFileSync(BROADCASTS_FILE, '[]', 'utf-8');
if (!fs.existsSync(CHANNELS_FILE)) fs.writeFileSync(CHANNELS_FILE, '[]', 'utf-8');
if (!fs.existsSync(TAGS_FILE)) fs.writeFileSync(TAGS_FILE, '{}', 'utf-8');
if (!fs.existsSync(GROUPS_FILE)) fs.writeFileSync(GROUPS_FILE, '[]', 'utf-8');

const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');

app.use(express.json({ limit: '5mb' }));

// --- Статика для загруженных файлов ---
const uploadsDir = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// POST /api/upload — загрузка изображения (base64)
app.post('/api/upload', (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data' });

    const match = data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid image data' });

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, name), buffer);

    res.json({ url: `/uploads/${name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Users (из MySQL) ---

// Хелпер: получить теги из файла
function getUserTags() {
  try { return JSON.parse(fs.readFileSync(TAGS_FILE, 'utf-8')); } catch { return {}; }
}
function saveUserTags(data) {
  fs.writeFileSync(TAGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function mapUserRow(r, tagsMap) {
  const userId = String(r.user_id);
  // Если у пользователя нет записи в tags.json — даём дефолт ['Старый пользователь']
  // Если запись есть (даже пустой массив []) — значит админ уже редактировал, уважаем его выбор
  const tags = userId in tagsMap ? tagsMap[userId] : ['Старый пользователь'];
  return {
    id: r.user_id,
    fullName: r.rl_full_name || r.full_name || '—',
    telegram: r.username ? `@${r.username}` : '—',
    registrationDate: r.date_reg ? new Date(r.date_reg).toISOString().split('T')[0] : '—',
    banned: !!r.banned,
    role: r.role || '—',
    graph: r.graph || '—',
    phone: r.phone_number || '—',
    registered: !!r.registered,
    personalLabel: !!r.personal_label,
    showQr: !!r.show_qr,
    tags,
  };
}

// GET /api/users?limit=50&offset=0&search=...
app.get('/api/users', async (req, res) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const search = (req.query.search || '').trim();
    const tagsMap = getUserTags();

    let where = '';
    const params = [];
    if (search) {
      where = 'WHERE (full_name LIKE ? OR rl_full_name LIKE ? OR username LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    // Общее количество
    const [[{ total }]] = await dbPool.query(`SELECT COUNT(*) as total FROM users ${where}`, params);

    const [rows] = await dbPool.query(
      `SELECT user_id, full_name, username, date_reg, banned, rl_full_name, role, graph, phone_number, registered, personal_label, show_qr FROM users ${where} ORDER BY date_reg DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const users = rows.map(r => mapUserRow(r, tagsMap));
    res.json({ users, total, limit, offset });
  } catch (err) {
    console.error('[db] /api/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id — один пользователь
app.get('/api/users/:id', async (req, res) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const [rows] = await dbPool.query(
      'SELECT user_id, full_name, username, date_reg, banned, rl_full_name, role, graph, phone_number, registered, personal_label, show_qr FROM users WHERE user_id = ?',
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    const tagsMap = getUserTags();
    res.json(mapUserRow(rows[0], tagsMap));
  } catch (err) {
    console.error('[db] /api/users/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id/tags — сохранить теги пользователя
app.put('/api/users/:id/tags', (req, res) => {
  try {
    const userId = String(req.params.id);
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });
    const tagsMap = getUserTags();
    tagsMap[userId] = tags;
    saveUserTags(tagsMap);
    res.json({ success: true, tags: tagsMap[userId] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Knowledge Base ---
app.get('/api/knowledge', (req, res) => {
  try { res.json(getAllNested()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/knowledge/:id', (req, res) => {
  try {
    const article = getById(Number(req.params.id));
    if (!article) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/knowledge', (req, res) => {
  try {
    const { title, content, parent_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const article = create({ title, content, parent_id: parent_id || null });
    res.status(201).json(article);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/knowledge/:id', (req, res) => {
  try {
    const existing = getById(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const article = update(Number(req.params.id), req.body);
    res.json(article);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/knowledge/:id', (req, res) => {
  try {
    const existing = getById(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Not found' });
    remove(Number(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Chats ---
const CHATS_FILE = path.join(__dirname, 'data', 'chats.json');
const readChats = () => JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
const writeChats = (d) => fs.writeFileSync(CHATS_FILE, JSON.stringify(d, null, 2), 'utf-8');

app.get('/api/chats', (req, res) => {
  try { res.json(readChats()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/chats/:id', (req, res) => {
  try {
    const chats = readChats();
    const idx = chats.findIndex(c => c.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    chats.splice(idx, 1);
    writeChats(chats);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// =====================================================
// === Рассылки (Telegram Bot API напрямую) ===
// =====================================================

// Хелпер: отправить сообщение через Telegram Bot API
async function tgSend(chatId, text, parseMode = 'HTML') {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
  return r.json();
}

// --- Каналы ---

// GET /api/broadcasts/channels
app.get('/api/broadcasts/channels', (req, res) => {
  try { res.json(readJSON(CHANNELS_FILE)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/broadcasts/channels — добавить канал { chatId, title }
app.post('/api/broadcasts/channels', (req, res) => {
  try {
    const { chatId, title } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    const channels = readJSON(CHANNELS_FILE);
    if (channels.some(c => String(c.chatId) === String(chatId))) {
      return res.status(409).json({ error: 'Канал уже добавлен' });
    }
    const ch = {
      id: (channels.at(-1)?.id || 0) + 1,
      chatId: String(chatId),
      title: title || chatId,
      addedAt: new Date().toISOString(),
    };
    channels.push(ch);
    writeJSON(CHANNELS_FILE, channels);
    res.status(201).json(ch);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/broadcasts/channels/:id
app.delete('/api/broadcasts/channels/:id', (req, res) => {
  try {
    const channels = readJSON(CHANNELS_FILE);
    const idx = channels.findIndex(c => c.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    channels.splice(idx, 1);
    writeJSON(CHANNELS_FILE, channels);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Рассылки ---

// GET /api/broadcasts
app.get('/api/broadcasts', (req, res) => {
  try { res.json(readJSON(BROADCASTS_FILE)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/broadcasts — отправить рассылку по каналам
app.post('/api/broadcasts', async (req, res) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен — добавьте в .env' });

  const { text, channelIds } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
  if (!channelIds?.length) return res.status(400).json({ error: 'Выберите хотя бы один канал' });

  const results = [];
  for (const chatId of channelIds) {
    try {
      const data = await tgSend(chatId, text.trim());
      results.push({ chatId, ok: data.ok, error: data.description || null });
    } catch (err) {
      results.push({ chatId, ok: false, error: err.message });
    }
  }

  const success = results.filter(r => r.ok).length;
  const channels = readJSON(CHANNELS_FILE);
  const channelNames = channelIds.map(id => {
    const ch = channels.find(c => String(c.chatId) === String(id));
    return ch?.title || id;
  });

  // Сохраняем в историю
  const broadcasts = readJSON(BROADCASTS_FILE);
  const record = {
    id: (broadcasts.at(-1)?.id || 0) + 1,
    text: text.trim().substring(0, 200),
    channels: channelNames,
    channelIds,
    total: channelIds.length,
    success,
    failed: channelIds.length - success,
    results,
    date: new Date().toISOString(),
    status: success === channelIds.length ? 'published' : (success > 0 ? 'partial' : 'failed'),
  };
  broadcasts.unshift(record);
  if (broadcasts.length > 200) broadcasts.length = 200;
  writeJSON(BROADCASTS_FILE, broadcasts);

  res.json(record);
});

// DELETE /api/broadcasts/:id
app.delete('/api/broadcasts/:id', (req, res) => {
  try {
    const broadcasts = readJSON(BROADCASTS_FILE);
    const idx = broadcasts.findIndex(b => b.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    broadcasts.splice(idx, 1);
    writeJSON(BROADCASTS_FILE, broadcasts);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// =====================================================
// === Рассылка пользователям бота (в личку) ===
// =====================================================

// POST /api/broadcasts/users — отправить сообщение пользователям бота
app.post('/api/broadcasts/users', async (req, res) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен — добавьте в .env' });
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });

  const { text, filters } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  try {
    // Строим SQL с фильтрами
    let where = ['user_id IS NOT NULL'];
    const params = [];

    if (filters) {
      if (filters.role && filters.role !== 'all') {
        where.push('role = ?');
        params.push(filters.role);
      }
      if (filters.banned === 'active') {
        where.push('(banned = 0 OR banned IS NULL)');
      } else if (filters.banned === 'banned') {
        where.push('banned = 1');
      }
      if (filters.registered === 'yes') {
        where.push('registered = 1');
      } else if (filters.registered === 'no') {
        where.push('(registered = 0 OR registered IS NULL)');
      }
    }

    const [rows] = await dbPool.query(
      `SELECT user_id FROM users WHERE ${where.join(' AND ')}`,
      params
    );

    if (!rows.length) {
      return res.json({ success: 0, total: 0, failed: 0, results: [], status: 'failed', error: 'Нет пользователей по заданным фильтрам' });
    }

    const results = [];
    let successCount = 0;

    for (const row of rows) {
      try {
        const data = await tgSend(row.user_id, text.trim());
        results.push({ chatId: row.user_id, ok: data.ok, error: data.description || null });
        if (data.ok) successCount++;
      } catch (err) {
        results.push({ chatId: row.user_id, ok: false, error: err.message });
      }
    }

    // Сохраняем в историю
    const broadcasts = readJSON(BROADCASTS_FILE);
    const record = {
      id: (broadcasts[0]?.id || 0) + 1,
      text: text.trim().substring(0, 200),
      channels: [`Пользователи (${rows.length})`],
      channelIds: [],
      type: 'users',
      total: rows.length,
      success: successCount,
      failed: rows.length - successCount,
      results,
      date: new Date().toISOString(),
      status: successCount === rows.length ? 'published' : (successCount > 0 ? 'partial' : 'failed'),
    };
    broadcasts.unshift(record);
    if (broadcasts.length > 200) broadcasts.length = 200;
    writeJSON(BROADCASTS_FILE, broadcasts);

    res.json(record);
  } catch (err) {
    console.error('[broadcast/users] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/broadcasts/users/count — подсчёт пользователей по фильтрам
app.get('/api/broadcasts/users/count', async (req, res) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    let where = ['user_id IS NOT NULL'];
    const params = [];

    if (req.query.role && req.query.role !== 'all') {
      where.push('role = ?');
      params.push(req.query.role);
    }
    if (req.query.banned === 'active') {
      where.push('(banned = 0 OR banned IS NULL)');
    } else if (req.query.banned === 'banned') {
      where.push('banned = 1');
    }
    if (req.query.registered === 'yes') {
      where.push('registered = 1');
    } else if (req.query.registered === 'no') {
      where.push('(registered = 0 OR registered IS NULL)');
    }

    const [[{ count }]] = await dbPool.query(
      `SELECT COUNT(*) as count FROM users WHERE ${where.join(' AND ')}`,
      params
    );
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/broadcasts/users/roles — уникальные роли для фильтра
app.get('/api/broadcasts/users/roles', async (req, res) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const [rows] = await dbPool.query(
      "SELECT DISTINCT role FROM users WHERE role IS NOT NULL AND role != '' ORDER BY role"
    );
    res.json(rows.map(r => r.role));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// === Рассылка в группы/чаты где есть бот ===
// =====================================================

// GET /api/broadcasts/groups
app.get('/api/broadcasts/groups', (req, res) => {
  try { res.json(readJSON(GROUPS_FILE)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/broadcasts/groups — добавить группу
app.post('/api/broadcasts/groups', (req, res) => {
  try {
    const { chatId, title } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    const groups = readJSON(GROUPS_FILE);
    if (groups.some(g => String(g.chatId) === String(chatId))) {
      return res.status(409).json({ error: 'Группа уже добавлена' });
    }
    const g = {
      id: (groups.at(-1)?.id || 0) + 1,
      chatId: String(chatId),
      title: title || chatId,
      addedAt: new Date().toISOString(),
    };
    groups.push(g);
    writeJSON(GROUPS_FILE, groups);
    res.status(201).json(g);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/broadcasts/groups/:id
app.delete('/api/broadcasts/groups/:id', (req, res) => {
  try {
    const groups = readJSON(GROUPS_FILE);
    const idx = groups.findIndex(g => g.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    groups.splice(idx, 1);
    writeJSON(GROUPS_FILE, groups);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/broadcasts/groups/send — отправить в группы
app.post('/api/broadcasts/groups/send', async (req, res) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'BOT_TOKEN не настроен — добавьте в .env' });

  const { text, groupIds } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
  if (!groupIds?.length) return res.status(400).json({ error: 'Выберите хотя бы одну группу' });

  const results = [];
  for (const chatId of groupIds) {
    try {
      const data = await tgSend(chatId, text.trim());
      results.push({ chatId, ok: data.ok, error: data.description || null });
    } catch (err) {
      results.push({ chatId, ok: false, error: err.message });
    }
  }

  const success = results.filter(r => r.ok).length;
  const groups = readJSON(GROUPS_FILE);
  const groupNames = groupIds.map(id => {
    const g = groups.find(gr => String(gr.chatId) === String(id));
    return g?.title || id;
  });

  const broadcasts = readJSON(BROADCASTS_FILE);
  const record = {
    id: (broadcasts[0]?.id || 0) + 1,
    text: text.trim().substring(0, 200),
    channels: groupNames,
    channelIds: groupIds,
    type: 'groups',
    total: groupIds.length,
    success,
    failed: groupIds.length - success,
    results,
    date: new Date().toISOString(),
    status: success === groupIds.length ? 'published' : (success > 0 ? 'partial' : 'failed'),
  };
  broadcasts.unshift(record);
  if (broadcasts.length > 200) broadcasts.length = 200;
  writeJSON(BROADCASTS_FILE, broadcasts);

  res.json(record);
});

// GET /api/bot/status — диагностика
app.get('/api/bot/status', (req, res) => {
  res.json({
    botToken: BOT_TOKEN ? 'set' : 'not set',
    channelsCount: readJSON(CHANNELS_FILE).length,
    broadcastsCount: readJSON(BROADCASTS_FILE).length,
  });
});

// --- Production: serve Vite build ---
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  const indexHtml = path.join(distPath, 'index.html');

  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
      res.sendFile(indexHtml);
    });
    console.log('[prod] Serving dist from:', distPath);
  } else {
    console.warn('[prod] dist/index.html NOT FOUND — run: npm run build');
    console.warn('[prod] Expected path:', indexHtml);
  }
}

const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('[server] Listen error:', err.message);
});
