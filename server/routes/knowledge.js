import { Router } from 'express';
import dbPool from '../config/db.js';
import { BOT_TOKEN } from '../config/env.js';

const router = Router();

// Маппинг ключей статей → человекочитаемые названия
const ARTICLE_TITLES = {
  lk_overview: 'Обзор личного кабинета',
  offer_info: 'Информация по офферу',
  ref_link: 'Генерация реф.ссылки',
  postback: 'Настройка постбэка',
  download_report: 'Скачивание отчета',
  download_report_2: 'Отчет «Конверсии»',
};

// Ключи фото, привязанные к статьям
const PHOTO_MAP = {
  postback: 'postback_photo',
  download_report: 'report_photo',
  download_report_2: 'report_photo_2',
};

// Порядок отображения
const ARTICLE_ORDER = ['lk_overview', 'offer_info', 'ref_link', 'postback', 'download_report', 'download_report_2'];

/** Получить file_id → URL через Telegram getFile API */
async function getPhotoUrl(fileId) {
  if (!fileId || !BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await r.json();
    if (data.ok && data.result?.file_path) {
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
    }
  } catch { /* ignore */ }
  return null;
}

// ===================== BOT TEXTS API =====================

// GET /api/knowledge — список статей из таблицы texts (category=knowledge_base)
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'knowledge_base' LIMIT 1");
    if (!rows.length) return res.json([]);

    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const dbId = rows[0].id;

    const articles = [];
    for (const key of ARTICLE_ORDER) {
      if (data[key] === undefined) continue;
      const photoKey = PHOTO_MAP[key] || null;
      const photoFileId = photoKey ? (data[photoKey] || null) : null;
      articles.push({
        key,
        title: ARTICLE_TITLES[key] || key,
        content: data[key] || '',
        photoKey,
        photoFileId,
      });
    }

    res.json({ dbId, articles });
  } catch (err) { next(err); }
});

// GET /api/knowledge/photo/:fileId — proxy для фото из Telegram (чтобы не палить BOT_TOKEN на фронте)
router.get('/photo/:fileId', async (req, res, next) => {
  try {
    const url = await getPhotoUrl(req.params.fileId);
    if (!url) return res.status(404).json({ error: 'Photo not found' });
    // Проксируем файл
    const fileRes = await fetch(url);
    if (!fileRes.ok) return res.status(404).json({ error: 'Photo not found' });
    res.set('Content-Type', fileRes.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    res.send(buffer);
  } catch (err) { next(err); }
});

// PUT /api/knowledge/:key — обновить одну статью
router.put('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'content is required' });

    const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'knowledge_base' LIMIT 1");
    if (!rows.length) return res.status(404).json({ error: 'Knowledge base not found in DB' });

    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    if (data[key] === undefined) return res.status(404).json({ error: `Article "${key}" not found` });

    data[key] = content;
    await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), rows[0].id]);

    res.json({ ok: true, key, content });
  } catch (err) { next(err); }
});

export default router;
