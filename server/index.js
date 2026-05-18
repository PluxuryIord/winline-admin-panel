import { execSync } from 'child_process';
import app from './app.js';
import { API_PORT, BOT_TOKEN, JWT_SECRET, MYSQL_HOST, WEBHOOK_SECRET } from './config/env.js';
import { startAuditLogRetention } from './services/auditLog.js';
import { cleanupDuplicateChats } from './routes/chats.js';

// --- Ловим необработанные ошибки чтобы сервер не падал молча ---
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

// Port cleanup removed — systemd manages process lifecycle

console.log('[env] NODE_ENV:', process.env.NODE_ENV);
console.log('[env] node:', process.version);
console.log('[bot] BOT_TOKEN:', BOT_TOKEN ? 'set' : 'NOT SET');
console.log('[auth] JWT_SECRET:', JWT_SECRET ? 'set' : 'NOT SET (auth disabled)');
console.log('[db] MySQL:', MYSQL_HOST || 'NOT SET');
if (!WEBHOOK_SECRET) console.warn('[WARN] WEBHOOK_SECRET not set — bot webhooks will be rejected');

const server = app.listen(API_PORT, () => {
  console.log(`API server running on http://localhost:${API_PORT}`);
  startAuditLogRetention();
  cleanupDuplicateChats();
  // Persistent-queue worker для рассылок пользователям. Идёт фоном внутри
  // того же Node-процесса, опрашивает БД, шлёт батчами через TG с rate-limit.
  (async () => {
    try {
      const { startBroadcastWorker } = await import('./services/broadcastWorker.js');
      const { workerSendOne } = await import('./routes/broadcasts.js');
      await startBroadcastWorker(workerSendOne);
    } catch (e) {
      console.error('[broadcast-worker] failed to start:', e.message);
    }
  })();
});

server.on('error', (err) => {
  console.error('[server] Listen error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${API_PORT} is busy. Exiting with code 1 so systemd can retry.`);
    process.exit(1);
  }
});
