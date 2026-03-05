import { ExternalLink, QrCode, BarChart2, Lock, Users, ClipboardList } from 'lucide-react';
import './EventWork.css';

const features = [
  {
    icon: <QrCode size={22} />,
    title: 'Генерация QR-кодов',
    desc: 'Создание и стилизация QR-кодов для мероприятий. Статистика сканирований по каждому коду.',
  },
  {
    icon: <Lock size={22} />,
    title: 'Лимит выдачи призов',
    desc: 'Ограничение количества генерируемых QR для получения призов на одного пользователя.',
  },
  {
    icon: <BarChart2 size={22} />,
    title: 'Статистика ивентов',
    desc: 'Аналитика по мероприятиям и датам: количество участников, сканирований, выданных призов.',
  },
  {
    icon: <ClipboardList size={22} />,
    title: 'Анкеты пользователей',
    desc: 'Просмотр анкет участников с фильтрацией по мероприятию, дате, статусу.',
  },
];

export default function EventWork() {
  const hostessUrl = `${window.location.origin}/hostess`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(hostessUrl);
  };

  return (
    <div className="ew-container">

      {/* Заголовок */}
      <div className="ew-header">
        <h1>Работа на ивенте</h1>
        <p>Инструменты для управления мероприятиями, QR-кодами и работы хостес на месте</p>
      </div>

      {/* Карточки функционала */}
      <div className="ew-features-grid">
        {features.map(f => (
          <div key={f.title} className="ew-feature-card">
            <div className="ew-feature-icon">{f.icon}</div>
            <div>
              <div className="ew-feature-title">{f.title}</div>
              <div className="ew-feature-desc">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Главный блок — ссылка для хостес */}
      <div className="ew-hostess-card">
        <div className="ew-hostess-left">
          <div className="ew-hostess-badge">Веб-страница</div>
          <h2>Страница для хостес</h2>
          <p>
            Откройте страницу на планшете или ноутбуке хостес прямо на мероприятии.
            Сканирование QR-кодов гостей, выдача призов и счётчик — всё в одном окне.
            Адаптирована под мобильный и ПК формат.
          </p>
          <div className="ew-hostess-actions">
            <a
              href="/hostess"
              target="_blank"
              rel="noopener noreferrer"
              className="ew-hostess-open-btn"
            >
              <ExternalLink size={18} /> Открыть страницу
            </a>
            <button className="ew-hostess-copy-btn" onClick={handleCopyLink}>
              Скопировать ссылку
            </button>
          </div>
          <div className="ew-hostess-url">{hostessUrl}</div>
        </div>
        <div className="ew-hostess-preview">
          <div className="ew-preview-phone">
            <div className="ew-preview-screen">
              <div className="ew-preview-logo">
                <span>Winline</span>
                <span className="ew-preview-circle" />
              </div>
              <div className="ew-preview-subtitle">PARTNERS</div>
              <div className="ew-preview-input">Отсканируйте QR код</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
