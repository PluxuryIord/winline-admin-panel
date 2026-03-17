import { BOT_TOKEN } from '../config/env.js';
import fs from 'fs';
import path from 'path';

export async function tgSend(chatId, text, parseMode = 'HTML') {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
  return r.json();
}

/**
 * Отправить медиа-файл в Telegram.
 * @param {string|number} chatId
 * @param {string} filePath — абсолютный путь к файлу на диске
 * @param {string} mimeType — MIME-тип файла
 * @param {string} [caption] — подпись (HTML)
 * @returns {Promise<object>} ответ Telegram API
 */
export async function tgSendMedia(chatId, filePath, mimeType, caption = '') {
  let method = 'sendDocument';
  let fieldName = 'document';

  if (mimeType.startsWith('image/')) {
    method = 'sendPhoto';
    fieldName = 'photo';
  } else if (mimeType.startsWith('video/')) {
    method = 'sendVideo';
    fieldName = 'video';
  } else if (mimeType.startsWith('audio/')) {
    method = 'sendAudio';
    fieldName = 'audio';
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const blob = new Blob([fileBuffer], { type: mimeType });
  const file = new File([blob], fileName, { type: mimeType });

  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set(fieldName, file);
  if (caption) {
    form.set('caption', caption);
    form.set('parse_mode', 'HTML');
  }

  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    body: form,
  });
  return r.json();
}
