import { Router } from 'express';
import dbPool from '../config/db.js';

const router = Router();

function mapUserRow(r, userTags) {
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
    tags: userTags,
  };
}

// Получить теги для массива user_id из MySQL
async function getTagsForUsers(userIds) {
  if (!userIds.length) return {};
  const [rows] = await dbPool.query(
    'SELECT user_id, tag FROM wl_admin_user_tags WHERE user_id IN (?)',
    [userIds]
  );
  const map = {};
  for (const r of rows) {
    const uid = String(r.user_id);
    if (!map[uid]) map[uid] = [];
    map[uid].push(r.tag);
  }
  return map;
}

// Какие user_id имеют хоть одну запись в wl_admin_user_tags (для определения «редактировался ли»)
async function getUserIdsWithTags(userIds) {
  if (!userIds.length) return new Set();
  const [rows] = await dbPool.query(
    'SELECT DISTINCT user_id FROM wl_admin_user_tags WHERE user_id IN (?)',
    [userIds]
  );
  return new Set(rows.map(r => String(r.user_id)));
}

// Проверяем, есть ли «пустая» запись-маркер (user_id с 0 тегов, но был отредактирован)
// Для этого используем отдельную таблицу-маркер или проверяем наличие user_id в таблице
// Простое решение: если user_id есть в таблице тегов — значит редактировался, дефолт не нужен
// Если нет ни одной строки — дефолт ['Старый пользователь']
// Но при удалении всех тегов не остаётся строк! Нужен маркер.
// Решение: при сохранении пустых тегов — вставляем специальную строку с tag = '__edited__'
const EDITED_MARKER = '__edited__';

function buildTagsForUser(userId, tagsMap, editedIds, role) {
  const uid = String(userId);
  let tags;
  if (tagsMap[uid]) {
    tags = tagsMap[uid].filter(t => t !== EDITED_MARKER);
  } else if (editedIds.has(uid)) {
    tags = []; // был отредактирован, но все теги удалены
  } else {
    tags = ['Старый пользователь']; // никогда не редактировался
  }
  // Добавляем роль из таблицы users как тег (если есть и ещё не в списке)
  if (role && role !== '—' && !tags.includes(role)) {
    tags.push(role);
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

    let where = '';
    const params = [];
    if (search) {
      where = 'WHERE (full_name LIKE ? OR rl_full_name LIKE ? OR username LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const [[{ total }]] = await dbPool.query(`SELECT COUNT(*) as total FROM users ${where}`, params);
    const [rows] = await dbPool.query(
      `SELECT ${USER_COLUMNS} FROM users ${where} ORDER BY date_reg DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const userIds = rows.map(r => r.user_id);
    const tagsMap = await getTagsForUsers(userIds);
    const editedIds = await getUserIdsWithTags(userIds);

    const users = rows.map(r => mapUserRow(r, buildTagsForUser(r.user_id, tagsMap, editedIds, r.role)));
    res.json({ users, total, limit, offset });
  } catch (err) { next(err); }
});

// GET /api/users/all-tags — все уникальные теги (из wl_admin_user_tags + roles из users)
router.get('/all-tags', async (req, res, next) => {
  try {
    const [tagRows] = await dbPool.query("SELECT DISTINCT tag FROM wl_admin_user_tags WHERE tag != '__edited__'");
    const [roleRows] = await dbPool.query("SELECT DISTINCT role FROM users WHERE role IS NOT NULL AND role != ''");
    const all = new Set([...tagRows.map(r => r.tag), ...roleRows.map(r => r.role)]);
    res.json(Array.from(all).sort());
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  if (!dbPool) return res.status(503).json({ error: 'База данных не подключена' });
  try {
    const [rows] = await dbPool.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE user_id = ?`,
      [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });

    const userId = rows[0].user_id;
    const tagsMap = await getTagsForUsers([userId]);
    const editedIds = await getUserIdsWithTags([userId]);
    const tags = buildTagsForUser(userId, tagsMap, editedIds, rows[0].role);

    res.json(mapUserRow(rows[0], tags));
  } catch (err) { next(err); }
});

// PUT /api/users/:id/tags
router.put('/:id/tags', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });

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

    res.json({ success: true, tags });
  } catch (err) { next(err); }
});

export default router;
