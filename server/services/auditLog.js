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
