import { isEmpty, insertWithId } from './db.js';
import { knowledgeData } from '../src/data/knowledgeData.js';

if (!isEmpty()) {
  console.log('Database already has data. Skipping seed.');
  console.log('To re-seed, delete server/data/knowledge.db and run again.');
  process.exit(0);
}

console.log('Seeding database...');

let count = 0;

for (let i = 0; i < knowledgeData.length; i++) {
  const topic = knowledgeData[i];

  insertWithId({
    id: topic.id,
    parent_id: null,
    title: topic.title,
    content: topic.content || '',
    sort_order: i
  });
  count++;

  if (topic.subtopics) {
    for (let j = 0; j < topic.subtopics.length; j++) {
      const sub = topic.subtopics[j];
      insertWithId({
        id: sub.id,
        parent_id: topic.id,
        title: sub.title,
        content: sub.content || '',
        sort_order: j
      });
      count++;
    }
  }
}

console.log(`Seeded ${count} articles.`);
