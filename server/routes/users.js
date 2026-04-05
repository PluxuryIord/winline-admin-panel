import { Router } from 'express';
import dbPool from '../config/db.js';
import { BOT_TOKEN } from '../config/env.js';
import { logAudit } from '../services/auditLog.js';

const router = Router();
const COMMENT_PREFIX = '__comment__:';

function mapUserRow(r, userTags, comment = '') {
  return {
    id: r.user_id,
    fullName: r.rl_full_name || r.full_name || '—',
    telegram: r.username ? `@${r.username}` : '—',
    registrationDate: r.date_reg ? new Date(r.date_reg).toISOString().split('T')[0] : '—',
    banned: !!r.banned,
    role: r.role || '—',
    graph: r.graph || '—',
    phone: r.phone_number || '—',
    registered: !!r.registered,
    personalLabel: !!r.personal_label,
    showQr: !!r.show_qr,
    hasUserChat: !!r.has_user_chat,
    tags: userTags,
    comment,
  };
}

// User counts as "active chat" only if they sent at least one DM themselves
const HAS_USER_CHAT_EXPR = `(EXISTS (
  SELECT 1 FROM wl_admin_chat_messages m
  INNER JOIN wl_admin_chats c ON c.id = m.chat_id
  WHERE c.user_id = u.user_id AND m.sender = 'user'
))`;

// Получить теги, комментарии и editedIds для массива user_id из MySQL (один запрос вместо двух)
async function getTagsAndComments(userIds) {
  if (!userIds.length) return { tags: {}, comments: {}, editedIds: new Set() };
  const [rows] = await dbPool.query(
    'SELECT user_id, tag FROM wl_admin_user_tags WHERE user_id IN (?)',
    [userIds]
  );
  const tags = {};
  const comments = {};
  const editedIds = new Set();
  for (const r of rows) {
    const uid = String(r.user_id);
    editedIds.add(uid);
    if (r.tag.startsWith(COMMENT_PREFIX)) {
      comments[uid] = r.tag.slice(COMMENT_PREFIX.length);
    } else {
      if (!tags[uid]) tags[uid] = [];
      tags[uid].push(r.tag);
    }
  }
  return { tags, comments, editedIds };
}

// Проверяем, есть ли «пустая» запись-маркер (user_id с 0 тегов, но был отредактирован)
// Для этого используем отдельную таблицу-маркер или проверяем наличие user_id в таблице
// Простое решение: если user_id есть в таблице тегов — значит редактировался, дефолт не нужен
// Если нет ни одной строки — дефолт ['Старый пользователь']
// Но при удалении всех тегов не остаётся строк! Нужен маркер.
// Решение: при сохранении пустых тегов — вставляем специальную строку с tag = '__edited__'
const EDITED_MARKER = '__edited__';
// Все пользователи зарегистрированные до этой даты автоматически получают тег "Старый пользователь"
const OLD_USER_CUTOFF = new Date('2026-03-18');

function buildTagsForUser(userId, tagsMap, editedIds, dateReg) {
  const uid = String(userId);
  // Собираем вручную назначенные теги
  let tags;
  if (tagsMap[uid]) {
    tags = tagsMap[uid].filter(t => t !== EDITED_MARKER);
  } else if (editedIds.has(uid)) {
    tags = [];
  } else {
    tags = [];
  }
  // Автотег "Старый пользователь" для всех кто зарегался до cutoff
  const isOldUser = dateReg && new Date(dateReg) < OLD_USER_CUTOFF;
  if (isOldUser && !tags.includes('Старый пользователь')) {
    tags.unshift('Старый пользователь');
  }
  return tags;
}

const USER_COLUMNS = 'user_id, full_name, username, date_reg, banned, rl_full_name, role, graph, phone_number, registered, personal_label, show_qr';

// GET /api/users?limit=50&offset=0&search=...
router.get('/', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const search = (req.query.search || '').trim();

    const tags = (req.query.tags || '').split(',').map(t => t.trim()).filter(Boolean);

    // Build params in SQL clause order: tagJoin params first, then where params
    const params = [];
    let tagJoin = '';
    if (tags.length) {
      tagJoin = 'INNER JOIN (SELECT DISTINCT user_id FROM wl_admin_user_tags WHERE tag IN (?)) AS tf ON tf.user_id = u.user_id';
      params.push(tags);
    }

    let where = '';
    if (search) {
      where = 'WHERE (u.full_name LIKE ? OR u.rl_full_name LIKE ? OR u.username LIKE ? OR EXISTS (SELECT 1 FROM wl_admin_user_tags ts WHERE ts.user_id = u.user_id AND ts.tag LIKE ?))';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const fromClause = `FROM users u ${tagJoin} ${where}`;
    const [[{ total }]] = await dbPool.query(`SELECT COUNT(*) as total ${fromClause}`, params);
    const [rows] = await dbPool.query(
      `SELECT ${USER_COLUMNS.split(', ').map(c => `u.${c}`).join(', ')}, ${HAS_USER_CHAT_EXPR} AS has_user_chat ${fromClause} ORDER BY u.date_reg DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const userIds = rows.map(r => r.user_id);
    const { tags: tagsMap, comments: commentsMap, editedIds } = await getTagsAndComments(userIds);

    const users = rows.map(r => mapUserRow(r, buildTagsForUser(r.user_id, tagsMap, editedIds, r.date_reg), commentsMap[String(r.user_id)] || ''));
    res.json({ users, total, limit, offset });
  } catch (err) { next(err); }
});

// GET /api/users/all-tags — все уникальные теги из wl_admin_user_tags
router.get('/all-tags', async (req, res, next) => {
  try {
    const [rows] = await dbPool.query("SELECT DISTINCT tag FROM wl_admin_user_tags WHERE tag != '__edited__'");
    res.json(rows.map(r => r.tag).sort());
  } catch (err) { next(err); }
});

// PUT /api/users/tags/rename — переименовать тег у всех носителей
router.put('/tags/rename', async (req, res, next) => {
  try {
    const { oldTag, newTag } = req.body;
    if (!oldTag || !newTag) return res.status(400).json({ error: 'oldTag and newTag required' });
    if (oldTag === newTag) return res.json({ ok: true, affected: 0 });

    // Delete newTag where user already has it to avoid unique constraint violation
    await dbPool.query(
      `DELETE t1 FROM wl_admin_user_tags t1
       INNER JOIN wl_admin_user_tags t2 ON t1.user_id = t2.user_id
       WHERE t1.tag = ? AND t2.tag = ?`,
      [newTag, oldTag]
    );
    const [result] = await dbPool.query(
      'UPDATE wl_admin_user_tags SET tag = ? WHERE tag = ?',
      [newTag, oldTag]
    );
    res.json({ ok: true, affected: result.affectedRows });
  } catch (err) { next(err); }
});

// DELETE /api/users/tags/bulk-delete — удалить тег у всех носителей
router.delete('/tags/bulk-delete', async (req, res, next) => {
  try {
    const tag = req.query.tag;
    if (!tag) return res.status(400).json({ error: 'tag query param required' });
    const [result] = await dbPool.query('DELETE FROM wl_admin_user_tags WHERE tag = ?', [tag]);
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const [rows] = await dbPool.query(
      `SELECT ${USER_COLUMNS.split(', ').map(c => `u.${c}`).join(', ')}, ${HAS_USER_CHAT_EXPR} AS has_user_chat FROM users u WHERE u.user_id = ?`,
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });

    const userId = rows[0].user_id;
    const { tags: tagsMap, comments: commentsMap, editedIds } = await getTagsAndComments([userId]);
    const tags = buildTagsForUser(userId, tagsMap, editedIds, rows[0].date_reg);

    res.json(mapUserRow(rows[0], tags, commentsMap[String(userId)] || ''));
  } catch (err) { next(err); }
});

// PUT /api/users/:id/tags
router.put('/:id/tags', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });

    // Capture old tags for audit
    const [oldRows] = await dbPool.query('SELECT tag FROM wl_admin_user_tags WHERE user_id = ? AND tag != ? AND tag NOT LIKE ?', [userId, EDITED_MARKER, `${COMMENT_PREFIX}%`]);
    const oldTags = oldRows.map(r => r.tag);

    // Удаляем все старые теги
    await dbPool.query('DELETE FROM wl_admin_user_tags WHERE user_id = ?', [userId]);

    // Вставляем новые
    if (tags.length > 0) {
      const values = tags.map(t => [userId, t]);
      await dbPool.query('INSERT INTO wl_admin_user_tags (user_id, tag) VALUES ?', [values]);
    } else {
      // Маркер что теги были отредактированы (пустые)
      await dbPool.query('INSERT INTO wl_admin_user_tags (user_id, tag) VALUES (?, ?)', [userId, EDITED_MARKER]);
    }

    const userName = req.user.displayName || req.user.username;
    logAudit(req.user.id, userName, 'update', 'user_tags', String(userId), `user ${userId}`, { tags: oldTags }, { tags });

    res.json({ success: true, tags });
  } catch (err) { next(err); }
});

// PUT /api/users/:id — обновить поля пользователя
router.put('/:id', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const allowed = ['rl_full_name', 'role', 'graph', 'phone_number', 'banned', 'registered'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(req.body[key]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Нет полей для обновления' });
    vals.push(userId);
    await dbPool.query(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, vals);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PUT /api/users/:id/comment — сохранить комментарий
router.put('/:id/comment', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { comment } = req.body;
    if (comment && comment.trim().length > 1000) {
      return res.status(400).json({ error: 'Комментарий слишком длинный (макс. 1000 символов)' });
    }
    // Удаляем старый комментарий
    await dbPool.query('DELETE FROM wl_admin_user_tags WHERE user_id = ? AND tag LIKE ?', [userId, `${COMMENT_PREFIX}%`]);
    // Вставляем новый если не пустой
    if (comment && comment.trim()) {
      await dbPool.query('INSERT INTO wl_admin_user_tags (user_id, tag) VALUES (?, ?)', [userId, COMMENT_PREFIX + comment.trim()]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/users/:id/avatar — аватарка из Telegram
router.get('/:id/avatar', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    // Получаем фото профиля
    const photosRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${userId}&limit=1`);
    const photosData = await photosRes.json();
    if (!photosData.ok || !photosData.result.total_count) {
      return res.status(404).json({ error: 'Нет аватарки' });
    }
    const fileId = photosData.result.photos[0][photosData.result.photos[0].length - 1].file_id;
    // Получаем путь к файлу
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return res.status(404).json({ error: 'Файл не найден' });
    // Проксируем файл
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
    const imgRes = await fetch(fileUrl);
    res.set('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    res.send(buffer);
  } catch (err) { next(err); }
});

export default router;
