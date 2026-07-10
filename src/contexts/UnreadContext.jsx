import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../utils/api';

const UnreadContext = createContext({ unreadChats: new Set(), markRead: () => {}, hasUnread: false });

export function UnreadProvider({ children }) {
  // Источник правды — сервер (общий для всех админов). Здесь только кэш для рендера.
  const [unreadChats, setUnreadChats] = useState(new Set());
  const location = useLocation();
  const locationRef = useRef(location.pathname);

  // Keep ref in sync
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  // Подтянуть актуальный список непрочитанных с сервера.
  const refreshUnread = useCallback(() => {
    api.get('/api/chats/unread')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.chatIds)) setUnreadChats(new Set(d.chatIds)); })
      .catch(() => {});
  }, []);

  // Отметить чат прочитанным: на сервере (для всех админов) + локально.
  const markRead = useCallback((chatId) => {
    setUnreadChats(prev => {
      if (!prev.has(chatId)) return prev;
      const next = new Set(prev);
      next.delete(chatId);
      return next;
    });
    api.post(`/api/chats/${chatId}/read`).catch(() => {});
  }, []);

  // Первичная загрузка с сервера.
  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // Mark chat as read when user opens it
  useEffect(() => {
    const match = location.pathname.match(/^\/chats\/(\d+)$/);
    if (match) markRead(Number(match[1]));
  }, [location.pathname, markRead]);

  // Global SSE listener with reconnection
  useEffect(() => {
    let es = null;
    let reconnectTimer = null;
    let closed = false;
    let backoff = 3000; // растёт при повторных отказах (напр. протухшая сессия)

    function connect() {
      if (closed) return;
      // Cookie-based auth — wl_token cookie is sent automatically on same-origin
      es = new EventSource('/api/chats/stream', { withCredentials: true });

      // На (пере)подключении синхронизируемся с сервером — закрывает пробел,
      // если сообщения приходили, пока соединение было разорвано.
      es.onopen = () => { backoff = 3000; refreshUnread(); };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'new_message' && data.message?.from === 'user') {
            const chatId = data.chatId;
            const currentPath = locationRef.current;
            if (currentPath === `/chats/${chatId}`) {
              // Админ сейчас смотрит этот чат — двигаем отметку прочтения на сервере.
              api.post(`/api/chats/${chatId}/read`).catch(() => {});
              return;
            }

            setUnreadChats(prev => {
              if (prev.has(chatId)) return prev;
              const next = new Set(prev);
              next.add(chatId);
              return next;
            });
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 60000); // до 60с, чтобы не долбить 401
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, [refreshUnread]);

  const hasUnread = unreadChats.size > 0;

  return (
    <UnreadContext.Provider value={{ unreadChats, markRead, hasUnread }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
