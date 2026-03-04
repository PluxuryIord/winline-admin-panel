import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, 'data', 'knowledge.json');

function readData() {
  const raw = fs.readFileSync(dataPath, 'utf-8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
}

function nextId(data) {
  let max = 0;
  for (const topic of data) {
    if (topic.id > max) max = topic.id;
    if (topic.subtopics) {
      for (const sub of topic.subtopics) {
        if (sub.id > max) max = sub.id;
      }
    }
  }
  return max + 1;
}

export function getAllNested() {
  return readData();
}

export function getById(id) {
  const data = readData();
  for (const topic of data) {
    if (topic.id === id) return topic;
    if (topic.subtopics) {
      const sub = topic.subtopics.find(s => s.id === id);
      if (sub) return sub;
    }
  }
  return null;
}

export function create({ title, content = '', parent_id = null }) {
  const data = readData();
  const id = nextId(data);
  const now = new Date().toISOString();

  if (parent_id) {
    const parent = data.find(t => t.id === parent_id);
    if (!parent) throw new Error('Parent not found');
    const newSub = { id, parent_id, title, content, created_at: now, updated_at: now };
    if (!parent.subtopics) parent.subtopics = [];
    parent.subtopics.push(newSub);
    writeData(data);
    return newSub;
  } else {
    const newTopic = { id, title, content, subtopics: [], created_at: now, updated_at: now };
    data.push(newTopic);
    writeData(data);
    return newTopic;
  }
}

export function update(id, { title, content }) {
  const data = readData();
  const now = new Date().toISOString();

  for (const topic of data) {
    if (topic.id === id) {
      if (title !== undefined) topic.title = title;
      if (content !== undefined) topic.content = content;
      topic.updated_at = now;
      writeData(data);
      return topic;
    }
    if (topic.subtopics) {
      const sub = topic.subtopics.find(s => s.id === id);
      if (sub) {
        if (title !== undefined) sub.title = title;
        if (content !== undefined) sub.content = content;
        sub.updated_at = now;
        writeData(data);
        return sub;
      }
    }
  }
  return null;
}

export function remove(id) {
  const data = readData();

  // Check if it's a topic
  const topicIdx = data.findIndex(t => t.id === id);
  if (topicIdx !== -1) {
    data.splice(topicIdx, 1);
    writeData(data);
    return;
  }

  // Check subtopics
  for (const topic of data) {
    if (topic.subtopics) {
      const subIdx = topic.subtopics.findIndex(s => s.id === id);
      if (subIdx !== -1) {
        topic.subtopics.splice(subIdx, 1);
        writeData(data);
        return;
      }
    }
  }
}
