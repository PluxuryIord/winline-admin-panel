import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, RefreshCw, Download, ChevronDown,
  Users, UserCheck, UserPlus, MessageCircle, Ban, Share2, FileText, BarChart2,
  CheckCircle, Clock, XCircle, TrendingUp, AlertCircle
} from 'lucide-react';
import './Analytics.css';
import { analyticsByPeriod } from '../../data/analyticsData';

// Маппинг: label периода → код для API
const PERIOD_CODE = {
  'За всё время': 'all',
  'Сегодня':      'today',
  'За 24 часа':   '24h',
  'За неделю':    'week',
  'За месяц':     'month',
  'За год':       'year',
};

export default function Analytics() {
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('За неделю');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState(analyticsByPeriod['За неделю']);

  // IAP данные
  const [iap, setIap] = useState(null);        // { total, confirmed, pending, cancelled, confirmRate }
  const [iapLoading, setIapLoading] = useState(false);
  const [iapError, setIapError] = useState(null);

  const periods = ["За всё время", "Сегодня", "За 24 часа", "За неделю", "За месяц", "За год"];

  const fetchIap = useCallback(async (period) => {
    const code = PERIOD_CODE[period] || 'month';
    setIapLoading(true);
    setIapError(null);
    try {
      const res = await fetch(`/api/iap/analytics?period=${code}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIap(data);
    } catch (err) {
      setIapError(err.message);
    } finally {
      setIapLoading(false);
    }
  }, []);

  // Загрузка при старте
  // Периоды, которые грузятся долго (много данных)
  const SLOW_PERIODS = new Set(['За месяц', 'За год', 'За всё время']);

  useEffect(() => { fetchIap(selectedPeriod); }, []);

  const handleGenerate = () => {
    setIsGenerating(true);
    fetchIap(selectedPeriod);
    setTimeout(() => {
      setStats(analyticsByPeriod[selectedPeriod] || analyticsByPeriod['За месяц']);
      setIsGenerating(false);
    }, 700);
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

  const handleExportExcel = () => {
    const rows = [
      ['Отчёт по аналитике'],
      ['Период', selectedPeriod],
      ['Дата формирования', new Date().toLocaleDateString('ru-RU')],
      [],
      ['Аудитория бота'],
      ['Всего пользователей', stats.totalUsers],
      ['Партнёры', stats.partners],
      ['Гости', stats.guests],
      ['Конверсия в партнёра', `1 к ${conversionRatio}`],
      [],
      ['Активность и вовлечённость'],
      ['Обращений к боту', stats.requests],
      ['Заблокировали бота', stats.blocked],
      ['Новых пользователей', stats.newUsers],
      [],
      ['Контент'],
      ['Подключённых каналов', stats.channels],
      ['Сделано постов', stats.posts],
    ];
    const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\n');
    triggerDownload(csv, `analytics_${dateSuffix()}.csv`, 'text/csv;charset=utf-8;');
    setIsExportOpen(false);
  };

  const handleExportTxt = () => {
    const sep = '─'.repeat(42);
    const lines = [
      'ОТЧЁТ ПО АНАЛИТИКЕ',
      `Период: ${selectedPeriod}`,
      `Дата:   ${new Date().toLocaleDateString('ru-RU')}`,
      sep,
      'АУДИТОРИЯ БОТА',
      `Всего пользователей:   ${stats.totalUsers.toLocaleString('ru-RU')}`,
      `Партнёры:              ${stats.partners.toLocaleString('ru-RU')}`,
      `Гости:                 ${stats.guests.toLocaleString('ru-RU')}`,
      `Конверсия в партнёра:  1 к ${conversionRatio}`,
      sep,
      'АКТИВНОСТЬ И ВОВЛЕЧЁННОСТЬ',
      `Обращений к боту:      ${stats.requests.toLocaleString('ru-RU')}`,
      `Заблокировали бота:    ${stats.blocked.toLocaleString('ru-RU')}`,
      `Новых пользователей:   +${stats.newUsers.toLocaleString('ru-RU')}`,
      sep,
      'КОНТЕНТ',
      `Подключённых каналов:  ${stats.channels}`,
      `Сделано постов:        ${stats.posts}`,
    ];
    triggerDownload(lines.join('\n'), `analytics_${dateSuffix()}.txt`, 'text/plain;charset=utf-8;');
    setIsExportOpen(false);
  };

  const conversionRatio = (stats.totalUsers / stats.partners).toFixed(1);

  return (
    <div className="analytics-container">

      {/* 1. БЛОК УПРАВЛЕНИЯ */}
      <div className="analytics-controls">

        <div className="control-wrapper">
          <button className="btn-control" onClick={() => { setIsPeriodOpen(!isPeriodOpen); setIsExportOpen(false); }}>
            <Calendar size={18} />
            {selectedPeriod}
            <ChevronDown size={16} />
          </button>

          {isPeriodOpen && (
            <div className="dropdown-menu">
              {periods.map(period => (
                <button
                  key={period}
                  className={`dropdown-item ${selectedPeriod === period ? 'active' : ''}`}
                  onClick={() => { setSelectedPeriod(period); setIsPeriodOpen(false); }}
                >
                  {period}
                </button>
              ))}
            </div>
          )}
        </div>

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
        Данные: <span>{selectedPeriod}</span>
      </div>

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
          <div className="metric-value">1 к {conversionRatio}</div>
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
            <div className="metric-icon"><FileText size={20} /></div>
            Сделано постов
          </div>
          <div className="metric-value">{stats.posts}</div>
        </div>
      </div>

      {/* 5. КОНВЕРСИИ IAP */}
      <div className="iap-section-header">
        <h3 className="section-title" style={{ marginBottom: 0 }}>Конверсии партнёрской программы</h3>
        <span className="iap-badge">IAP Live</span>
        {iapLoading && <RefreshCw size={16} className="spin iap-spin" />}
      </div>
      {iapLoading && SLOW_PERIODS.has(selectedPeriod) && (
        <div className="iap-slow-hint">
          ⏳ Большой диапазон — загрузка может занять до 2 минут
        </div>
      )}

      {iapError ? (
        <div className="iap-error">
          <AlertCircle size={18} />
          <span>{iapError}</span>
        </div>
      ) : (
        <div className="metrics-grid">
          <div className="metric-card" style={{ borderColor: 'rgba(255, 126, 0, 0.4)' }}>
            <div className="metric-header">
              <div className="metric-icon"><BarChart2 size={20} /></div>
              Всего конверсий
            </div>
            <div className="metric-value">
              {iapLoading ? <span className="iap-skeleton" /> : (iap?.total?.toLocaleString('ru-RU') ?? '—')}
            </div>
          </div>

          <div className="metric-card" style={{ borderColor: 'rgba(34, 197, 94, 0.3)' }}>
            <div className="metric-header">
              <div className="metric-icon" style={{ color: '#22c55e' }}><CheckCircle size={20} /></div>
              Подтверждено
            </div>
            <div className="metric-value" style={{ color: '#22c55e' }}>
              {iapLoading ? <span className="iap-skeleton" /> : (iap?.confirmed?.toLocaleString('ru-RU') ?? '—')}
            </div>
          </div>

          <div className="metric-card" style={{ borderColor: 'rgba(255, 126, 0, 0.3)' }}>
            <div className="metric-header">
              <div className="metric-icon"><Clock size={20} /></div>
              В обработке
            </div>
            <div className="metric-value">
              {iapLoading ? <span className="iap-skeleton" /> : (iap?.pending?.toLocaleString('ru-RU') ?? '—')}
            </div>
          </div>

          <div className="metric-card" style={{ borderColor: 'rgba(255, 68, 68, 0.3)' }}>
            <div className="metric-header">
              <div className="metric-icon" style={{ color: '#ff4444' }}><XCircle size={20} /></div>
              Аннулировано
            </div>
            <div className="metric-value" style={{ color: '#ff4444' }}>
              {iapLoading ? <span className="iap-skeleton" /> : (iap?.cancelled?.toLocaleString('ru-RU') ?? '—')}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <div className="metric-icon" style={{ color: '#22c55e' }}><TrendingUp size={20} /></div>
              Процент подтверждения
            </div>
            <div className="metric-value" style={{ color: '#22c55e' }}>
              {iapLoading ? <span className="iap-skeleton" /> : (iap ? `${iap.confirmRate}%` : '—')}
            </div>
          </div>

          {iap && (
            <div className="metric-card iap-period-card">
              <div className="metric-header" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                Период данных
              </div>
              <div className="iap-period-dates">
                {iap.start} → {iap.end}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
