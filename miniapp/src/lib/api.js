// Fetch wrapper for /api/miniapp/*. Adds Telegram initData on every request;
// in dev (outside Telegram) falls back to X-Dev-Telegram-Id so the backend's
// MINIAPP_DEV_BYPASS path can be exercised with curl/browser.

import { getInitData, isTelegram } from './telegram.js';

let onExpired = null;
export function setExpiredHandler(fn) { onExpired = fn; }

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const initData = getInitData();
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  else if (!isTelegram) {
    const devId = new URLSearchParams(location.search).get('dev_tg_id')
      || localStorage.getItem('dev_tg_id');
    if (devId) headers['X-Dev-Telegram-Id'] = devId;
  }

  const res = await fetch(`/api/miniapp${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch { /* empty/non-json */ }

  if (res.status === 401 && data.code === 'INITDATA_EXPIRED' && onExpired) {
    onExpired();
  }
  return { ok: res.ok, status: res.status, data };
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
};
