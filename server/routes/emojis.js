import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dbPool from '../config/db.js';
import { BOT_TOKEN } from '../config/env.js';
import { validateImageFile } from '../services/fileValidation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Save to both public/ (source) and dist/ (served in production)
const publicEmojiDir = path.join(__dirname, '..', '..', 'public', 'emoji');
const distEmojiDir = path.join(__dirname, '..', '..', 'dist', 'emoji');
if (!fs.existsSync(publicEmojiDir)) fs.mkdirSync(publicEmojiDir, { recursive: true });
if (!fs.existsSync(distEmojiDir)) fs.mkdirSync(distEmojiDir, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const router = Router();

const DEFAULT_EMOJI_IDS = [
  '5249203579134179981','5249222386795967624','5249038167058709114',
  '5249101968797889750','5249380256908865528','5249497067134418748',
  '5248961824015024533','5249022679406641203','5249500859590539214',
  '5249393919199836094','5249315265463743154','5249137793120107984',
  '5249431560293220758','5248978625927083352','5249266736628266267',
  '5249284625167055914','5248996780753844722','5249377542489535714',
  '5249100031767641367','5249370271109905382','5249023950716959287',
  '5249494885291033786','5249233003955125362','5249132016389092908',
  '5249455491850991356','5249484955326643084','5249109553710136350',
  '5249409342427396269','5249407873548581860','5249222721803416777',
  '5249042689659273281','5249150639367287343','5249302071324214197',
  '5249311528842196557','5249350832087925208',
];

// GET /api/emojis
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query(
      'SELECT id, emoji_id, image_url, created_at FROM wl_admin_emojis ORDER BY id'
    );
    if (rows.length === 0) {
      const values = DEFAULT_EMOJI_IDS.map(eid => [eid, `/emoji/${eid}.webp`]);
      await dbPool.query('INSERT IGNORE INTO wl_admin_emojis (emoji_id, image_url) VALUES ?', [values]);
      const [seeded] = await dbPool.query('SELECT id, emoji_id, image_url, created_at FROM wl_admin_emojis ORDER BY id');
      return res.json(seeded);
    }
    res.json(rows);
  } catch (err) { next(err); }
});

/**
 * Download custom emoji .webp from Telegram by custom_emoji_id.
 * Uses getCustomEmojiStickers → getFile → download.
 */
async function downloadEmojiFromTelegram(emojiId) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN не настроен');

  // 1. Get sticker info
  const stickersRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getCustomEmojiStickers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_emoji_ids: [emojiId] }),
  });
  const stickersData = await stickersRes.json();
  if (!stickersData.ok || !stickersData.result?.length) {
    throw new Error('Эмодзи не найден в Telegram. Проверьте ID.');
  }
  const sticker = stickersData.result[0];

  // Prefer thumbnail (static webp) over animated sticker
  const fileId = sticker.thumbnail?.file_id || sticker.file_id;

  // 2. Get file path
  const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok || !fileData.result?.file_path) {
    throw new Error('Не удалось получить файл из Telegram');
  }

  // 3. Download file
  const dlRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`);
  if (!dlRes.ok) throw new Error('Не удалось скачать файл из Telegram');
  const buffer = Buffer.from(await dlRes.arrayBuffer());
  return buffer;
}

// POST /api/emojis — multipart: emoji_id + optional file (.webp)
// If no file provided, auto-downloads from Telegram by emoji_id
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { emoji_id } = req.body;
    if (!emoji_id || !/^\d{5,30}$/.test(emoji_id.trim())) {
      return res.status(400).json({ error: 'Invalid emoji_id' });
    }

    const eid = emoji_id.trim();
    let buffer;

    if (req.file) {
      // Manual upload
      const imgCheck = await validateImageFile(req.file.buffer, req.file.originalname);
      if (!imgCheck.ok) return res.status(400).json({ error: imgCheck.reason });
      buffer = req.file.buffer;
    } else {
      // Auto-download from Telegram
      try {
        buffer = await downloadEmojiFromTelegram(eid);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const filename = `${eid}.webp`;
    fs.writeFileSync(path.join(publicEmojiDir, filename), buffer);
    fs.writeFileSync(path.join(distEmojiDir, filename), buffer);

    const image_url = `/emoji/${filename}`;
    const [result] = await dbPool.query(
      'INSERT INTO wl_admin_emojis (emoji_id, image_url) VALUES (?, ?)',
      [eid, image_url]
    );
    res.json({ id: result.insertId, emoji_id: eid, image_url, created_at: new Date().toISOString() });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Emoji already exists' });
    }
    next(err);
  }
});

// DELETE /api/emojis/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await dbPool.query('SELECT emoji_id FROM wl_admin_emojis WHERE id = ?', [id]);
    if (rows.length) {
      const fname = `${rows[0].emoji_id}.webp`;
      try { fs.unlinkSync(path.join(publicEmojiDir, fname)); } catch {}
      try { fs.unlinkSync(path.join(distEmojiDir, fname)); } catch {}
    }

    await dbPool.query('DELETE FROM wl_admin_emojis WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
