/**
 * Миграция 004: добавляет колонку media_json в wl_admin_broadcasts
 *
 * Запуск: node server/migrations/004_add_media_to_broadcasts.js
 */
import dbPool from '../config/db.js';

async function run() {
  console.log('[migration-004] Adding media_json column to wl_admin_broadcasts...');
  const [cols] = await dbPool.query("SHOW COLUMNS FROM wl_admin_broadcasts LIKE 'media_json'");
  if (cols.length === 0) {
    await dbPool.query('ALTER TABLE wl_admin_broadcasts ADD COLUMN media_json TEXT DEFAULT NULL AFTER results_json');
    console.log('[migration-004] Column added.');
  } else {
    console.log('[migration-004] Column already exists, skipping.');
  }
  console.log('[migration-004] Done.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
