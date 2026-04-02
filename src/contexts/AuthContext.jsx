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

  const login = useCallback(async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'same-origin', // Important: receive the cookie
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка авторизации');
    removeToken(); // Clean up old localStorage token
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
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
