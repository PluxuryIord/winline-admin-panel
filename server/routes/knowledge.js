import { Router } from 'express';
import multer from 'multer';
import dbPool from '../config/db.js';
import { BOT_TOKEN, TG_ADMIN_CHAT_ID } from '../config/env.js';
import { uploadToS3 } from '../services/s3.js';
import { logAudit } from '../services/auditLog.js';
import { createDailySnapshot } from '../services/snapshots.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Хардкод-данные для миграции (используются только при первом запросе, если _meta ещё нет)
const LEGACY_TITLES = {
  lk_overview: 'Обзор личного кабинета',
  offer_info: 'Информация по офферу',
  ref_link: 'Генерация реф.ссылки',
  postback: 'Настройка постбэка',
  download_report: 'Скачивание отчета',
  download_report_2: 'Отчет «Конверсии»',
};
const LEGACY_ORDER = ['lk_overview', 'offer_info', 'ref_link', 'postback', 'download_report', 'download_report_2'];
// Legacy photo key mapping (old keys that don't follow the {key}_photo convention)
const LEGACY_PHOTO_MAP = {
  postback: 'postback_photo',
  download_report: 'report_photo',
  download_report_2: 'report_photo_2',
};

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

/** Убедиться что _meta есть. Если нет — мигрировать из хардкода. */
async function ensureMeta(data, dbId) {
  if (data._meta) return;
  data._meta = {
    order: [...LEGACY_ORDER],
    titles: { ...LEGACY_TITLES },
  };
  await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), dbId]);
  console.log('[knowledge] Migrated _meta into knowledge_base JSON');
}

/** Получить фото-ключ для статьи. Стандарт: {key}_photo */
function getPhotoKey(key) {
  return `${key}_photo`;
}

/** Транслитерация кириллицы → латиница → snake_case */
function toKey(title) {
  const map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
    'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
    'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y',
    'ь':'','э':'e','ю':'yu','я':'ya',
  };
  return title
    .toLowerCase()
    .split('')
    .map(c => map[c] !== undefined ? map[c] : c)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

// ===================== BOT TEXTS API =====================

/** Загрузить KB data из DB */
async function loadKB() {
  const [rows] = await dbPool.query("SELECT id, data FROM texts WHERE category = 'knowledge_base' LIMIT 1");
  if (!rows.length) return { dbId: null, data: null };
  const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  return { dbId: rows[0].id, data };
}

/** Сохранить KB data в DB */
async function saveKB(data, dbId) {
  await dbPool.query('UPDATE texts SET data = ? WHERE id = ?', [JSON.stringify(data), dbId]);
}

// GET /api/knowledge — список статей
router.get('/', async (req, res, next) => {
  try {
    const { dbId, data } = await loadKB();
    if (!data) return res.json([]);

    await ensureMeta(data, dbId);

    const meta = data._meta;
    const articles = [];
    for (const key of meta.order) {
      if (data[key] === undefined) continue;
      const photoKey = getPhotoKey(key);
      // Для legacy-ключей (postback_photo, report_photo и т.д.) проверяем оба варианта
      const legacyPhotoKey = LEGACY_PHOTO_MAP[key];
      const photoFileId = data[photoKey] || (legacyPhotoKey ? data[legacyPhotoKey] : null) || null;
      const photoS3Url = data[`${photoKey}_s3`] || (legacyPhotoKey ? data[`${legacyPhotoKey}_s3`] : null) || null;
      articles.push({
        key,
        title: meta.titles[key] || key,
        content: data[key] || '',
        photoKey,
        photoFileId,
        photoS3Url,
      });
    }

    res.json({ dbId, articles });
  } catch (err) { next(err); }
});

// GET /api/knowledge/photo/:fileId — proxy для фото из Telegram
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

// POST /api/knowledge — создать новую тему
router.post('/', async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

    const { dbId, data } = await loadKB();
    if (!data) return res.status(404).json({ error: 'Knowledge base not found' });
    await ensureMeta(data, dbId);

    // Generate unique key
    let key = toKey(title.trim());
    if (!key) key = 'topic_' + Date.now();
    // Ensure unique
    let finalKey = key;
    let suffix = 2;
    while (data[finalKey] !== undefined || data._meta.order.includes(finalKey)) {
      finalKey = `${key}_${suffix++}`;
    }

    data[finalKey] = ''; // empty content
    data._meta.order.push(finalKey);
    data._meta.titles[finalKey] = title.trim();
    await saveKB(data, dbId);

    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'create', 'knowledge', finalKey, title.trim(), null, { key: finalKey, title: title.trim() });
    createDailySnapshot('knowledge', req.user.id, userName);

    res.json({ ok: true, key: finalKey, title: title.trim() });
  } catch (err) { next(err); }
});

// POST /api/knowledge/photo/:photoKey — загрузить/заменить фото статьи
router.post('/photo/:photoKey', upload.single('photo'), async (req, res, next) => {
  try {
    const { photoKey } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // 1. Upload to S3
    const { url: s3Url } = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype, 'knowledge');

    // 2. Send to Telegram to get file_id
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

    // 3. Update DB
    const { dbId, data } = await loadKB();
    if (!data) return res.status(404).json({ error: 'Knowledge base not found' });

    if (fileId) data[photoKey] = fileId;
    data[`${photoKey}_s3`] = s3Url;

    // Also write to legacy photo keys so the bot can find them
    // e.g. download_report_photo → report_photo, download_report_2_photo → report_photo_2
    for (const [topicKey, legacyKey] of Object.entries(LEGACY_PHOTO_MAP)) {
      const modernKey = `${topicKey}_photo`;
      if (photoKey === modernKey && legacyKey !== modernKey) {
        if (fileId) data[legacyKey] = fileId;
        data[`${legacyKey}_s3`] = s3Url;
      }
    }

    await saveKB(data, dbId);

    res.json({ ok: true, photoKey, fileId, s3Url });
  } catch (err) { next(err); }
});

// DELETE /api/knowledge/photo/:photoKey — удалить фото статьи
router.delete('/photo/:photoKey', async (req, res, next) => {
  try {
    const { photoKey } = req.params;
    const { dbId, data } = await loadKB();
    if (!data) return res.status(404).json({ error: 'Knowledge base not found' });

    delete data[photoKey];
    delete data[`${photoKey}_s3`];

    // Also delete legacy photo keys
    for (const [topicKey, legacyKey] of Object.entries(LEGACY_PHOTO_MAP)) {
      const modernKey = `${topicKey}_photo`;
      if (photoKey === modernKey && legacyKey !== modernKey) {
        delete data[legacyKey];
        delete data[`${legacyKey}_s3`];
      }
    }

    await saveKB(data, dbId);

    res.json({ ok: true, photoKey, deleted: true });
  } catch (err) { next(err); }
});

// PUT /api/knowledge/:key/title — переименовать тему
router.put('/:key/title', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });

    const { dbId, data } = await loadKB();
    if (!data) return res.status(404).json({ error: 'Knowledge base not found' });
    await ensureMeta(data, dbId);

    if (!data._meta.titles[key]) return res.status(404).json({ error: `Article "${key}" not found` });

    const oldTitle = data._meta.titles[key];
    data._meta.titles[key] = title.trim();
    await saveKB(data, dbId);

    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'update', 'knowledge', key, title.trim(), { title: oldTitle }, { title: title.trim() });
    createDailySnapshot('knowledge', req.user.id, userName);

    res.json({ ok: true, key, title: title.trim() });
  } catch (err) { next(err); }
});

// PUT /api/knowledge/:key — обновить контент статьи
router.put('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'content is required' });

    const { dbId, data } = await loadKB();
    if (!data) return res.status(404).json({ error: 'Knowledge base not found in DB' });
    if (data[key] === undefined) return res.status(404).json({ error: `Article "${key}" not found` });

    const oldContent = data[key];
    data[key] = content;
    await saveKB(data, dbId);

    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'update', 'knowledge', key, data._meta?.titles?.[key] || key, { content: oldContent }, { content });
    createDailySnapshot('knowledge', req.user.id, userName);

    res.json({ ok: true, key, content });
  } catch (err) { next(err); }
});

// DELETE /api/knowledge/:key — удалить тему целиком
router.delete('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { dbId, data } = await loadKB();
    if (!data) return res.status(404).json({ error: 'Knowledge base not found' });
    await ensureMeta(data, dbId);

    if (data[key] === undefined) return res.status(404).json({ error: `Article "${key}" not found` });

    const oldArticle = { key, title: data._meta?.titles?.[key], content: data[key] };

    // Remove content
    delete data[key];
    // Remove photo keys (standard convention + legacy)
    const photoKey = getPhotoKey(key);
    delete data[photoKey];
    delete data[`${photoKey}_s3`];
    // Also remove legacy photo keys if any
    const legacyPhotoKey = LEGACY_PHOTO_MAP[key];
    if (legacyPhotoKey) {
      delete data[legacyPhotoKey];
      delete data[`${legacyPhotoKey}_s3`];
    }

    // Remove from _meta
    data._meta.order = data._meta.order.filter(k => k !== key);
    delete data._meta.titles[key];

    await saveKB(data, dbId);

    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'delete', 'knowledge', key, oldArticle.title || key, oldArticle, null);
    createDailySnapshot('knowledge', req.user.id, userName);

    res.json({ ok: true, key, deleted: true });
  } catch (err) { next(err); }
});

export default router;
