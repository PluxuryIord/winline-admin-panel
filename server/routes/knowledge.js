import { Router } from 'express';
import multer from 'multer';
import dbPool from '../config/db.js';
import { BOT_TOKEN, TG_ADMIN_CHAT_ID } from '../config/env.js';
import { uploadToS3 } from '../services/s3.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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
  lk_overview: 'lk_overview_photo',
  offer_info: 'offer_info_photo',
  ref_link: 'ref_link_photo',
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
      const photoS3Url = photoKey ? (data[`${photoKey}_s3`] || null) : null;
      articles.push({
        key,
        title: ARTICLE_TITLES[key] || key,
        content: data[key] || '',
        photoKey,
        photoFileId,
        photoS3Url,
      });
    }

    res.json({ dbId, articles });
  } catch (err) { next(err); }
});

// GET /api/knowledge/photo/:fileId — proxy для фото из Telegram (чтобы не палить BOT_TOKEN на фронте)
// Экспортируем отдельно для публичного маршрута в app.js
export async function knowledgePhotoProxy(req, res, next) {
  try {
    const url = await getPhotoUrl(req.params.fileId);
    if (!url) return res.status(404).json({ error: 'Photo not found' });
    const fileRes = await fetch(url);
    if (!fileRes.ok) return res.status(404).json({ error: 'Photo not found' });
    res.set('Content-Type', fileRes.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    res.send(buffer);
  } catch (err) { next(err); }
}
router.get('/photo/:fileId', knowledgePhotoProxy);

// POST /api/knowledge/photo/:photoKey — загрузить/заменить фото статьи
router.post('/photo/:photoKey', upload.single('photo'), async (req, res, next) => {
  try {
    const { photoKey } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // 1. Upload to S3
    const { url: s3Url } = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype, 'knowledge');

    // 2. Send to Telegram to get file_id (send to admin, get file_id, delete message)
    let fileId = null;
    if (BOT_TOKEN && TG_ADMIN_CHAT_ID) {
      try {
        const form = new FormData();
        form.set('chat_id', TG_ADMIN_CHAT_ID);
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        form.set('photo', new File([blob], req.file.originalname, { type: req.file.mimetype }));
        form.set('disable_notification', 'true');
        const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST', body: form,
        });
        const sendData = await sendRes.json();
        console.log('[knowledge] sendPhoto result:', JSON.stringify(sendData).slice(0, 300));
        if (sendData.ok && sendData.result?.photo?.length) {
          const photos = sendData.result.photo;
          fileId = photos[photos.length - 1].file_id;
          // Delete the message so admin doesn't see it
          const msgId = sendData.result.message_id;
          fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TG_ADMIN_CHAT_ID, message_id: msgId }),
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[knowledge] Failed to get Telegram file_id:', e.message);
      }
    }

    // 3. Update DB — store file_id and s3_url
    const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'knowledge_base' LIMIT 1");
    if (!rows.length) return res.status(404).json({ error: 'Knowledge base not found' });

    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    if (fileId) data[photoKey] = fileId;
    data[`${photoKey}_s3`] = s3Url;
    await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), rows[0].id]);

    res.json({ ok: true, photoKey, fileId, s3Url });
  } catch (err) { next(err); }
});

// DELETE /api/knowledge/photo/:photoKey — удалить фото статьи
router.delete('/photo/:photoKey', async (req, res, next) => {
  try {
    const { photoKey } = req.params;
    const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'knowledge_base' LIMIT 1");
    if (!rows.length) return res.status(404).json({ error: 'Knowledge base not found' });

    const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    delete data[photoKey];
    delete data[`${photoKey}_s3`];
    await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), rows[0].id]);

    res.json({ ok: true, photoKey, deleted: true });
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
