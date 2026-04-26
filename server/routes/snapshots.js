import { Router } from 'express';
import requireAdmin from '../middleware/requireAdmin.js';
import { listSnapshots, getSnapshot, rollbackSnapshot, createDailySnapshot, setSnapshotNote } from '../services/snapshots.js';

const router = Router();

// GET /api/snapshots — unified list (all scenarios/knowledge/tags in every snapshot)
router.get('/', async (req, res, next) => {
  try {
    const snapshots = await listSnapshots();
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
    const userId = req.user.id;
    const userName = req.user.displayName || req.user.username;
    await createDailySnapshot('all', userId, userName, { force: true });
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

// PUT /api/snapshots/:id/note — set/update note
router.put('/:id/note', requireAdmin, async (req, res, next) => {
  try {
    const note = String(req.body?.note || '').slice(0, 2000);
    await setSnapshotNote(Number(req.params.id), note);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
