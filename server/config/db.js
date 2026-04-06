import mysql from 'mysql2/promise';
import { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } from './env.js';

let dbPool = null;

if (MYSQL_HOST && MYSQL_USER && MYSQL_DATABASE) {
  dbPool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 25,
    queueLimit: 0,
    connectTimeout: 10000,
    timezone: '+03:00',
  });
  console.log('[db] MySQL pool created for', MYSQL_DATABASE, '@', MYSQL_HOST);
} else {
  console.warn('[db] MySQL не настроен — добавьте MYSQL_HOST/USER/DATABASE в .env');
}

// Attempt to create useful indexes (may fail if ALTER not granted — that's OK)
if (dbPool) {
  (async () => {
    const indexes = [
      'CREATE INDEX idx_audit_log_entity ON wl_admin_audit_log (entity_type)',
      'CREATE INDEX idx_audit_log_user ON wl_admin_audit_log (user_id)',
      'CREATE INDEX idx_audit_log_created ON wl_admin_audit_log (created_at)',
      'CREATE INDEX idx_chats_user ON wl_admin_chats (user_id)',
      'CREATE INDEX idx_chat_messages_chat ON wl_admin_chat_messages (chat_id)',
    ];
    for (const sql of indexes) {
      try { await dbPool.query(sql); } catch {}
    }
  })();
}

export default dbPool;
