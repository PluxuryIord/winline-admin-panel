import { useEffect, useState, useCallback, useRef } from 'react';
import { Trophy, RefreshCw, Search } from 'lucide-react';
import { api } from '../../utils/api';

const EVENT_ID = 0;

export default function RaffleV2() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const ref = useRef('');

  const fetchTickets = useCallback(async () => {
    try {
      const res = await api.get(`/api/raffles/v2/list?event_id=${EVENT_ID}`);
      const data = await res.json();
      const list = data.tickets || [];
      const hash = JSON.stringify(list);
      if (hash !== ref.current) {
        ref.current = hash;
        setTickets(list);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    const i = setInterval(fetchTickets, 5000);
    return () => clearInterval(i);
  }, [fetchTickets]);

  const filtered = tickets.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (t.ticket_code || '').toLowerCase().includes(s) ||
      String(t.ticket_number).includes(s) ||
      (t.email || '').toLowerCase().includes(s) ||
      (t.full_name || '').toLowerCase().includes(s) ||
      (t.rl_full_name || '').toLowerCase().includes(s) ||
      (t.username || '').toLowerCase().includes(s) ||
      String(t.telegram_id).includes(s)
    );
  });

  const winners = tickets.filter(t => t.is_winner).length;

  return (
    <div className="ew-container">
      <div className="ew-header">
        <div className="ew-header-left">
          <div className="ew-header-title-row">
            <h1>Розыгрыши</h1>
          </div>
          <p>Билеты участников розыгрыша мячей (сценарий 3)</p>
        </div>
        <div className="ew-header-actions">
          <button className="ew-settings-btn" onClick={fetchTickets}>
            <RefreshCw size={16} /> Обновить
          </button>
        </div>
      </div>

      <div className="ew-stats-bar">
        <div className="ew-mini-stat">
          <div className="ew-mini-stat-icon"><Trophy size={18} /></div>
          <div className="ew-mini-stat-info">
            <span className="ew-mini-stat-value">{tickets.length}</span>
            <span className="ew-mini-stat-label">Всего билетов</span>
          </div>
        </div>
        <div className="ew-mini-stat">
          <div className="ew-mini-stat-icon"><Trophy size={18} /></div>
          <div className="ew-mini-stat-info">
            <span className="ew-mini-stat-value">{winners}</span>
            <span className="ew-mini-stat-label">Победителей</span>
          </div>
        </div>
      </div>

      <div className="ew-filters" style={{ margin: '12px 0' }}>
        <div className="ew-search-form" style={{ display: 'flex', gap: 8 }}>
          <Search size={16} style={{ alignSelf: 'center', opacity: 0.6 }} />
          <input
            type="text"
            placeholder="Поиск по коду, имени, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ew-settings-input"
            style={{ flex: 1 }}
          />
        </div>
      </div>

      <div className="ew-table-wrap">
        <table className="ew-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Ticket code</th>
              <th>Пользователь</th>
              <th>Email</th>
              <th>Создан</th>
              <th>Победитель</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="ew-table-empty">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="ew-table-empty">Билетов пока нет.</td></tr>
            ) : filtered.map(t => (
              <tr key={t.id}>
                <td>{t.ticket_number}</td>
                <td className="ew-td-code">{t.ticket_code ? `EVT-${t.ticket_code}` : '—'}</td>
                <td>
                  <div className="ew-user-cell">
                    <span className="ew-user-name">{t.rl_full_name || t.full_name || t.telegram_id}</span>
                    {t.username && <span className="ew-user-username">@{t.username}</span>}
                  </div>
                </td>
                <td>{t.email}</td>
                <td className="ew-td-date">{t.created_at ? new Date(t.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td>{t.is_winner ? <span className="ew-status-badge used">🏆 Победитель</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
