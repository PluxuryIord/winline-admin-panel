import { execSync } from 'child_process';
import app from './app.js';
import { API_PORT, BOT_TOKEN, JWT_SECRET, MYSQL_HOST } from './config/env.js';

// --- Ловим необработанные ошибки чтобы сервер не падал молча ---
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

// --- Убиваем зомби-процесс на порту перед стартом (фикс EADDRINUSE) ---
try {
  const pids = execSync(`lsof -t -i:${API_PORT} 2>/dev/null || true`, { encoding: 'utf8' }).trim();
  if (pids) {
    const pidList = pids.split('\n').filter(p => p && Number(p) !== process.pid);
    if (pidList.length) {
      console.log(`[startup] Killing stale processes on port ${API_PORT}: ${pidList.join(', ')}`);
      pidList.forEach(pid => {
        try { process.kill(Number(pid), 'SIGKILL'); } catch {}
      });
      // Даём ОС освободить порт
      execSync('sleep 0.5');
    }
  }
} catch {}

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
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${API_PORT} is busy. Exiting with code 1 so systemd can retry.`);
    process.exit(1);
  }
});
