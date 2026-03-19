const TABLES = [
  `CREATE TABLE IF NOT EXISTS wl_admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(200) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_user_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    tag VARCHAR(255) NOT NULL,
    INDEX idx_user_id (user_id),
    UNIQUE KEY uq_user_tag (user_id, tag)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id INT NOT NULL,
    sender ENUM('user','admin') NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_chat_id (chat_id),
    FOREIGN KEY (chat_id) REFERENCES wl_admin_chats(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_knowledge (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT DEFAULT NULL,
    title VARCHAR(500) NOT NULL,
    content LONGTEXT,
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_parent_id (parent_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_broadcasts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    text VARCHAR(500) NOT NULL,
    type ENUM('channels','users','groups') DEFAULT 'channels',
    channels_json JSON DEFAULT NULL,
    channel_ids_json JSON DEFAULT NULL,
    total INT DEFAULT 0,
    success INT DEFAULT 0,
    failed INT DEFAULT 0,
    results_json JSON DEFAULT NULL,
    status ENUM('published','partial','failed') DEFAULT 'failed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at DESC)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_ext VARCHAR(10) NOT NULL,
    size_bytes INT DEFAULT 0,
    uploaded_by INT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wl_admin_event_scans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    prize_given BOOLEAN DEFAULT TRUE,
    INDEX idx_user_id (user_id),
    INDEX idx_scanned_at (scanned_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

export default async function migrate(pool) {
  console.log('[migration] Creating tables...');
  for (const sql of TABLES) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\S+)/)?.[1];
    await pool.query(sql);
    console.log(`  ✓ ${tableName}`);
  }
  console.log('[migration] All tables created.');
}
