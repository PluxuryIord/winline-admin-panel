/**
 * Миграция 004: пересоздаёт wl_admin_broadcasts с колонкой media_json
 *
 * Запуск: node server/migrations/004_add_media_to_broadcasts.js
 */
import dbPool from '../config/db.js';

async function run() {
  console.log('[migration-004] Recreating wl_admin_broadcasts with media_json...');

  await dbPool.query('DROP TABLE IF EXISTS wl_admin_broadcasts');

  await dbPool.query(`
    CREATE TABLE wl_admin_broadcasts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      text VARCHAR(500),
      type VARCHAR(20) DEFAULT 'channels',
      channels_json TEXT,
      channel_ids_json TEXT,
      total INT DEFAULT 0,
      success INT DEFAULT 0,
      failed INT DEFAULT 0,
      results_json TEXT,
      media_json TEXT DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'published',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('[migration-004] Table recreated with media_json column.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
