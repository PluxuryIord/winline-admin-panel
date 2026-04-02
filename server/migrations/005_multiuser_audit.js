export default async function multiuserAudit(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wl_admin_user_profiles (
      user_id INT PRIMARY KEY,
      role VARCHAR(20) NOT NULL DEFAULT 'editor',
      display_name VARCHAR(200) DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('[migrate] ✓ wl_admin_user_profiles');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wl_admin_audit_log (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      user_name VARCHAR(200) NOT NULL,
      action VARCHAR(50) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(255) DEFAULT NULL,
      entity_label VARCHAR(500) DEFAULT NULL,
      old_value JSON DEFAULT NULL,
      new_value JSON DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_entity (entity_type, created_at),
      INDEX idx_user (user_id, created_at)
    )
  `);
  console.log('[migrate] ✓ wl_admin_audit_log');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wl_admin_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      data LONGTEXT NOT NULL,
      created_by INT DEFAULT NULL,
      created_by_name VARCHAR(200) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_date_type (snapshot_date, entity_type)
    )
  `);
  console.log('[migrate] ✓ wl_admin_snapshots');

  // Ensure the seed admin user has a profile with role='admin'
  const [admins] = await pool.query(
    'SELECT id FROM wl_admin_users ORDER BY id ASC LIMIT 1'
  );
  if (admins.length) {
    const adminId = admins[0].id;
    await pool.query(
      `INSERT IGNORE INTO wl_admin_user_profiles (user_id, role) VALUES (?, 'admin')`,
      [adminId]
    );
    console.log(`[migrate] ✓ Ensured admin profile for user_id=${adminId}`);
  }
}
