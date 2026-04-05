import dbPool from '../config/db.js';
import { logAudit } from './auditLog.js';

// DB user has no ALTER privilege, so we can't drop the legacy
// UNIQUE (snapshot_date, entity_type) index. Instead we encode a per-snapshot
// suffix into entity_type ('all_<timestamp>') so every row is unique, and we
// match all of them via LIKE 'all%' on read.
const UNIFIED_PREFIX = 'all';
function newUnifiedType() {
  return `${UNIFIED_PREFIX}_${Date.now()}`;
}

async function collectAll() {
  const [scRows] = await dbPool.query("SELECT data FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
  const scenarios = scRows.length ? (typeof scRows[0].data === 'string' ? JSON.parse(scRows[0].data) : scRows[0].data) : null;

  const [kbRows] = await dbPool.query("SELECT data FROM texts WHERE category = 'knowledge_base' LIMIT 1");
  const knowledge = kbRows.length ? (typeof kbRows[0].data === 'string' ? JSON.parse(kbRows[0].data) : kbRows[0].data) : null;

  const [userTags] = await dbPool.query('SELECT user_id, tag FROM wl_admin_user_tags');
  const [channelTags] = await dbPool.query('SELECT chat_id, tag FROM wl_admin_channel_tags');
  const [groupTags] = await dbPool.query('SELECT chat_id, tag FROM wl_admin_group_tags');

  return { scenarios, knowledge, tags: { userTags, channelTags, groupTags } };
}

/**
 * Create a unified snapshot capturing scenarios + knowledge + tags in one row.
 * Debounces: if the most recent snapshot is < 30 seconds old, skip (so auto-saves don't spam).
 */
export async function createDailySnapshot(_entityType, userId, userName, opts = {}) {
  const silent = !opts.force;
  try {
    if (!opts.force) {
      const [recent] = await dbPool.query(
        `SELECT id, created_at FROM wl_admin_snapshots
         WHERE entity_type LIKE 'all%' ORDER BY created_at DESC LIMIT 1`
      );
      if (recent.length) {
        const ageMs = Date.now() - new Date(recent[0].created_at).getTime();
        if (ageMs < 30 * 1000) return; // debounce auto-saves
      }
    }

    const data = await collectAll();
    const today = new Date().toISOString().split('T')[0];

    await dbPool.query(
      `INSERT INTO wl_admin_snapshots (entity_type, snapshot_date, data, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?)`,
      [newUnifiedType(), today, JSON.stringify(data), userId || null, userName || null]
    );
  } catch (err) {
    console.error('[snapshots] Failed to create snapshot:', err.message);
    if (!silent) throw err;
  }
}

/**
 * List all unified snapshots (newest first).
 */
export async function listSnapshots(_entityType) {
  const [rows] = await dbPool.query(
    `SELECT s.id, s.entity_type, s.snapshot_date, s.created_by_name, s.created_at,
            u.username, COALESCE(p.display_name, u.display_name) AS user_display_name
     FROM wl_admin_snapshots s
     LEFT JOIN wl_admin_users u ON u.id = s.created_by
     LEFT JOIN wl_admin_user_profiles p ON p.user_id = s.created_by
     WHERE s.entity_type LIKE 'all%'
     ORDER BY s.created_at DESC`
  );
  return rows.map(r => ({
    ...r,
    user_display_name: r.user_display_name || r.created_by_name || null,
  }));
}

export async function getSnapshot(id) {
  const [rows] = await dbPool.query('SELECT * FROM wl_admin_snapshots WHERE id = ?', [id]);
  if (!rows.length) return null;
  const row = rows[0];
  row.data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return row;
}

/**
 * Rollback: restore scenarios + knowledge + tags from a unified snapshot.
 */
export async function rollbackSnapshot(id, userId, userName) {
  const snapshot = await getSnapshot(id);
  if (!snapshot) throw new Error('Snapshot not found');

  const data = snapshot.data || {};
  const oldState = await collectAll();

  // Scenarios
  if (data.scenarios) {
    const [rows] = await dbPool.query("SELECT id FROM texts WHERE category = 'bot_scenarios' LIMIT 1");
    if (rows.length) {
      await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data.scenarios), rows[0].id]);
    } else {
      await dbPool.query("INSERT INTO texts (category, data) VALUES ('bot_scenarios', ?)", [JSON.stringify(data.scenarios)]);
    }
  }

  // Knowledge
  if (data.knowledge) {
    const [rows] = await dbPool.query("SELECT id FROM texts WHERE category = 'knowledge_base' LIMIT 1");
    if (rows.length) {
      await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data.knowledge), rows[0].id]);
    } else {
      await dbPool.query("INSERT INTO texts (category, data) VALUES ('knowledge_base', ?)", [JSON.stringify(data.knowledge)]);
    }
  }

  // Tags
  if (data.tags) {
    const { userTags = [], channelTags = [], groupTags = [] } = data.tags;

    await dbPool.query('DELETE FROM wl_admin_user_tags');
    if (userTags.length) {
      await dbPool.query('INSERT INTO wl_admin_user_tags (user_id, tag) VALUES ?', [userTags.map(r => [r.user_id, r.tag])]);
    }
    await dbPool.query('DELETE FROM wl_admin_channel_tags');
    if (channelTags.length) {
      await dbPool.query('INSERT INTO wl_admin_channel_tags (chat_id, tag) VALUES ?', [channelTags.map(r => [r.chat_id, r.tag])]);
    }
    await dbPool.query('DELETE FROM wl_admin_group_tags');
    if (groupTags.length) {
      await dbPool.query('INSERT INTO wl_admin_group_tags (chat_id, tag) VALUES ?', [groupTags.map(r => [r.chat_id, r.tag])]);
    }
  }

  logAudit(userId, userName, 'rollback', 'snapshot', id, `snapshot #${id}`, oldState, data);
  return snapshot;
}
