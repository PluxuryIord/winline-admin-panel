import dbPool from '../config/db.js';
import { logAudit } from './auditLog.js';

/**
 * Create a daily snapshot for the given entity type.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE so only one snapshot per type per day.
 */
export async function createDailySnapshot(entityType, userId, userName) {
  try {
    let snapshotData;

    if (entityType === 'scenarios') {
      const [rows] = await dbPool.query("SELECT data FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
      snapshotData = rows.length ? (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data) : null;
    } else if (entityType === 'knowledge') {
      const [rows] = await dbPool.query("SELECT data FROM texts WHERE category = 'knowledge_base' LIMIT 1");
      snapshotData = rows.length ? (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data) : null;
    } else if (entityType === 'tags') {
      const [userTags] = await dbPool.query('SELECT user_id, tag FROM wl_admin_user_tags');
      const [channelTags] = await dbPool.query('SELECT chat_id, tag FROM wl_admin_channel_tags');
      const [groupTags] = await dbPool.query('SELECT chat_id, tag FROM wl_admin_group_tags');
      snapshotData = { userTags, channelTags, groupTags };
    } else {
      return;
    }

    if (!snapshotData) return;

    const today = new Date().toISOString().split('T')[0];
    const dataJson = JSON.stringify(snapshotData);

    await dbPool.query(
      `INSERT INTO wl_admin_snapshots (entity_type, snapshot_date, data, created_by_id, created_by_name)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), created_by_id = VALUES(created_by_id), created_by_name = VALUES(created_by_name)`,
      [entityType, today, dataJson, userId, userName]
    );
  } catch (err) {
    console.error('[snapshots] Failed to create snapshot:', err.message);
  }
}

/**
 * List snapshots for a given entity type.
 */
export async function listSnapshots(entityType) {
  const [rows] = await dbPool.query(
    'SELECT id, entity_type, snapshot_date, created_by_name, created_at FROM wl_admin_snapshots WHERE entity_type = ? ORDER BY snapshot_date DESC',
    [entityType]
  );
  return rows;
}

/**
 * Get a single snapshot by id.
 */
export async function getSnapshot(id) {
  const [rows] = await dbPool.query('SELECT * FROM wl_admin_snapshots WHERE id = ?', [id]);
  if (!rows.length) return null;
  const row = rows[0];
  row.data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return row;
}

/**
 * Rollback: restore data from a snapshot to the original tables.
 */
export async function rollbackSnapshot(id, userId, userName) {
  const snapshot = await getSnapshot(id);
  if (!snapshot) throw new Error('Snapshot not found');

  const { entity_type, data } = snapshot;

  if (entity_type === 'scenarios') {
    const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
    if (!rows.length) throw new Error('Scenarios row not found in DB');
    const oldData = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), rows[0].id]);
    logAudit(userId, userName, 'rollback', 'scenarios', id, `snapshot #${id}`, oldData, data);
  } else if (entity_type === 'knowledge') {
    const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'knowledge_base' LIMIT 1");
    if (!rows.length) throw new Error('Knowledge base row not found in DB');
    const oldData = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), rows[0].id]);
    logAudit(userId, userName, 'rollback', 'knowledge', id, `snapshot #${id}`, oldData, data);
  } else if (entity_type === 'tags') {
    const { userTags, channelTags, groupTags } = data;

    // Capture old state for audit
    const [oldUserTags] = await dbPool.query('SELECT user_id, tag FROM wl_admin_user_tags');
    const [oldChannelTags] = await dbPool.query('SELECT chat_id, tag FROM wl_admin_channel_tags');
    const [oldGroupTags] = await dbPool.query('SELECT chat_id, tag FROM wl_admin_group_tags');

    // Restore user tags
    await dbPool.query('DELETE FROM wl_admin_user_tags');
    if (userTags && userTags.length > 0) {
      const values = userTags.map(r => [r.user_id, r.tag]);
      await dbPool.query('INSERT INTO wl_admin_user_tags (user_id, tag) VALUES ?', [values]);
    }

    // Restore channel tags
    await dbPool.query('DELETE FROM wl_admin_channel_tags');
    if (channelTags && channelTags.length > 0) {
      const values = channelTags.map(r => [r.chat_id, r.tag]);
      await dbPool.query('INSERT INTO wl_admin_channel_tags (chat_id, tag) VALUES ?', [values]);
    }

    // Restore group tags
    await dbPool.query('DELETE FROM wl_admin_group_tags');
    if (groupTags && groupTags.length > 0) {
      const values = groupTags.map(r => [r.chat_id, r.tag]);
      await dbPool.query('INSERT INTO wl_admin_group_tags (chat_id, tag) VALUES ?', [values]);
    }

    logAudit(userId, userName, 'rollback', 'tags', id, `snapshot #${id}`,
      { userTags: oldUserTags, channelTags: oldChannelTags, groupTags: oldGroupTags }, data);
  } else {
    throw new Error(`Unknown entity type: ${entity_type}`);
  }

  return snapshot;
}
