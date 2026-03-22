// Token stored in httpOnly cookie (set by server), not accessible from JS.
// localStorage kept only as migration fallback — will be removed after first cookie login.

const TOKEN_KEY = 'wl_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  // No longer store in localStorage — cookie is set by server
  // Keep for backward compat during migration
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(url, options = {}, retries = 2) {
  const headers = { ...options.headers };

  // Fallback: if old localStorage token exists, send it (migration)
  const legacyToken = localStorage.getItem(TOKEN_KEY);
  if (legacyToken) {
    headers['Authorization'] = `Bearer ${legacyToken}`;
  }

  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers,
        credentials: 'same-origin', // Send cookies with every request
      });

      if (res.status === 401) {
        removeToken();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        throw new Error('Unauthorized');
      }

      // Retry on 502/503/504
      if (res.status >= 502 && res.status <= 504 && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (err.message === 'Unauthorized') throw err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError;
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  put: (url, body) => request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  delete: (url) => request(url, { method: 'DELETE' }),
  upload: (url, body) => request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
};
