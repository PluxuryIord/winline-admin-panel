#!/usr/bin/env node
import dbPool from '../config/db.js';
import createTables from './001_create_tables.js';
import seedAdmin from './002_seed_admin.js';
import multiuserAudit from './005_multiuser_audit.js';

async function run() {
  if (!dbPool) {
    console.error('[migrate] MySQL не настроен. Проверьте .env');
    process.exit(1);
  }

  try {
    await createTables(dbPool);
    await seedAdmin(dbPool);
    await multiuserAudit(dbPool);
    console.log('\n[migrate] ✓ Все миграции выполнены.');
  } catch (err) {
    console.error('[migrate] Ошибка:', err.message);
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

run();
