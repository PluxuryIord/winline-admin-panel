import dbPool from '../config/db.js';

export async function logAudit(userId, userName, action, entityType, entityId, entityLabel, oldValue, newValue) {
  try {
    await dbPool.query(
      'INSERT INTO wl_admin_audit_log (user_id, user_name, action, entity_type, entity_id, entity_label, old_value, new_value) VALUES (?,?,?,?,?,?,?,?)',
      [userId, userName, action, entityType, entityId || null, entityLabel || null, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null]
    );
  } catch (err) {
    console.error('[audit] Failed to log:', err.message);
  }
}

// Retention: keep last 180 days
const RETENTION_DAYS = 180;
export async function cleanupAuditLog() {
  try {
    const [r] = await dbPool.query(
      'DELETE FROM wl_admin_audit_log WHERE created_at < (NOW() - INTERVAL ? DAY)',
      [RETENTION_DAYS]
    );
    if (r.affectedRows) console.log(`[audit] cleanup removed ${r.affectedRows} old entries`);
  } catch (err) {
    console.error('[audit] cleanup failed:', err.message);
  }
}

export function startAuditLogRetention() {
  cleanupAuditLog();
  setInterval(cleanupAuditLog, 24 * 60 * 60 * 1000);
}
