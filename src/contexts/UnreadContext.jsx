import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const UnreadContext = createContext({ unreadChats: new Set(), markRead: () => {}, hasUnread: false });

export function UnreadProvider({ children }) {
  const [unreadChats, setUnreadChats] = useState(() => {
    // Restore from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('wl_unread_chats') || '[]');
      return new Set(saved);
    } catch { return new Set(); }
  });
  const location = useLocation();
  const locationRef = useRef(location.pathname);

  // Keep ref in sync
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('wl_unread_chats', JSON.stringify([...unreadChats]));
  }, [unreadChats]);

  // Mark chat as read when user opens it
  useEffect(() => {
    const match = location.pathname.match(/^\/chats\/(\d+)$/);
    if (match) {
      const chatId = Number(match[1]);
      setUnreadChats(prev => {
        if (!prev.has(chatId)) return prev;
        const next = new Set(prev);
        next.delete(chatId);
        return next;
      });
    }
  }, [location.pathname]);

  // Global SSE listener with reconnection
  useEffect(() => {
    const token = localStorage.getItem('wl_admin_token');
    if (!token) return;

    let es = null;
    let reconnectTimer = null;
    let closed = false;

    function connect() {
      if (closed) return;
      const url = `/api/chats/stream?token=${token}`;
      es = new EventSource(url);

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'new_message' && data.message?.from === 'user') {
            const chatId = data.chatId;
            const currentPath = locationRef.current;
            if (currentPath === `/chats/${chatId}`) return;

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
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, []);

  const markRead = useCallback((chatId) => {
    setUnreadChats(prev => {
      if (!prev.has(chatId)) return prev;
      const next = new Set(prev);
      next.delete(chatId);
      return next;
    });
  }, []);

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
