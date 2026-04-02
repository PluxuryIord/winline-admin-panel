#!/usr/bin/env node
/**
 * Одноразовая миграция данных из JSON-файлов в MySQL.
 * Запуск: node server/migrations/migrate-data.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbPool from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

function readJSON(name) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

async function run() {
  if (!dbPool) {
    console.error('[migrate-data] MySQL не настроен');
    process.exit(1);
  }

  try {
    // 1. Tags
    const tags = readJSON('tags.json');
    if (tags && typeof tags === 'object') {
      let count = 0;
      for (const [userId, tagList] of Object.entries(tags)) {
        if (!Array.isArray(tagList)) continue;
        for (const tag of tagList) {
          try {
            await dbPool.query(
              'INSERT IGNORE INTO wl_admin_user_tags (user_id, tag) VALUES (?, ?)',
              [Number(userId), tag]
            );
            count++;
          } catch (e) { /* ignore duplicates */ }
        }
      }
      console.log(`[tags] ✓ Мигрировано ${count} тегов`);
    } else {
      console.log('[tags] Файл не найден или пуст, пропускаем');
    }

    // 2. Chats
    const chats = readJSON('chats.json');
    if (Array.isArray(chats) && chats.length) {
      let chatCount = 0, msgCount = 0;
      for (const chat of chats) {
        const [result] = await dbPool.query(
          'INSERT INTO wl_admin_chats (user_id) VALUES (?)',
          [chat.userId]
        );
        chatCount++;
        for (const msg of (chat.messages || [])) {
          await dbPool.query(
            'INSERT INTO wl_admin_chat_messages (chat_id, sender, text, created_at) VALUES (?, ?, ?, ?)',
            [result.insertId, msg.from, msg.text, new Date(msg.time)]
          );
          msgCount++;
        }
      }
      console.log(`[chats] ✓ Мигрировано ${chatCount} чатов, ${msgCount} сообщений`);
    } else {
      console.log('[chats] Пусто, пропускаем');
    }

    // 3. Knowledge
    const knowledge = readJSON('knowledge.json');
    if (Array.isArray(knowledge) && knowledge.length) {
      let count = 0;
      for (const topic of knowledge) {
        const [result] = await dbPool.query(
          'INSERT INTO wl_admin_knowledge (title, content, parent_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)',
          [topic.title, topic.content || '', new Date(topic.created_at || Date.now()), new Date(topic.updated_at || Date.now())]
        );
        count++;
        for (const sub of (topic.subtopics || [])) {
          await dbPool.query(
            'INSERT INTO wl_admin_knowledge (title, content, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [sub.title, sub.content || '', result.insertId, new Date(sub.created_at || Date.now()), new Date(sub.updated_at || Date.now())]
          );
          count++;
        }
      }
      console.log(`[knowledge] ✓ Мигрировано ${count} статей`);
    } else {
      console.log('[knowledge] Пусто, пропускаем');
    }

    // 4. Channels
    const channels = readJSON('channels.json');
    if (Array.isArray(channels) && channels.length) {
      for (const ch of channels) {
        await dbPool.query(
          'INSERT IGNORE INTO wl_admin_channels (chat_id, title, added_at) VALUES (?, ?, ?)',
          [String(ch.chatId), ch.title, new Date(ch.addedAt || Date.now())]
        );
      }
      console.log(`[channels] ✓ Мигрировано ${channels.length} каналов`);
    } else {
      console.log('[channels] Пусто, пропускаем');
    }

    // 5. Groups
    const groups = readJSON('groups.json');
    if (Array.isArray(groups) && groups.length) {
      for (const g of groups) {
        await dbPool.query(
          'INSERT IGNORE INTO wl_admin_groups (chat_id, title, added_at) VALUES (?, ?, ?)',
          [String(g.chatId), g.title, new Date(g.addedAt || Date.now())]
        );
      }
      console.log(`[groups] ✓ Мигрировано ${groups.length} групп`);
    } else {
      console.log('[groups] Пусто, пропускаем');
    }

    // 6. Broadcasts
    const broadcasts = readJSON('broadcasts.json');
    if (Array.isArray(broadcasts) && broadcasts.length) {
      for (const b of broadcasts) {
        await dbPool.query(
          `INSERT INTO wl_admin_broadcasts (text, type, channels_json, channel_ids_json, total, success, failed, results_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            (b.text || '').substring(0, 500),
            b.type || 'channels',
            JSON.stringify(b.channels || []),
            JSON.stringify(b.channelIds || []),
            b.total || 0,
            b.success || 0,
            b.failed || 0,
            JSON.stringify(b.results || []),
            b.status || 'failed',
            new Date(b.date || Date.now()),
          ]
        );
      }
      console.log(`[broadcasts] ✓ Мигрировано ${broadcasts.length} рассылок`);
    } else {
      console.log('[broadcasts] Пусто, пропускаем');
    }

    console.log('\n[migrate-data] ✓ Миграция данных завершена!');
  } catch (err) {
    console.error('[migrate-data] Ошибка:', err.message);
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

run();
