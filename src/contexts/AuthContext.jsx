import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { removeToken, api } from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth on load (cookie sent automatically)
  useEffect(() => {
    api.get('/api/auth/me')
      .then(r => {
        if (r.ok) return r.json();
        throw new Error('Not authenticated');
      })
      .then(data => setUser(data))
      .catch(() => {
        removeToken(); // Clean up old localStorage token if any
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const parseJsonSafe = async (res) => {
    try { return await res.json(); }
    catch { return { error: `Сервер вернул ответ не в формате JSON (HTTP ${res.status}).` }; }
  };

  const login = useCallback(async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'same-origin',
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) throw new Error(data.error || 'Ошибка авторизации');
    if (data.needsOtp) return data;
    removeToken();
    setUser(data.user);
    return data;
  }, []);

  const verifyOtp = useCallback(async (otpSession, code, trustDevice) => {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otpSession, code, trustDevice }),
      credentials: 'same-origin',
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) throw new Error(data.error || 'Неверный код');
    removeToken();
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch { /* ignore */ }
    removeToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyOtp, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
