// Auth is handled entirely via httpOnly cookie 'wl_token' set by the server.
// No tokens are stored in localStorage.

// Legacy cleanup — remove old localStorage token if present (one-time migration)
const LEGACY_KEY = 'wl_admin_token';
if (localStorage.getItem(LEGACY_KEY)) {
  localStorage.removeItem(LEGACY_KEY);
}
if (localStorage.getItem('token')) {
  localStorage.removeItem('token');
}

// Kept for backward-compat in imports but now a no-op
export function getToken() { return null; }
export function setToken() {}
export function removeToken() {}

async function request(url, options = {}) {
  const headers = { ...options.headers };

  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin', // Send httpOnly cookie with every request
  });

  if (res.status === 401) {
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/hostess')) {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  return res;
}

/**
 * Upload a file via FormData (no Content-Type header — browser sets boundary).
 * Uses same httpOnly cookie auth.
 */
export async function fetchWithAuth(url, options = {}) {
  return request(url, options);
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
};
