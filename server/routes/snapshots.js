import { Router } from 'express';
import requireAdmin from '../middleware/requireAdmin.js';
import { listSnapshots, getSnapshot, rollbackSnapshot, createDailySnapshot } from '../services/snapshots.js';

const router = Router();

// GET /api/snapshots?entity_type=
router.get('/', async (req, res, next) => {
  try {
    const entityType = req.query.entity_type;
    if (!entityType) return res.status(400).json({ error: 'entity_type query param required' });
    const snapshots = await listSnapshots(entityType);
    res.json(snapshots);
  } catch (err) { next(err); }
});

// GET /api/snapshots/:id
router.get('/:id', async (req, res, next) => {
  try {
    const snapshot = await getSnapshot(Number(req.params.id));
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
    res.json(snapshot);
  } catch (err) { next(err); }
});

// POST /api/snapshots — create snapshot on demand
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { entity_type } = req.body;
    if (!entity_type) return res.status(400).json({ error: 'entity_type required' });
    const userId = req.user.id;
    const userName = req.user.displayName || req.user.username;
    await createDailySnapshot(entity_type, userId, userName);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/snapshots/:id/rollback
router.post('/:id/rollback', requireAdmin, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userName = req.user.displayName || req.user.username;
    const snapshot = await rollbackSnapshot(Number(req.params.id), userId, userName);
    res.json({ ok: true, snapshot_id: snapshot.id, entity_type: snapshot.entity_type });
  } catch (err) { next(err); }
});

export default router;
