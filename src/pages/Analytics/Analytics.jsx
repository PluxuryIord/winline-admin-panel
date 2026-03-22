import { useState, useEffect, useRef } from 'react';
import {
  Calendar, RefreshCw, Download, ChevronDown,
  Users, UserCheck, UserPlus, MessageCircle, Ban, Share2, FileText, BarChart2, FolderOpen,
} from 'lucide-react';
import './Analytics.css';

const PERIOD_MAP = {
  'За всё время': 'all',
  'Сегодня': 'today',
  'За 24 часа': '24h',
  'За неделю': 'week',
  'За месяц': 'month',
  'За год': 'year',
};

const emptyStats = { totalUsers: 0, partners: 0, guests: 0, blocked: 0, requests: 0, newUsers: 0, channels: 0, groups: 0, posts: 0 };

async function fetchStats(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/analytics?${qs}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function Analytics() {
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('За месяц');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState(emptyStats);
  const [error, setError] = useState(null);

  // Custom date range
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isCustomRange, setIsCustomRange] = useState(false);

  const periods = ["За всё время", "Сегодня", "За 24 часа", "За неделю", "За месяц", "За год"];

  const loadData = async (opts) => {
    setIsGenerating(true);
    setError(null);
    try {
      const params = {};
      if (opts?.from && opts?.to) {
        params.from = opts.from;
        params.to = opts.to;
      } else {
        params.period = PERIOD_MAP[opts?.period || selectedPeriod] || 'month';
      }
      const data = await fetchStats(params);
      setStats(data);
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => { loadData({ period: selectedPeriod }); }, []);

  const handlePeriodSelect = (period) => {
    setSelectedPeriod(period);
    setIsCustomRange(false);
    setDateFrom('');
    setDateTo('');
    setIsPeriodOpen(false);
    loadData({ period });
  };

  const handleCustomRange = () => {
    setIsPeriodOpen(false);
    setIsCustomRange(true);
    setSelectedPeriod('Произвольный период');
  };

  const handleApplyRange = () => {
    if (!dateFrom || !dateTo) return;
    loadData({ from: dateFrom, to: dateTo });
  };

  const handleGenerate = () => {
    if (isCustomRange && dateFrom && dateTo) {
      loadData({ from: dateFrom, to: dateTo });
    } else {
      loadData({ period: selectedPeriod });
    }
  };

  const triggerDownload = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateSuffix = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const conversionRatio = stats.totalUsers > 0 ? ((stats.partners / stats.totalUsers) * 100).toFixed(1) : '0.0';

  const periodLabel = isCustomRange && dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString('ru-RU')} — ${new Date(dateTo).toLocaleDateString('ru-RU')}`
    : selectedPeriod;

  const handleExportExcel = () => {
    const rows = [
      ['Отчёт по аналитике'],
      ['Период', periodLabel],
      ['Дата формирования', new Date().toLocaleDateString('ru-RU')],
      [],
      ['Аудитория бота'],
      ['Всего пользователей', stats.totalUsers],
      ['Партнёры', stats.partners],
      ['Гости', stats.guests],
      ['Конверсия в партнёра', `${conversionRatio}%`],
      [],
      ['Активность и вовлечённость'],
      ['Обращений к боту', stats.requests],
      ['Заблокировали бота', stats.blocked],
      ['Новых пользователей', stats.newUsers],
      [],
      ['Контент'],
      ['Подключённых каналов', stats.channels],
      ['Подключённых групп', stats.groups],
      ['Рассылок отправлено', stats.posts],
    ];
    const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\n');
    triggerDownload(csv, `analytics_${dateSuffix()}.csv`, 'text/csv;charset=utf-8;');
    setIsExportOpen(false);
  };

  const handleExportTxt = () => {
    const sep = '─'.repeat(42);
    const lines = [
      'ОТЧЁТ ПО АНАЛИТИКЕ',
      `Период: ${periodLabel}`,
      `Дата:   ${new Date().toLocaleDateString('ru-RU')}`,
      sep,
      'АУДИТОРИЯ БОТА',
      `Всего пользователей:   ${stats.totalUsers.toLocaleString('ru-RU')}`,
      `Партнёры:              ${stats.partners.toLocaleString('ru-RU')}`,
      `Гости:                 ${stats.guests.toLocaleString('ru-RU')}`,
      `Конверсия в партнёра:  ${conversionRatio}%`,
      sep,
      'АКТИВНОСТЬ И ВОВЛЕЧЁННОСТЬ',
      `Обращений к боту:      ${stats.requests.toLocaleString('ru-RU')}`,
      `Заблокировали бота:    ${stats.blocked.toLocaleString('ru-RU')}`,
      `Новых пользователей:   +${stats.newUsers.toLocaleString('ru-RU')}`,
      sep,
      'КОНТЕНТ',
      `Подключённых каналов:  ${stats.channels}`,
      `Подключённых групп:    ${stats.groups}`,
      `Рассылок отправлено:   ${stats.posts}`,
    ];
    triggerDownload(lines.join('\n'), `analytics_${dateSuffix()}.txt`, 'text/plain;charset=utf-8;');
    setIsExportOpen(false);
  };

  return (
    <div className="analytics-container">

      {/* 1. БЛОК УПРАВЛЕНИЯ */}
      <div className="analytics-controls">

        <div className="control-wrapper">
          <button className="btn-control" onClick={() => { setIsPeriodOpen(!isPeriodOpen); setIsExportOpen(false); }}>
            <Calendar size={18} />
            {isCustomRange ? 'Произвольный' : selectedPeriod}
            <ChevronDown size={16} />
          </button>

          {isPeriodOpen && (
            <div className="dropdown-menu">
              {periods.map(period => (
                <button
                  key={period}
                  className={`dropdown-item ${selectedPeriod === period && !isCustomRange ? 'active' : ''}`}
                  onClick={() => handlePeriodSelect(period)}
                >
                  {period}
                </button>
              ))}
              <div className="dropdown-separator" />
              <button
                className={`dropdown-item ${isCustomRange ? 'active' : ''}`}
                onClick={handleCustomRange}
              >
                <Calendar size={14} style={{ marginRight: 8 }} />
                Выбрать даты...
              </button>
            </div>
          )}
        </div>

        {isCustomRange && (
          <div className="date-range-picker">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="date-input" />
            <span className="date-sep">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="date-input" />
          </div>
        )}

        <button className="btn-control primary" onClick={handleGenerate} disabled={isGenerating}>
          <RefreshCw size={18} className={isGenerating ? 'spin' : ''} />
          Сформировать
        </button>

        <div className="control-wrapper" style={{ marginLeft: 'auto' }}>
          <button className="btn-control" onClick={() => { setIsExportOpen(!isExportOpen); setIsPeriodOpen(false); }}>
            <Download size={18} />
            Экспорт
            <ChevronDown size={16} />
          </button>

          {isExportOpen && (
            <div className="dropdown-menu" style={{ right: 0, left: 'auto', minWidth: '150px' }}>
              <button className="dropdown-item" onClick={handleExportExcel}>в Excel (.csv)</button>
              <button className="dropdown-item" onClick={handleExportTxt}>в Текст (.txt)</button>
            </div>
          )}
        </div>
      </div>

      {/* Метка активного периода */}
      <div className="analytics-period-label">
        Данные: <span>{periodLabel}</span>
      </div>

      {error && <div className="analytics-error">Ошибка загрузки: {error}</div>}

      {/* 2. АУДИТОРИЯ */}
      <h3 className="section-title">Аудитория бота</h3>
      <div className="metrics-grid">
        <div className="metric-card" style={{ borderColor: 'rgba(255, 126, 0, 0.4)' }}>
          <div className="metric-header">
            <div className="metric-icon"><Users size={20} /></div>
            Всего пользователей в боте
          </div>
          <div className="metric-value">{stats.totalUsers.toLocaleString('ru-RU')}</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon"><UserCheck size={20} /></div>
            Количество партнёров
          </div>
          <div className="metric-value">{stats.partners.toLocaleString('ru-RU')}</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon"><UserPlus size={20} /></div>
            Количество гостей
          </div>
          <div className="metric-value">{stats.guests.toLocaleString('ru-RU')}</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon"><BarChart2 size={20} /></div>
            Конверсия в партнёра
          </div>
          <div className="metric-value">{conversionRatio}%</div>
        </div>
      </div>

      {/* 3. АКТИВНОСТЬ */}
      <h3 className="section-title">Активность и вовлеченность</h3>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon"><MessageCircle size={20} /></div>
            Обращений к боту
          </div>
          <div className="metric-value">{stats.requests.toLocaleString('ru-RU')}</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon" style={{ color: '#ff4444' }}><Ban size={20} /></div>
            Заблокировали бота
          </div>
          <div className="metric-value">{stats.blocked.toLocaleString('ru-RU')}</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon"><UserPlus size={20} /></div>
            Новых пользователей
          </div>
          <div className="metric-value">+{stats.newUsers.toLocaleString('ru-RU')}</div>
        </div>
      </div>

      {/* 4. КОНТЕНТ */}
      <h3 className="section-title">Контент</h3>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon"><Share2 size={20} /></div>
            Подключенных каналов
          </div>
          <div className="metric-value">{stats.channels}</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon"><FolderOpen size={20} /></div>
            Подключенных групп
          </div>
          <div className="metric-value">{stats.groups}</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon"><FileText size={20} /></div>
            Рассылок отправлено
          </div>
          <div className="metric-value">{stats.posts}</div>
        </div>
      </div>

    </div>
  );
}
