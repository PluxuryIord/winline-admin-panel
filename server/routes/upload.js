import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToS3 } from '../services/s3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const router = Router();

// POST /api/upload — загрузка изображения (base64)
router.post('/', async (req, res, next) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data' });

    const match = data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid image data' });

    const allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!allowedFormats.includes(match[1].toLowerCase())) {
      return res.status(400).json({ error: `Image format "${match[1]}" is not allowed. Use: ${allowedFormats.join(', ')}` });
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const name = `image.${ext}`;

    const { url } = await uploadToS3(buffer, name, `image/${match[1]}`, 'knowledge');
    res.json({ url });
  } catch (err) { next(err); }
});

export { uploadsDir };
export default router;
