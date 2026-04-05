import { Router } from 'express';
import dbPool from '../config/db.js';
import requireAdmin from '../middleware/requireAdmin.js';

const router = Router();

router.use(requireAdmin);

// GET /api/audit-log?entity_type=&user_id=&date_from=&date_to=&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    let where = 'WHERE 1=1';
    const params = [];

    if (req.query.entity_type) {
      where += ' AND entity_type = ?';
      params.push(req.query.entity_type);
    }
    if (req.query.user_id) {
      where += ' AND user_id = ?';
      params.push(req.query.user_id);
    }
    if (req.query.date_from) {
      where += ' AND created_at >= ?';
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      where += ' AND created_at <= ?';
      params.push(req.query.date_to + ' 23:59:59');
    }

    const [[{ total }]] = await dbPool.query(
      `SELECT COUNT(*) as total FROM wl_admin_audit_log ${where}`,
      params
    );

    const [items] = await dbPool.query(
      `SELECT * FROM wl_admin_audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ items, total });
  } catch (err) { next(err); }
});

export default router;
