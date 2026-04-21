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
  const [users] = await dbPool.query(
    'SELECT id FROM wl_admin_users WHERE username = ?',
    [username]
  );
  if (!users.length) {
    console.error(`Пользователь "${username}" не найден.`);
    process.exit(1);
  }
  await dbPool.query(
    `INSERT INTO wl_admin_user_emails (user_id, email) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email)`,
    [users[0].id, email]
  );
  console.log(`✓ ${username} → ${email}`);
  await dbPool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
