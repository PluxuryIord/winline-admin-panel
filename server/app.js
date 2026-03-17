import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import errorHandler from './middleware/errorHandler.js';
import authMiddleware from './middleware/auth.js';
import { JWT_SECRET } from './config/env.js';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import chatsRouter from './routes/chats.js';
import knowledgeRouter from './routes/knowledge.js';
import broadcastsRouter from './routes/broadcasts.js';
import uploadRouter, { uploadsDir } from './routes/upload.js';
import statusRouter from './routes/status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '5mb' }));

// Статика для загруженных файлов
app.use('/uploads', express.static(uploadsDir));

// === API Роуты ===

// Auth — без авторизации
app.use('/api/auth', authRouter);

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
