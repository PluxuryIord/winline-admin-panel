import { useState, useEffect } from 'react';
import {
  BookOpen, Gift, Megaphone, MessageCircle, Share2, BarChart3, CalendarDays, User,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { openTelegramLink, showAlert } from '../lib/telegram.js';

// Home grid. Sections unlock phase by phase — `ready:false` tiles show «скоро».
const TILES = [
  { id: 'stats', label: 'Моя статистика', icon: BarChart3, ready: true },
  { id: 'kb', label: 'База знаний', icon: BookOpen, ready: true },
  { id: 'offer', label: 'Информация по офферу', icon: Gift, ready: true },
  { id: 'promo', label: 'Актуальные крео и лендинги', icon: Megaphone, ready: true },
  { id: 'socials', label: 'Наши соцсети', icon: Share2, ready: true },
  { id: 'calendar', label: 'Календарь спортивных событий', icon: CalendarDays, ready: true },
  { id: 'chat', label: 'Чат с менеджером', icon: MessageCircle, ready: true },
];

export default function Home({ me, navigate }) {
  const loading = me === null;
  const authorized = !!me?.authorized;
  const [chatUrl, setChatUrl] = useState(null);

  useEffect(() => {
    if (!authorized) return;
    let alive = true;
    api.get('/content/links').then((res) => {
      if (alive && res.ok) setChatUrl(res.data.chat_manager_url || null);
    });
    return () => { alive = false; };
  }, [authorized]);

  function onTile(id, ready) {
    if (!ready) { showAlert('Раздел скоро появится.'); return; }
    if (!authorized) {
      showAlert('Данный раздел доступен только для авторизованных партнёров.');
      return;
    }
    if (id === 'chat') {
      if (chatUrl) openTelegramLink(chatUrl);
      else showAlert('Ссылка на чат ещё загружается, попробуйте через пару секунд.');
      return;
    }
    navigate(id);
  }

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <div className="home-brand">WINLINE <span>PARTNERS</span></div>
          <div className="home-sub">
            {loading ? 'Загрузка…'
              : authorized ? (me.email || 'Авторизован')
              : 'Вы не авторизованы'}
          </div>
        </div>
        <button
          className="home-profile-btn"
          onClick={() => navigate(authorized ? 'profile' : 'login')}
          aria-label="Профиль"
        >
          <User size={20} />
        </button>
      </header>

      {!loading && !authorized && (
        <button className="btn btn-primary home-login-cta" onClick={() => navigate('login')}>
          Войти по email
        </button>
      )}

      <div className="home-grid">
        {TILES.map(({ id, label, icon: Icon, ready }) => {
          // Плитки всегда кликабельны: если раздел недоступен (не залогинен /
          // «скоро»), onTile покажет попап вместо перехода.
          return (
            <button
              key={id}
              className={`home-tile ${ready ? '' : 'home-tile--soon'}${ready && !authorized ? ' home-tile--locked' : ''}`}
              onClick={() => onTile(id, ready)}
            >
              <Icon size={22} />
              <span>{label}</span>
              {!ready && <em>скоро</em>}
            </button>
          );
        })}
      </div>

      {!loading && !authorized && (
        <p className="dim" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
          Разделы доступны после входа по email партнёра Winline.
        </p>
      )}
    </div>
  );
}
