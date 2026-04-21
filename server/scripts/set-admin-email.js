#!/usr/bin/env node
/**
 * Выставить email админу по username.
 * Usage: node server/scripts/set-admin-email.js <username> <email>
 */
import dbPool from '../config/db.js';

async function run() {
  const [, , username, email] = process.argv;
  if (!username || !email) {
    console.error('Usage: node server/scripts/set-admin-email.js <username> <email>');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Некорректный email');
    process.exit(1);
  }
  const [result] = await dbPool.query(
    'UPDATE wl_admin_users SET email = ? WHERE username = ?',
    [email, username]
  );
  if (result.affectedRows === 0) {
    console.error(`Пользователь "${username}" не найден.`);
    process.exit(1);
  }
  console.log(`✓ ${username} → ${email}`);
  await dbPool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
