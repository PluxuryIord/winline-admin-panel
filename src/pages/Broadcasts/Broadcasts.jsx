import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, BarChart2, Trophy, HelpCircle, Trash2, Edit3 } from 'lucide-react';
import './Broadcasts.css';

const TYPE_LABELS = {
  post: 'Пост',
  poll: 'Опрос',
  contest: 'Конкурс',
  quiz: 'Викторина',
};

const TYPE_ICONS = {
  post: FileText,
  poll: BarChart2,
  contest: Trophy,
  quiz: HelpCircle,
};

const STATUS_LABELS = {
  published: 'Опубликована',
  draft: 'Черновик',
  scheduled: 'Запланирована',
};

const MOCK_BOTS = ['Все боты', 'Winline Partners Bot', 'Winline Sport Bot', 'Winline VIP Bot'];
const MOCK_CHANNELS = ['Все каналы', '#winline_news', '#winline_sport', '#winline_vip', '#winline_promo'];

const MOCK_BROADCASTS = [
  { id: 1, title: 'Новогодняя акция — зарабатывай вместе!', type: 'post', status: 'published', bot: 'Winline Partners Bot', channel: '#winline_news', date: '2025-12-31', audience: 4200 },
  { id: 2, title: 'Опрос: любимый вид спорта', type: 'poll', status: 'published', bot: 'Winline Sport Bot', channel: '#winline_sport', date: '2025-01-15', audience: 1850 },
  { id: 3, title: 'Конкурс — выиграй мерч Winline', type: 'contest', status: 'scheduled', bot: 'Winline Partners Bot', channel: '#winline_promo', date: '2025-02-10', audience: 3100 },
  { id: 4, title: 'Викторина: чемпионы мира по футболу', type: 'quiz', status: 'draft', bot: 'Winline Sport Bot', channel: '#winline_sport', date: '2025-01-28', audience: 0 },
  { id: 5, title: 'VIP-предложение для партнёров', type: 'post', status: 'published', bot: 'Winline VIP Bot', channel: '#winline_vip', date: '2025-01-05', audience: 720 },
  { id: 6, title: 'Обновление реферальной программы', type: 'post', status: 'draft', bot: 'Winline Partners Bot', channel: '#winline_news', date: '2025-02-20', audience: 0 },
  { id: 7, title: 'Опрос о качестве сервиса', type: 'poll', status: 'scheduled', bot: 'Winline VIP Bot', channel: '#winline_vip', date: '2025-03-01', audience: 0 },
];

export default function Broadcasts() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterBot, setFilterBot] = useState('Все боты');
  const [filterChannel, setFilterChannel] = useState('Все каналы');
  const [broadcasts, setBroadcasts] = useState(MOCK_BROADCASTS);

  const filtered = useMemo(() => {
    return broadcasts.filter(b => {
      const matchSearch = b.title.toLowerCase().includes(search.toLowerCase());
      const matchBot = filterBot === 'Все боты' || b.bot === filterBot;
      const matchChannel = filterChannel === 'Все каналы' || b.channel === filterChannel;
      return matchSearch && matchBot && matchChannel;
    });
  }, [broadcasts, search, filterBot, filterChannel]);

  const handleDelete = (id) => {
    setBroadcasts(prev => prev.filter(b => b.id !== id));
  };

  return (
    <div className="broadcasts-container">
      {/* Фильтры */}
      <div className="broadcasts-controls">
        <div className="bc-search-box">
          <Search size={16} className="bc-search-icon" />
          <input
            className="bc-search-input"
            type="text"
            placeholder="Поиск по названию..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="bc-filters">
          <select
            className="bc-filter-select"
            value={filterBot}
            onChange={e => setFilterBot(e.target.value)}
          >
            {MOCK_BOTS.map(b => <option key={b}>{b}</option>)}
          </select>
          <select
            className="bc-filter-select"
            value={filterChannel}
            onChange={e => setFilterChannel(e.target.value)}
          >
            {MOCK_CHANNELS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Таблица */}
      <div className="broadcasts-table-wrap">
        <table className="broadcasts-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Канал</th>
              <th>Дата</th>
              <th>Аудитория</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="broadcasts-empty">Рассылок не найдено</td>
              </tr>
            ) : filtered.map(b => {
              const Icon = TYPE_ICONS[b.type];
              return (
                <tr key={b.id} className="broadcasts-row">
                  <td className="bc-title-cell">
                    <Icon size={15} className="bc-type-icon" />
                    <span>{b.title}</span>
                  </td>
                  <td>{TYPE_LABELS[b.type]}</td>
                  <td>
                    <span className={`bc-status bc-status--${b.status}`}>
                      {STATUS_LABELS[b.status]}
                    </span>
                  </td>
                  <td className="bc-channel">{b.channel}</td>
                  <td className="bc-date">{new Date(b.date).toLocaleDateString('ru-RU')}</td>
                  <td className="bc-audience">{b.audience > 0 ? b.audience.toLocaleString('ru-RU') : '—'}</td>
                  <td className="bc-actions">
                    <button
                      className="bc-action-btn bc-action-edit"
                      title="Редактировать"
                      onClick={() => navigate(`/mailings/editor/${b.type}`)}
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      className="bc-action-btn bc-action-delete"
                      title="Удалить"
                      onClick={() => handleDelete(b.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Кнопка создать */}
      <div className="broadcasts-footer">
        <button className="broadcasts-create-btn" onClick={() => navigate('/mailings/new')}>
          <Plus size={18} />
          Создать рассылку
        </button>
      </div>
    </div>
  );
}
