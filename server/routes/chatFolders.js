import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_admin_chat_folders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        position INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_admin_chat_folder_map (
        chat_id INT NOT NULL PRIMARY KEY,
        folder_id INT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    schemaReady = true;
  } catch (err) {
    console.error('[chat-folders] schema init failed:', err.message);
  }
}

router.use(async (_req, _res, next) => { await ensureSchema(); next(); });

// GET /api/chat-folders — list folders
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT id, name, position FROM wl_admin_chat_folders ORDER BY position ASC, id ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/chat-folders — create
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const [[{ maxPos }]] = await dbPool.query('SELECT COALESCE(MAX(position), 0) AS maxPos FROM wl_admin_chat_folders');
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_chat_folders (name, position) VALUES (?, ?)',
      [name.trim(), (maxPos || 0) + 1]
    );
    res.status(201).json({ id: result.insertId, name: name.trim(), position: (maxPos || 0) + 1 });
  } catch (err) { next(err); }
});

// PUT /api/chat-folders/assign — body: { chatId, folderId|null }
// MUST be declared before '/:id' so it doesn't match the rename route
router.put('/assign', async (req, res, next) => {
  try {
    const { chatId, folderId } = req.body || {};
    const cid = Number(chatId);
    if (!cid) return res.status(400).json({ error: 'chatId required' });
    if (folderId === null || folderId === undefined) {
      await dbPool.query('DELETE FROM wl_admin_chat_folder_map WHERE chat_id = ?', [cid]);
    } else {
      await dbPool.query(
        `INSERT INTO wl_admin_chat_folder_map (chat_id, folder_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE folder_id = VALUES(folder_id), updated_at = NOW()`,
        [cid, Number(folderId)]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/chat-folders/:id — rename
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    await dbPool.query('UPDATE wl_admin_chat_folders SET name = ? WHERE id = ?', [name.trim(), id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/chat-folders/:id — delete folder (orphaned chats fall back to "no folder")
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await dbPool.query('DELETE FROM wl_admin_chat_folder_map WHERE folder_id = ?', [id]);
    await dbPool.query('DELETE FROM wl_admin_chat_folders WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
