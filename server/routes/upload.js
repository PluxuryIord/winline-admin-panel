import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const router = Router();

// POST /api/upload — загрузка изображения (base64)
router.post('/', (req, res, next) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data' });

    const match = data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid image data' });

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, name), buffer);

    res.json({ url: `/uploads/${name}` });
  } catch (err) { next(err); }
});

export { uploadsDir };
export default router;
