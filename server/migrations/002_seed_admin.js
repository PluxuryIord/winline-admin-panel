import bcrypt from 'bcrypt';
import crypto from 'crypto';

export default async function seedAdmin(pool) {
  const [rows] = await pool.query('SELECT COUNT(*) as count FROM wl_admin_users');
  if (rows[0].count > 0) {
    console.log('[seed] Admin users already exist, skipping seed.');
    return;
  }

  const username = 'admin';
  // Generate strong random password
  const password = crypto.randomBytes(12).toString('base64url').slice(0, 16);
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    'INSERT INTO wl_admin_users (username, password_hash, display_name) VALUES (?, ?, ?)',
    [username, hash, 'Администратор']
  );

  console.log('[seed] ✓ Created admin user:');
  console.log(`  username: ${username}`);
  console.log(`  password: ${password}`);
  console.log('  ⚠ Запишите пароль — он не будет показан повторно!');
}
