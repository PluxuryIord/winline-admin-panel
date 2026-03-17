import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

// Преобразование плоских строк в nested формат (topics → subtopics)
function buildNested(rows) {
  const topLevel = [];
  const subtopicsMap = {};

  for (const r of rows) {
    if (r.parent_id) {
      if (!subtopicsMap[r.parent_id]) subtopicsMap[r.parent_id] = [];
      subtopicsMap[r.parent_id].push({
        id: r.id,
        parent_id: r.parent_id,
        title: r.title,
        content: r.content || '',
        created_at: r.created_at,
        updated_at: r.updated_at,
      });
    } else {
      topLevel.push({
        id: r.id,
        title: r.title,
        content: r.content || '',
        subtopics: [],
        created_at: r.created_at,
        updated_at: r.updated_at,
      });
    }
  }

  for (const topic of topLevel) {
    topic.subtopics = subtopicsMap[topic.id] || [];
  }

  return topLevel;
}

// GET /api/knowledge
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      'SELECT id, parent_id, title, content, sort_order, created_at, updated_at FROM wl_admin_knowledge ORDER BY sort_order ASC, id ASC'
    );
    res.json(buildNested(rows));
  } catch (err) { next(err); }
});

// GET /api/knowledge/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query('SELECT * FROM wl_admin_knowledge WHERE id = ?', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const article = rows[0];

    // Если это топ-уровень, подгрузить subtopics
    if (!article.parent_id) {
      const [subs] = await dbPool.query('SELECT * FROM wl_admin_knowledge WHERE parent_id = ? ORDER BY sort_order ASC, id ASC', [article.id]);
      article.subtopics = subs;
    }

    res.json(article);
  } catch (err) { next(err); }
});

// POST /api/knowledge
router.post('/', async (req, res, next) => {
  try {
    const { title, content, parent_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_knowledge (title, content, parent_id) VALUES (?, ?, ?)',
      [title, content || '', parent_id || null]
    );

    const [rows] = await dbPool.query('SELECT * FROM wl_admin_knowledge WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/knowledge/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await dbPool.query('SELECT id FROM wl_admin_knowledge WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Not found' });

    const fields = [];
    const values = [];
    if (req.body.title !== undefined) { fields.push('title = ?'); values.push(req.body.title); }
    if (req.body.content !== undefined) { fields.push('content = ?'); values.push(req.body.content); }

    if (fields.length) {
      values.push(id);
      await dbPool.query(`UPDATE wl_admin_knowledge SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const [rows] = await dbPool.query('SELECT * FROM wl_admin_knowledge WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/knowledge/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const [existing] = await dbPool.query('SELECT id FROM wl_admin_knowledge WHERE id = ?', [Number(req.params.id)]);
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    await dbPool.query('DELETE FROM wl_admin_knowledge WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
