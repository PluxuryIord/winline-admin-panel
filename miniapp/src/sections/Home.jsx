import {
  BookOpen, Gift, Megaphone, MessageCircle, Share2, BarChart3, CalendarDays, User,
} from 'lucide-react';

// Home grid. Sections unlock phase by phase — `ready:false` tiles show «скоро».
const TILES = [
  { id: 'stats', label: 'Моя статистика', icon: BarChart3, ready: false, needsAuth: true },
  { id: 'kb', label: 'База знаний', icon: BookOpen, ready: false, needsAuth: true },
  { id: 'offer', label: 'Офферы', icon: Gift, ready: false, needsAuth: true },
  { id: 'promo', label: 'Промо и ссылки', icon: Megaphone, ready: false, needsAuth: true },
  { id: 'socials', label: 'Соцсети', icon: Share2, ready: false, needsAuth: true },
  { id: 'calendar', label: 'Календарь', icon: CalendarDays, ready: false, needsAuth: true },
  { id: 'chat', label: 'Чат с менеджером', icon: MessageCircle, ready: false, needsAuth: true },
];

export default function Home({ me, navigate }) {
  const loading = me === null;
  const authorized = !!me?.authorized;

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
        {TILES.map(({ id, label, icon: Icon, ready }) => (
          <button
            key={id}
            className={`home-tile ${ready ? '' : 'home-tile--soon'}`}
            onClick={() => ready && navigate(id)}
            disabled={!ready}
          >
            <Icon size={22} />
            <span>{label}</span>
            {!ready && <em>скоро</em>}
          </button>
        ))}
      </div>
    </div>
  );
}
