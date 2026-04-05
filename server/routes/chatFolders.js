import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

// Ensure table exists (no ALTER, CREATE IF NOT EXISTS is allowed)
let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS wl_admin_chat_folders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        filters TEXT,
        position INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    schemaReady = true;
  } catch (err) {
    console.error('[chat-folders] schema init failed:', err.message);
  }
}

function parseFilters(raw) {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

function mapRow(r) {
  return {
    id: r.id,
    name: r.name,
    filters: parseFilters(r.filters),
    position: r.position || 0,
  };
}

router.use(async (_req, _res, next) => { await ensureSchema(); next(); });

// GET /api/chat-folders
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT id, name, filters, position FROM wl_admin_chat_folders ORDER BY position ASC, id ASC');
    res.json(rows.map(mapRow));
  } catch (err) { next(err); }
});

// POST /api/chat-folders
router.post('/', async (req, res, next) => {
  try {
    const { name, filters } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
    const [[{ maxPos }]] = await dbPool.query('SELECT COALESCE(MAX(position), 0) AS maxPos FROM wl_admin_chat_folders');
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_chat_folders (name, filters, position) VALUES (?, ?, ?)',
      [name.trim(), JSON.stringify(filters || {}), (maxPos || 0) + 1]
    );
    res.status(201).json({ id: result.insertId, name: name.trim(), filters: filters || {}, position: (maxPos || 0) + 1 });
  } catch (err) { next(err); }
});

// PUT /api/chat-folders/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, filters } = req.body || {};
    const sets = [];
    const vals = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(String(name).trim()); }
    if (filters !== undefined) { sets.push('filters = ?'); vals.push(JSON.stringify(filters || {})); }
    if (!sets.length) return res.json({ ok: true });
    vals.push(id);
    await dbPool.query(`UPDATE wl_admin_chat_folders SET ${sets.join(', ')} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/chat-folders/reorder — body: { ids: [...] }
router.put('/reorder/all', async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be array' });
    for (let i = 0; i < ids.length; i++) {
      await dbPool.query('UPDATE wl_admin_chat_folders SET position = ? WHERE id = ?', [i + 1, Number(ids[i])]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/chat-folders/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await dbPool.query('DELETE FROM wl_admin_chat_folders WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
