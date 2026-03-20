import { useState, useEffect, useCallback } from 'react';
import {
  QrCode, BarChart2, Settings, ExternalLink, Search,
  X, Copy, Check, Eye, Users, Gift, ScanLine, Calendar,
  ChevronLeft, ChevronRight, Trash2, RefreshCw, Info,
  ToggleLeft, ToggleRight, ChevronDown,
} from 'lucide-react';
import { api } from '../../utils/api';
import './EventWork.css';

const SECTIONS = [
  { id: 'codes', label: 'QR-коды', icon: QrCode },
  { id: 'stats', label: 'Статистика', icon: BarChart2 },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

const PAGE_SIZE = 30;

// ─── QR Codes Tab ──────────────────────────────────────────────────────────

function CodesTab() {
  const [codes, setCodes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrModal, setQrModal] = useState(null);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get(`/api/events/codes?${params}`);
      const data = await res.json();
      setCodes(data.codes || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Failed to load codes:', e);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'used' : 'active';
    try {
      await fetch(`/api/events/codes/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchCodes();
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить этот QR-код?')) return;
    try {
      await api.delete(`/api/events/codes/${id}`);
      fetchCodes();
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="ew-tab-content">
      {/* Info banner */}
      <div className="ew-info-banner">
        <Info size={16} />
        <span>Коды создаются автоматически когда пользователь нажимает «Я на мероприятии» в боте</span>
      </div>

      {/* Filters row */}
      <div className="ew-codes-filters">
        <form className="ew-search-form" onSubmit={handleSearch}>
          <Search size={16} className="ew-search-icon" />
          <input
            className="ew-search-input"
            placeholder="Поиск по коду, имени или username..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button type="button" className="ew-search-clear" onClick={() => { setSearchInput(''); setSearch(''); setPage(0); }}>
              <X size={14} />
            </button>
          )}
        </form>
        <div className="ew-status-filters">
          {[
            { value: '', label: 'Все' },
            { value: 'active', label: 'Активные' },
            { value: 'used', label: 'Использованные' },
          ].map(f => (
            <button
              key={f.value}
              className={`ew-status-btn ${statusFilter === f.value ? 'active' : ''}`}
              onClick={() => { setStatusFilter(f.value); setPage(0); }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button className="ew-refresh-btn" onClick={fetchCodes} title="Обновить">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Table */}
      <div className="ew-table-wrap">
        <table className="ew-table">
          <thead>
            <tr>
              <th>Код</th>
              <th>Пользователь</th>
              <th>Статус</th>
              <th>Создан</th>
              <th>Использован</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="ew-table-empty">Загрузка...</td></tr>
            ) : codes.length === 0 ? (
              <tr><td colSpan={6} className="ew-table-empty">Нет QR-кодов. Коды появятся когда пользователи нажмут «Я на мероприятии» в боте.</td></tr>
            ) : codes.map(c => (
              <tr key={c.id}>
                <td className="ew-td-code">{c.code}</td>
                <td>
                  <div className="ew-user-cell">
                    <span className="ew-user-name">{c.userName || c.label || '—'}</span>
                    {c.username && <span className="ew-user-username">@{c.username}</span>}
                  </div>
                </td>
                <td>
                  <span className={`ew-status-badge ${c.status}`}>
                    {c.status === 'used' ? 'Использован' : 'Активный'}
                  </span>
                </td>
                <td className="ew-td-date">
                  {c.createdAt ? new Date(c.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td className="ew-td-date">
                  {c.usedAt ? new Date(c.usedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td>
                  <div className="ew-actions-cell">
                    <button className="ew-qr-btn" onClick={() => setQrModal(c.code)} title="Показать QR">
                      <Eye size={16} />
                    </button>
                    <button
                      className={`ew-toggle-status-btn ${c.status}`}
                      onClick={() => handleToggleStatus(c.id, c.status)}
                      title={c.status === 'active' ? 'Пометить использованным' : 'Активировать'}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button className="ew-disable-btn" onClick={() => handleDelete(c.id)} title="Удалить">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ew-pagination">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={16} />
          </button>
          <span className="ew-total-label">Всего: {total}</span>
        </div>
      )}

      {/* QR Preview Modal */}
      {qrModal && (
        <div className="ew-modal-overlay" onClick={() => setQrModal(null)}>
          <div className="ew-qr-modal" onClick={e => e.stopPropagation()}>
            <button className="ew-qr-modal-close" onClick={() => setQrModal(null)}><X size={20} /></button>
            <h3>QR-код: {qrModal}</h3>
            <div className="ew-qr-image-wrap">
              <img
                src={`/api/events/codes/${encodeURIComponent(qrModal)}/qr`}
                alt={`QR ${qrModal}`}
                className="ew-qr-image"
              />
            </div>
            <p className="ew-qr-hint">Отсканируйте QR-код камерой или на странице хостес</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stats Tab ─────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'all', label: 'Всё время' },
];

function getDateRange(preset) {
  const today = new Date();
  const fmt = d => d.toISOString().slice(0, 10);
  switch (preset) {
    case 'today': return { from: fmt(today), to: fmt(today) };
    case 'week': {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return { from: fmt(w), to: fmt(today) };
    }
    case 'month': {
      const m = new Date(today);
      m.setMonth(m.getMonth() - 1);
      return { from: fmt(m), to: fmt(today) };
    }
    default: return {};
  }
}

function StatsTab() {
  const [stats, setStats] = useState(null);
  const [scans, setScans] = useState([]);
  const [preset, setPreset] = useState('all');
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const range = getDateRange(preset);
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      const [statsRes, scansRes] = await Promise.all([
        api.get(`/api/events/stats?${params}`),
        api.get('/api/events/scans?limit=20'),
      ]);
      setStats(await statsRes.json());
      const scansData = await scansRes.json();
      setScans(scansData.scans || []);
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const statCards = stats ? [
    { icon: <QrCode size={20} />, label: 'Всего кодов', value: stats.totalCodes },
    { icon: <Gift size={20} />, label: 'Активные', value: stats.activeCodes },
    { icon: <ScanLine size={20} />, label: 'Использованные', value: stats.usedCodes },
    { icon: <Calendar size={20} />, label: 'Сканирований сегодня', value: stats.scansToday },
  ] : [];

  return (
    <div className="ew-tab-content">
      <div className="ew-date-presets">
        {DATE_PRESETS.map(p => (
          <button
            key={p.key}
            className={`ew-preset-btn ${preset === p.key ? 'active' : ''}`}
            onClick={() => setPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="ew-loading">Загрузка...</div>
      ) : (
        <>
          <div className="ew-stat-cards">
            {statCards.map(s => (
              <div key={s.label} className="ew-stat-card">
                <div className="ew-stat-icon">{s.icon}</div>
                <div className="ew-stat-value">{s.value}</div>
                <div className="ew-stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {stats?.codeLimit > 0 && (
            <div className="ew-limit-bar">
              <span>Лимит кодов: {stats.totalCodes} / {stats.codeLimit}</span>
              <div className="ew-limit-progress">
                <div
                  className="ew-limit-fill"
                  style={{ width: `${Math.min(100, (stats.totalCodes / stats.codeLimit) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="ew-recent-header">
        <h3>Последние сканирования</h3>
      </div>
      <div className="ew-scans-list">
        {scans.length === 0 ? (
          <div className="ew-scans-empty">Нет сканирований</div>
        ) : scans.map(s => (
          <div key={s.id} className="ew-scan-item">
            <div className="ew-scan-avatar">
              <ScanLine size={16} />
            </div>
            <div className="ew-scan-info">
              <span className="ew-scan-name">{s.label}</span>
              <span className="ew-scan-username">{s.code}</span>
            </div>
            <div className="ew-scan-meta">
              <span className={`ew-prize-badge ${s.prizeGiven ? 'given' : ''}`}>
                {s.prizeGiven ? 'Приз выдан' : 'Без приза'}
              </span>
              <span className="ew-scan-time">
                {s.scannedAt ? new Date(s.scannedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings Tab ──────────────────────────────────────────────────────────

function SettingsTab() {
  const [eventStarts, setEventStarts] = useState(false);
  const [codeLimit, setCodeLimit] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/events/settings');
        const data = await res.json();
        setEventStarts(!!data.event_starts);
        setCodeLimit(data.code_limit ?? 0);
      } catch (e) {
        console.error('Failed to load settings:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await api.put('/api/events/toggle', { enabled: !eventStarts });
      const data = await res.json();
      if (data.ok) setEventStarts(data.event_starts);
    } catch (e) {
      alert('Ошибка: ' + e.message);
    } finally {
      setToggling(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/api/events/settings', { code_limit: Number(codeLimit) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="ew-loading">Загрузка...</div>;

  return (
    <div className="ew-tab-content">
      {/* Event toggle */}
      <div className="ew-settings-section">
        <h3>Мероприятие</h3>
        <div className="ew-toggle-row">
          <div className="ew-toggle-info">
            <span className="ew-toggle-label">Мероприятие активно</span>
            <span className="ew-toggle-desc">
              Когда включено, пользователи видят кнопку «Я на мероприятии» в боте и могут получить QR-код
            </span>
          </div>
          <button
            className={`ew-toggle-switch ${eventStarts ? 'on' : ''}`}
            onClick={handleToggle}
            disabled={toggling}
          >
            {eventStarts ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </button>
        </div>
      </div>

      {/* Code limit */}
      <div className="ew-settings-section">
        <h3>Лимит QR-кодов</h3>
        <p className="ew-settings-desc">
          Максимальное количество QR-кодов на мероприятие. Когда лимит достигнут, новые коды не генерируются.
          Установите 0 для безлимита.
        </p>
        <div className="ew-settings-row">
          <input
            type="number"
            className="ew-settings-input"
            value={codeLimit}
            onChange={e => setCodeLimit(e.target.value)}
            min={0}
          />
          <button
            className={`ew-save-btn ${saved ? 'saved' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saved ? <><Check size={16} /> Сохранено</> : saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Reset all codes */}
      <div className="ew-settings-section ew-danger-section">
        <h3>Сброс кодов</h3>
        <p className="ew-settings-desc">
          Удалить все QR-коды и историю сканирований. Используйте при начале нового мероприятия.
          Это действие необратимо.
        </p>
        <button
          className="ew-reset-btn"
          onClick={async () => {
            if (!confirm('Вы уверены? Все QR-коды и сканирования будут удалены. Это необратимо!')) return;
            try {
              const res = await api.delete('/api/events/codes/all');
              const data = await res.json();
              if (data.ok) alert(`Удалено ${data.deleted} кодов. Можно начинать новое мероприятие.`);
            } catch (e) {
              alert('Ошибка: ' + e.message);
            }
          }}
        >
          <Trash2 size={16} /> Сбросить все коды
        </button>
      </div>

      <HostessSection />
    </div>
  );
}

// ─── Hostess Section ───────────────────────────────────────────────────────

function HostessSection() {
  const [copied, setCopied] = useState(false);
  const hostessUrl = `${window.location.origin}/hostess`;

  const handleCopy = () => {
    navigator.clipboard.writeText(hostessUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ew-hostess-card">
      <div className="ew-hostess-left">
        <div className="ew-hostess-badge">Веб-страница</div>
        <h2>Страница для хостес</h2>
        <p>
          Откройте страницу на планшете или ноутбуке хостес прямо на мероприятии.
          Сканирование QR-кодов гостей, выдача призов и счётчик — всё в одном окне.
        </p>
        <div className="ew-hostess-actions">
          <a href="/hostess" target="_blank" rel="noopener noreferrer" className="ew-hostess-open-btn">
            <ExternalLink size={18} /> Открыть страницу
          </a>
          <button className="ew-hostess-copy-btn" onClick={handleCopy}>
            {copied ? <><Check size={16} /> Скопировано</> : <><Copy size={16} /> Скопировать ссылку</>}
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
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function EventWork() {
  const [openSection, setOpenSection] = useState('codes');
  const [mounted, setMounted] = useState({ codes: true });

  const toggleSection = (id) => {
    setOpenSection(prev => prev === id ? null : id);
    setMounted(prev => ({ ...prev, [id]: true }));
  };

  return (
    <div className="ew-container">
      <div className="ew-header">
        <h1>Работа на ивенте</h1>
        <p>QR-коды, сканирования, статистика и настройки мероприятий</p>
      </div>

      {SECTIONS.map(s => {
        const Icon = s.icon;
        const isOpen = openSection === s.id;
        return (
          <div key={s.id} className={`ew-accordion ${isOpen ? 'open' : ''}`}>
            <button className="ew-accordion-header" onClick={() => toggleSection(s.id)}>
              <Icon size={18} />
              <span className="ew-accordion-label">{s.label}</span>
              <ChevronDown size={18} className={`ew-accordion-chevron ${isOpen ? 'open' : ''}`} />
            </button>
            <div className="ew-accordion-body-wrap">
              <div className="ew-accordion-body">
                <div className="ew-accordion-body-inner">
                  {mounted[s.id] && (
                    <>
                      {s.id === 'codes' && <CodesTab />}
                      {s.id === 'stats' && <StatsTab />}
                      {s.id === 'settings' && <SettingsTab />}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
