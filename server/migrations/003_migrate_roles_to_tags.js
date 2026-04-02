#!/usr/bin/env node
/**
 * Одноразовая миграция: копируем users.role → wl_admin_user_tags.
 * Запуск: node server/migrations/003_migrate_roles_to_tags.js
 *
 * После этого бэкенд перестаёт читать users.role — все теги берутся только
 * из wl_admin_user_tags.
 */
import dbPool from '../config/db.js';

async function run() {
  if (!dbPool) {
    console.error('[migrate-roles] MySQL не настроен');
    process.exit(1);
  }

  try {
    // Берём всех пользователей с непустой ролью
    const [rows] = await dbPool.query(
      "SELECT user_id, role FROM users WHERE role IS NOT NULL AND role != ''"
    );

    console.log(`[migrate-roles] Найдено ${rows.length} пользователей с ролями`);

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        await dbPool.query(
          'INSERT IGNORE INTO wl_admin_user_tags (user_id, tag) VALUES (?, ?)',
          [row.user_id, row.role]
        );
        inserted++;
      } catch (e) {
        // дубликат — пропускаем
        skipped++;
      }
    }

    console.log(`[migrate-roles] ✓ Вставлено: ${inserted}, пропущено (дубли): ${skipped}`);
    console.log('[migrate-roles] ✓ Миграция ролей завершена!');
  } catch (err) {
    console.error('[migrate-roles] Ошибка:', err.message);
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

run();
