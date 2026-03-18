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
 * @param {string|object} source — путь к файлу (string) ИЛИ { buffer, filename, mimeType }
 * @param {string} [mimeTypeOrCaption] — MIME (если source строка) или caption (если source объект)
 * @param {string} [caption] — подпись (HTML)
 * @returns {Promise<object>} ответ Telegram API
 */
export async function tgSendMedia(chatId, source, mimeTypeOrCaption = '', caption = '') {
  let fileBuffer, fileName, mimeType;

  if (typeof source === 'string') {
    // Legacy: file path on disk
    fileBuffer = fs.readFileSync(source);
    fileName = path.basename(source);
    mimeType = mimeTypeOrCaption;
  } else {
    // New: { buffer, filename, mimeType }
    fileBuffer = source.buffer;
    fileName = source.filename || 'file';
    mimeType = source.mimeType || 'application/octet-stream';
    caption = mimeTypeOrCaption; // second arg is caption in this case
  }

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

/**
 * Отправить альбом (media group) в Telegram.
 * @param {string|number} chatId
 * @param {Array<{buffer: Buffer, filename: string, mimeType: string}>} items
 * @param {string} [caption] — подпись к первому элементу
 * @returns {Promise<object>} ответ Telegram API
 */
export async function tgSendMediaGroup(chatId, items, caption = '') {
  const form = new FormData();
  form.set('chat_id', String(chatId));

  const mediaArr = items.map((item, i) => {
    const attachName = `file${i}`;
    const blob = new Blob([item.buffer], { type: item.mimeType });
    const file = new File([blob], item.filename, { type: item.mimeType });
    form.set(attachName, file);

    let type = 'document';
    if (item.mimeType.startsWith('image/')) type = 'photo';
    else if (item.mimeType.startsWith('video/')) type = 'video';

    const entry = { type, media: `attach://${attachName}` };
    if (i === 0 && caption) {
      entry.caption = caption;
      entry.parse_mode = 'HTML';
    }
    return entry;
  });

  form.set('media', JSON.stringify(mediaArr));

  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`, {
    method: 'POST',
    body: form,
  });
  return r.json();
}

/**
 * Отправить нативный опрос/викторину в Telegram.
 * @param {string|number} chatId
 * @param {string} question — вопрос (1-300 символов)
 * @param {string[]} options — варианты ответов (2-10 штук)
 * @param {object} [opts] — доп. параметры
 * @param {string} [opts.type] — 'regular' (опрос) или 'quiz' (викторина)
 * @param {number} [opts.correct_option_id] — индекс правильного ответа (для quiz)
 * @param {boolean} [opts.is_anonymous] — анонимный (по умолчанию true)
 * @returns {Promise<object>} ответ Telegram API
 */
export async function tgSendPoll(chatId, question, options, opts = {}) {
  const body = {
    chat_id: chatId,
    question,
    options: options.map(text => ({ text })),
    is_anonymous: opts.is_anonymous !== false,
  };
  if (opts.type) body.type = opts.type;
  if (opts.type === 'quiz' && opts.correct_option_id != null) {
    body.correct_option_id = opts.correct_option_id;
  }

  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPoll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}
