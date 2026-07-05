import { useState, useEffect, useCallback } from 'react';
import { initTelegram, setBackButton, isTelegram } from './lib/telegram.js';
import { api, setExpiredHandler } from './lib/api.js';
import Home from './sections/Home.jsx';

// Section registry. Components are added phase by phase; a section without a
// component renders the "coming soon" stub so the home grid stays complete.
const SECTIONS = {
  home: { title: 'Winline Partners', component: Home },
};

export default function App() {
  // Navigation is a simple stack: ['home'] → ['home','kb'] → back pops.
  const [stack, setStack] = useState(['home']);
  const [me, setMe] = useState(null);        // null = loading, {authorized,...}
  const [expired, setExpired] = useState(false);

  const current = stack[stack.length - 1];

  const navigate = useCallback((id) => setStack((s) => [...s, id]), []);
  const goBack = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const fetchMe = useCallback(async () => {
    const res = await api.get('/me');
    setMe(res.ok ? res.data : { authorized: false, error: res.data?.error || 'нет связи' });
  }, []);

  useEffect(() => {
    initTelegram();
    setExpiredHandler(() => setExpired(true));
    fetchMe();
  }, [fetchMe]);

  // Telegram back button mirrors the nav stack.
  useEffect(() => {
    setBackButton(stack.length > 1 ? goBack : null);
  }, [stack.length, goBack]);

  if (expired) {
    return (
      <div className="app-splash">
        <div className="app-splash-title">Сессия устарела</div>
        <div className="app-splash-text">Закройте и заново откройте приложение из Telegram.</div>
      </div>
    );
  }

  if (!isTelegram && !me) {
    return (
      <div className="app-splash">
        <div className="app-splash-title">Winline Partners</div>
        <div className="app-splash-text">Приложение открывается из Telegram-бота.</div>
      </div>
    );
  }

  const section = SECTIONS[current] || SECTIONS.home;
  const Comp = section.component;

  return (
    <div className="app">
      <Comp me={me} refreshMe={fetchMe} navigate={navigate} goBack={goBack} />
    </div>
  );
}
