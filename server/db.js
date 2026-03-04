import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'knowledge.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id  INTEGER DEFAULT NULL,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES articles(id) ON DELETE CASCADE
  )
`);

export function getAllNested() {
  const topics = db.prepare(
    'SELECT * FROM articles WHERE parent_id IS NULL ORDER BY sort_order, id'
  ).all();

  const subtopics = db.prepare(
    'SELECT * FROM articles WHERE parent_id IS NOT NULL ORDER BY sort_order, id'
  ).all();

  const grouped = {};
  for (const sub of subtopics) {
    if (!grouped[sub.parent_id]) grouped[sub.parent_id] = [];
    grouped[sub.parent_id].push(sub);
  }

  return topics.map(topic => ({
    ...topic,
    subtopics: grouped[topic.id] || []
  }));
}

export function getById(id) {
  return db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
}

export function create({ title, content = '', parent_id = null }) {
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM articles WHERE parent_id IS ?'
  ).get(parent_id);

  const result = db.prepare(
    'INSERT INTO articles (parent_id, title, content, sort_order) VALUES (?, ?, ?, ?)'
  ).run(parent_id, title, content, (maxOrder?.max_order ?? -1) + 1);

  return getById(result.lastInsertRowid);
}

export function update(id, { title, content }) {
  const fields = [];
  const values = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (content !== undefined) { fields.push('content = ?'); values.push(content); }

  if (fields.length === 0) return getById(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE articles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getById(id);
}

export function remove(id) {
  db.prepare('DELETE FROM articles WHERE id = ?').run(id);
}

export function isEmpty() {
  const row = db.prepare('SELECT COUNT(*) as count FROM articles').get();
  return row.count === 0;
}

export function insertWithId({ id, parent_id, title, content, sort_order }) {
  db.prepare(
    'INSERT INTO articles (id, parent_id, title, content, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(id, parent_id, title, content, sort_order);
}

export default db;
