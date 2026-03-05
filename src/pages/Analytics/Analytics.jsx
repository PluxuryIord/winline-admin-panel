import { useState } from 'react';
import {
  Calendar, RefreshCw, Download, ChevronDown,
  Users, UserCheck, UserPlus, MessageCircle, Ban, Share2, FileText, BarChart2
} from 'lucide-react';
import './Analytics.css';
import { analyticsByPeriod } from '../../data/analyticsData';

export default function Analytics() {
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('За всё время');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState(analyticsByPeriod['За всё время']);

  const periods = ["За всё время", "Сегодня", "За 24 часа", "За неделю", "За месяц", "За год"];

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setStats(analyticsByPeriod[selectedPeriod]);
      setIsGenerating(false);
    }, 700);
  };

  const handleExport = (format) => {
    alert(`Начат экспорт отчета в формате ${format}...`);
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
              <button className="dropdown-item" onClick={() => handleExport('.XLSX (Excel)')}>в Excel (.xlsx)</button>
              <button className="dropdown-item" onClick={() => handleExport('.TXT')}>в Текст (.txt)</button>
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
          <div className="metric-subtext">Расчет: Всего пользователей / Партнеров</div>
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
          <div className="metric-subtext">Меню, чат (24ч), техподдержка, получение QR</div>
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
          <div className="metric-subtext">За выбранный период</div>
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

    </div>
  );
}
