/**
 * Telegram Bot API client.
 *
 * Если задан BOT_API_URL — все вызовы Telegram идут через relay-эндпоинт на боте
 * (POST {BOT_API_URL}/telegram/relay), потому что прямой outbound от
 * панели на api.telegram.org заблокирован у российского хостера.
 * Иначе — обычный прямой вызов api.telegram.org (legacy).
 */
import { BOT_TOKEN, BOT_API_URL, BOT_API_KEY } from '../config/env.js';
import fs from 'fs';
import path from 'path';

const TG_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const RELAY_URL = BOT_API_URL ? `${BOT_API_URL.replace(/\/$/, '')}/telegram/relay` : null;

/** Низкоуровневый вызов Telegram метода. JSON-параметры для текстовых, file/files — для multipart. */
async function tgCall(method, params = {}, multipart = null) {
  if (RELAY_URL) {
    const body = { method, params };
    if (multipart?.file) body.file = multipart.file;
    if (multipart?.files) body.files = multipart.files;
    const r = await fetch(RELAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(BOT_API_KEY ? { 'X-API-Key': BOT_API_KEY } : {}),
      },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  // Legacy прямой путь
  if (multipart?.file) {
    const buf = await downloadBufferFromUrl(multipart.file.url);
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) {
      form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    const blob = new Blob([buf], { type: multipart.file.mime || 'application/octet-stream' });
    form.append(multipart.file.field || 'document', new File([blob], multipart.file.filename || 'file',
      { type: multipart.file.mime || 'application/octet-stream' }));
    const r = await fetch(`${TG_BASE}/${method}`, { method: 'POST', body: form });
    return r.json();
  }
  if (multipart?.files) {
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) {
      form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    for (const f of multipart.files) {
      const buf = await downloadBufferFromUrl(f.url);
      const blob = new Blob([buf], { type: f.mime || 'application/octet-stream' });
      form.append(f.attach || f.field || 'file',
        new File([blob], f.filename || 'file', { type: f.mime || 'application/octet-stream' }));
    }
    const r = await fetch(`${TG_BASE}/${method}`, { method: 'POST', body: form });
    return r.json();
  }
  const r = await fetch(`${TG_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return r.json();
}

async function downloadBufferFromUrl(url) {
  const r = await fetch(url);
  return Buffer.from(await r.arrayBuffer());
}

export async function tgSend(chatId, text, parseMode = 'HTML') {
  return tgCall('sendMessage', { chat_id: chatId, text, parse_mode: parseMode });
}

/**
 * Отправить медиа в Telegram.
 * Если задан BOT_API_URL — передаём S3 URL прямо боту, бот сам скачает и зальёт.
 * Иначе панель скачивает буфер и шлёт multipart напрямую.
 *
 * source: { url, filename, mimeType } — предпочитаемая форма (для relay).
 *         | { buffer, filename, mimeType } — legacy, для совместимости.
 *         | "/path/on/disk" — legacy путь к файлу.
 */
export async function tgSendMedia(chatId, source, mimeTypeOrCaption = '', caption = '') {
  let url, fileName, mimeType, fileBuffer = null;
  if (typeof source === 'string') {
    fileBuffer = fs.readFileSync(source);
    fileName = path.basename(source);
    mimeType = mimeTypeOrCaption;
  } else if (source && source.url) {
    url = source.url;
    fileName = source.filename || 'file';
    mimeType = source.mimeType || 'application/octet-stream';
    caption = mimeTypeOrCaption || caption;
  } else {
    fileBuffer = source.buffer;
    fileName = source.filename || 'file';
    mimeType = source.mimeType || 'application/octet-stream';
    caption = mimeTypeOrCaption;
  }

  let method = 'sendDocument';
  let field = 'document';
  if (mimeType.startsWith('image/'))      { method = 'sendPhoto';    field = 'photo'; }
  else if (mimeType.startsWith('video/')) { method = 'sendVideo';    field = 'video'; }
  else if (mimeType.startsWith('audio/')) { method = 'sendAudio';    field = 'audio'; }

  const params = { chat_id: String(chatId) };
  if (caption) {
    params.caption = caption;
    params.parse_mode = 'HTML';
  }

  if (url) {
    return tgCall(method, params, { file: { url, filename: fileName, mime: mimeType, field } });
  }

  // Legacy buffer path — only if relay disabled (panel→TG direct)
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  const blob = new Blob([fileBuffer], { type: mimeType });
  form.append(field, new File([blob], fileName, { type: mimeType }));
  const r = await fetch(`${TG_BASE}/${method}`, { method: 'POST', body: form });
  return r.json();
}

/**
 * Отправить media group (album).
 * items: [{ url, filename, mimeType }] (S3) — предпочтительно
 *        | [{ buffer, filename, mimeType }] — legacy
 */
export async function tgSendMediaGroup(chatId, items, caption = '') {
  const mediaArr = items.map((it, i) => {
    const attach = `file${i}`;
    let type = 'document';
    if ((it.mimeType || '').startsWith('image/')) type = 'photo';
    else if ((it.mimeType || '').startsWith('video/')) type = 'video';
    const entry = { type, media: `attach://${attach}` };
    if (i === 0 && caption) {
      entry.caption = caption;
      entry.parse_mode = 'HTML';
    }
    return entry;
  });
  const params = { chat_id: String(chatId), media: mediaArr };

  const useUrls = items.every(it => !!it.url);
  if (useUrls) {
    const files = items.map((it, i) => ({
      url: it.url, filename: it.filename || `file${i}`, mime: it.mimeType || 'application/octet-stream',
      attach: `file${i}`,
    }));
    return tgCall('sendMediaGroup', params, { files });
  }

  // Legacy buffer path
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('media', JSON.stringify(mediaArr));
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const blob = new Blob([it.buffer], { type: it.mimeType || 'application/octet-stream' });
    form.append(`file${i}`, new File([blob], it.filename || `file${i}`,
      { type: it.mimeType || 'application/octet-stream' }));
  }
  const r = await fetch(`${TG_BASE}/sendMediaGroup`, { method: 'POST', body: form });
  return r.json();
}

export async function tgSendPoll(chatId, question, options, opts = {}) {
  const params = {
    chat_id: chatId,
    question,
    options: options.map(text => ({ text })),
    is_anonymous: opts.is_anonymous === true,
  };
  if (opts.type) params.type = opts.type;
  if (opts.type === 'quiz' && opts.correct_option_id != null) {
    params.correct_option_id = opts.correct_option_id;
  }
  return tgCall('sendPoll', params);
}

// Низкоуровневый помощник на случай если кому-то нужен прямой вызов произвольного метода
export const tgRaw = tgCall;
