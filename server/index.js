import app from './app.js';
import { API_PORT, BOT_TOKEN, JWT_SECRET, MYSQL_HOST } from './config/env.js';

// --- Ловим необработанные ошибки чтобы сервер не падал молча ---
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

console.log('[env] NODE_ENV:', process.env.NODE_ENV);
console.log('[env] node:', process.version);
console.log('[bot] BOT_TOKEN:', BOT_TOKEN ? 'set' : 'NOT SET');
console.log('[auth] JWT_SECRET:', JWT_SECRET ? 'set' : 'NOT SET (auth disabled)');
console.log('[db] MySQL:', MYSQL_HOST || 'NOT SET');

const server = app.listen(API_PORT, () => {
  console.log(`API server running on http://localhost:${API_PORT}`);
});

server.on('error', (err) => {
  console.error('[server] Listen error:', err.message);
});
