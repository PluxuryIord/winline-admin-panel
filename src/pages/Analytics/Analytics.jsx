import { useState } from 'react';
import { 
  Calendar, RefreshCw, Download, ChevronDown, 
  Users, UserCheck, UserPlus, MessageCircle, Ban, Share2, FileText, BarChart2
} from 'lucide-react';
import './Analytics.css';

export default function Analytics() {
  // Состояния для выпадающих меню
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  
  // Состояние для выбранного периода
  const [selectedPeriod, setSelectedPeriod] = useState('За всё время');
  
  // Имитация загрузки при нажатии на "Сформировать"
  const [isGenerating, setIsGenerating] = useState(false);

  const periods = ["За всё время", "Сегодня", "За 24 часа", "За неделю", "За месяц", "За год"];

  const handleGenerate = () => {
    setIsGenerating(true);
    // Имитируем запрос к БД (крутим иконку 1 секунду)
    setTimeout(() => {
      setIsGenerating(false);
    }, 1000);
  };

  const handleExport = (format) => {
    alert(`Начат экспорт отчета в формате ${format}...`);
    setIsExportOpen(false);
  };

  // Фейковые данные (в будущем прилетят с бэкенда)
  const stats = {
    totalUsers: 15420,
    partners: 3855,
    guests: 11565,
    blocked: 430,
    requests: 89200, // Включает меню, чат, ТП, QR
    newUsers: 1240,
    channels: 18,
    posts: 342
  };

  // Расчет конверсии по твоей формуле (Все пользователи / Партнеры)
  const conversionRatio = (stats.totalUsers / stats.partners).toFixed(1); 
  // ИЛИ классическая конверсия в %: ((stats.partners / stats.totalUsers) * 100).toFixed(1) + '%'

  return (
    <div className="analytics-container">
      
      {/* 1. БЛОК УПРАВЛЕНИЯ (Кнопки из твоего ТЗ) */}
      <div className="analytics-controls">
        
        {/* Кнопка 1: Начало и конец периода */}
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

        {/* Кнопка 2: Сформировать (Обновить) */}
        <button className="btn-control primary" onClick={handleGenerate}>
          <RefreshCw size={18} className={isGenerating ? 'spin' : ''} />
          Сформировать
        </button>

        {/* Кнопка 3: Экспорт */}
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


      {/* 2. БЛОК ДАННЫХ (Дашборд вместо списка) */}
      
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
          {/* По твоей формуле 1 партнер на X пользователей */}
          <div className="metric-value">1 к {conversionRatio}</div>
          <div className="metric-subtext">Расчет: Всего пользователей / Партнеров</div>
        </div>
      </div>


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