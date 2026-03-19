import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import errorHandler from './middleware/errorHandler.js';
import authMiddleware from './middleware/auth.js';
import { JWT_SECRET } from './config/env.js';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import chatsRouter, { webhookRouter } from './routes/chats.js';
import knowledgeRouter from './routes/knowledge.js';
import broadcastsRouter, { broadcastWebhookRouter } from './routes/broadcasts.js';
import uploadRouter, { uploadsDir } from './routes/upload.js';
import statusRouter from './routes/status.js';
import analyticsRouter from './routes/analytics.js';
import eventsRouter, { scanHandler } from './routes/events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '5mb' }));

// Статика для загруженных файлов
app.use('/uploads', express.static(uploadsDir));

// === Health check (всегда доступен, без JWT) ===
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), ts: new Date().toISOString() });
});

// === API Роуты ===

// Публичные маршруты (без JWT)
app.use('/api/auth', authRouter);
app.use('/api/chats/webhook', webhookRouter);
app.use('/api/broadcasts/bot-membership', broadcastWebhookRouter);

// Публичный прокси фото KB (img src не может передать Bearer токен)
import { knowledgePhotoProxy } from './routes/knowledge.js';
app.get('/api/knowledge/photo/:fileId', knowledgePhotoProxy);

// Публичный endpoint сканирования QR (хостес-страница, без JWT)
app.post('/api/events/scan', scanHandler);

// Все остальные API — с JWT авторизацией (если JWT_SECRET задан)
if (JWT_SECRET) {
  app.use('/api', authMiddleware);
} else {
  console.warn('[auth] JWT_SECRET не задан — авторизация отключена. Добавьте JWT_SECRET в .env для включения.');
}

app.use('/api/users', usersRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/broadcasts', broadcastsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/bot/status', statusRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/events', eventsRouter);

// === Production: serve Vite build ===
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
  }
}

// === Глобальный error handler ===
app.use(errorHandler);

export default app;
