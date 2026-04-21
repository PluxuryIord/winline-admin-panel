/**
 * 006_admin_2fa.js — 2FA по email (OTP-код) + доверенные устройства на 30 дней.
 *
 * Добавляет:
 *   - wl_admin_users.email (VARCHAR 255, nullable)
 *   - wl_admin_otp (один активный код на пользователя)
 *   - wl_admin_trusted_devices (hash токена, UA, IP, срок)
 *
 * Все действия идемпотентны (CREATE TABLE IF NOT EXISTS, ALTER TABLE добавляет колонку
 * только если её ещё нет).
 */
export default async function admin2fa(pool) {
  // --- 1) Email хранится в отдельной таблице (ALTER на prod запрещён) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wl_admin_user_emails (
      user_id INT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[migrate] ✓ wl_admin_user_emails');

  // --- 2) Одноразовые коды ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wl_admin_otp (
      user_id INT PRIMARY KEY,
      code_hash VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_to VARCHAR(255) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[migrate] ✓ wl_admin_otp');

  // --- 3) Доверенные устройства (30 дней) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wl_admin_trusted_devices (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(255) NOT NULL UNIQUE,
      user_agent VARCHAR(500) DEFAULT NULL,
      ip VARCHAR(64) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      INDEX idx_user (user_id),
      INDEX idx_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[migrate] ✓ wl_admin_trusted_devices');
}
