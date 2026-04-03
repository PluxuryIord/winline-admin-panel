import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import errorHandler from './middleware/errorHandler.js';
import authMiddleware from './middleware/auth.js';
import { JWT_SECRET } from './config/env.js';

import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import chatsRouter, { webhookRouter, streamRouter } from './routes/chats.js';
import knowledgeRouter from './routes/knowledge.js';
import broadcastsRouter, { broadcastWebhookRouter, pollVoteRouter } from './routes/broadcasts.js';
import uploadRouter, { uploadsDir } from './routes/upload.js';
import statusRouter from './routes/status.js';
import analyticsRouter from './routes/analytics.js';
import eventsRouter, { scanHandler } from './routes/events.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not set. Refusing to start without authentication.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // Trust reverse proxy (nginx/caddy) for secure cookies

// === Rate limiting ===
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5,
  message: { error: 'Слишком много попыток входа, попробуйте через 15 минут' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 100,
  message: { error: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
});

const broadcastLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Слишком много рассылок, попробуйте через минуту' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/broadcasts/groups/send', broadcastLimiter);
app.use('/api/broadcasts/users', broadcastLimiter);
app.use('/api/broadcasts/drafts/:id/send', broadcastLimiter);
app.post('/api/broadcasts', broadcastLimiter);
app.use('/api', apiLimiter);

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

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
app.use('/api/chats/stream', streamRouter);
app.use('/api/broadcasts/bot-membership', broadcastWebhookRouter);
app.use('/api/broadcasts/poll-vote', pollVoteRouter);

// Публичный прокси фото KB (img src не может передать Bearer токен)
import { knowledgePhotoProxy } from './routes/knowledge.js';
app.get('/api/knowledge/photo/:fileId', knowledgePhotoProxy);

// Публичные endpoints для хостес-страницы (без JWT)
app.post('/api/events/scan', scanHandler);
import { statsHandler, qrHandler, qrCardHandler } from './routes/events.js';
app.get('/api/events/public-stats', statsHandler);
// QR-код как картинка (img src не может передать Bearer токен)
app.get('/api/events/codes/:code/qr', qrHandler);
// QR-карточка с фоном и текстом (публичный, бот скачивает без токена)
app.get('/api/events/codes/:code/qr-card', qrCardHandler);

app.use('/api', authMiddleware);

app.use('/api/users', usersRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/broadcasts', broadcastsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/bot/status', statusRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/events', eventsRouter);
import scenariosRouter from './routes/scenarios.js';
app.use('/api/scenarios', scenariosRouter);
import emojisRouter from './routes/emojis.js';
app.use('/api/emojis', emojisRouter);
import adminUsersRouter from './routes/adminUsers.js';
app.use('/api/admin-users', adminUsersRouter);
import auditLogRouter from './routes/auditLog.js';
import snapshotsRouter from './routes/snapshots.js';
app.use('/api/audit-log', auditLogRouter);
app.use('/api/snapshots', snapshotsRouter);

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
