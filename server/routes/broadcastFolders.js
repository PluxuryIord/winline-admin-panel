import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_admin_broadcast_folders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_type ENUM('channels','groups') NOT NULL DEFAULT 'channels',
        name VARCHAR(100) NOT NULL,
        position INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Map: broadcast channel/group chatId → folder
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_admin_broadcast_folder_map (
        chat_id VARCHAR(100) NOT NULL,
        entity_type ENUM('channels','groups') NOT NULL DEFAULT 'channels',
        folder_id INT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (chat_id, entity_type)
      )
    `);
    schemaReady = true;
  } catch (err) {
    console.error('[broadcast-folders] schema init failed:', err.message);
  }
}

router.use(async (_req, _res, next) => { await ensureSchema(); next(); });

// GET /api/broadcast-folders?type=channels|groups
router.get('/', async (req, res, next) => {
  try {
    const type = req.query.type === 'groups' ? 'groups' : 'channels';
    const [rows] = await dbPool.query(
      'SELECT id, name, position FROM wl_admin_broadcast_folders WHERE entity_type = ? ORDER BY position ASC, id ASC',
      [type]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/broadcast-folders
router.post('/', async (req, res, next) => {
  try {
    const { name, type } = req.body || {};
    const entityType = type === 'groups' ? 'groups' : 'channels';
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const [[{ maxPos }]] = await dbPool.query(
      'SELECT COALESCE(MAX(position), 0) AS maxPos FROM wl_admin_broadcast_folders WHERE entity_type = ?',
      [entityType]
    );
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_broadcast_folders (name, entity_type, position) VALUES (?, ?, ?)',
      [name.trim(), entityType, (maxPos || 0) + 1]
    );
    res.status(201).json({ id: result.insertId, name: name.trim(), position: (maxPos || 0) + 1 });
  } catch (err) { next(err); }
});

// PUT /api/broadcast-folders/assign — { chatId, entityType, folderId|null }
router.put('/assign', async (req, res, next) => {
  try {
    const { chatId, entityType, folderId } = req.body || {};
    const et = entityType === 'groups' ? 'groups' : 'channels';
    if (!chatId) return res.status(400).json({ error: 'chatId required' });
    if (folderId === null || folderId === undefined) {
      await dbPool.query(
        'DELETE FROM wl_admin_broadcast_folder_map WHERE chat_id = ? AND entity_type = ?',
        [String(chatId), et]
      );
    } else {
      await dbPool.query(
        `INSERT INTO wl_admin_broadcast_folder_map (chat_id, entity_type, folder_id) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE folder_id = VALUES(folder_id), updated_at = NOW()`,
        [String(chatId), et, Number(folderId)]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/broadcast-folders/:id — rename
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    await dbPool.query('UPDATE wl_admin_broadcast_folders SET name = ? WHERE id = ?', [name.trim(), id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/broadcast-folders/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await dbPool.query('DELETE FROM wl_admin_broadcast_folder_map WHERE folder_id = ?', [id]);
    await dbPool.query('DELETE FROM wl_admin_broadcast_folders WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/broadcast-folders/map?type=channels|groups — get chatId→folderId map
router.get('/map', async (req, res, next) => {
  try {
    const type = req.query.type === 'groups' ? 'groups' : 'channels';
    const [rows] = await dbPool.query(
      'SELECT chat_id, folder_id FROM wl_admin_broadcast_folder_map WHERE entity_type = ?',
      [type]
    );
    const map = {};
    for (const r of rows) map[r.chat_id] = r.folder_id;
    res.json(map);
  } catch (err) { next(err); }
});

export default router;
