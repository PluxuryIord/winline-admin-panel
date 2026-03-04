import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Download, MessageSquare, ArrowUpDown, X, ChevronDown } from 'lucide-react';
import { usersData } from '../../data/usersData';
import './Users.css';

export default function Users() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  // Состояния фильтров
  const [filterPartner, setFilterPartner] = useState('all'); // all, partner, guest
  const [filterCountry, setFilterCountry] = useState('all');
  const [filterGender, setFilterGender] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all'); // all, phys, legal
  const [filterTag, setFilterTag] = useState('all');

  // Состояние сортировки (ключ и направление)
  const [sortConfig, setSortConfig] = useState({ key: 'registrationDate', direction: 'desc' });

  // Export dropdown
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Все уникальные теги для выпадающего списка
  const allTags = useMemo(() => {
    const tags = new Set();
    usersData.forEach(user => user.tags.forEach(t => tags.add(t)));
    return Array.from(tags);
  }, []);

  // Все уникальные страны
  const allCountries = useMemo(() => {
    const countries = new Set();
    usersData.forEach(user => { if (user.country) countries.add(user.country); });
    return Array.from(countries).sort();
  }, []);

  // Все уникальные значения пола
  const allGenders = useMemo(() => {
    const genders = new Set();
    usersData.forEach(user => { if (user.gender && user.gender !== '-') genders.add(user.gender); });
    return Array.from(genders);
  }, []);

  // Функция применения фильтров и сортировки
  const filteredAndSortedUsers = useMemo(() => {
    let result = [...usersData];

		// 1. Поиск (по ФИО)
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.fullName.toLowerCase().includes(q)
      );
    }

    // 2. Фильтры
    if (filterPartner !== 'all') {
      const isPartner = filterPartner === 'partner';
      result = result.filter(u => u.isPartner === isPartner);
    }
    if (filterCountry !== 'all') {
      result = result.filter(u => u.country === filterCountry);
    }
    if (filterGender !== 'all') {
      result = result.filter(u => u.gender === filterGender);
    }
    if (filterEntity !== 'all') {
      const entity = filterEntity === 'phys' ? 'Физ. лицо' : 'Юр. лицо';
      result = result.filter(u => u.entityType === entity);
    }
    if (filterTag !== 'all') {
      result = result.filter(u => u.tags.includes(filterTag));
    }

    // 3. Сортировка
    if (sortConfig.key) {
      result.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [search, filterPartner, filterCountry, filterGender, filterEntity, filterTag, sortConfig]);

  // Смена сортировки при клике на заголовок колонки
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Клик по тегу прямо в таблице (быстрая фильтрация / снятие)
  const handleTagClick = (tag) => {
    setFilterTag(prev => prev === tag ? 'all' : tag);
  };

  const hasActiveFilters = filterPartner !== 'all' || filterCountry !== 'all' || filterGender !== 'all' || filterEntity !== 'all' || filterTag !== 'all' || search;

  const resetFilters = () => {
    setSearch('');
    setFilterPartner('all');
    setFilterCountry('all');
    setFilterGender('all');
    setFilterEntity('all');
    setFilterTag('all');
    setSortConfig({ key: 'registrationDate', direction: 'desc' });
  };

  // Кнопка Чат — найти или создать чат для пользователя
  const handleOpenChat = async (userId) => {
    try {
      const res = await fetch(`/api/chats/by-user/${userId}`);
      const chat = await res.json();
      navigate(`/chats/${chat.id}`);
    } catch {
      navigate('/chats');
    }
  };

  // Экспорт CSV
  const exportCSV = (users) => {
    const BOM = '\uFEFF';
    const headers = ['ФИО', 'Telegram', 'Статус', 'Тип лица', 'Страна', 'Пол', 'Дата регистрации', 'Комиссия (₽)', 'Теги'];
    const rows = users.map(u => [
      u.fullName,
      u.telegram,
      u.isPartner ? 'Партнёр' : 'Гость',
      u.entityType,
      u.country,
      u.gender,
      u.registrationDate,
      u.commission,
      u.tags.join('; ')
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDropdown(false);
  };

  const handleExportExcel = () => exportCSV(filteredAndSortedUsers);

  const handleExportGoogle = () => {
    exportCSV(filteredAndSortedUsers);
    // CSV открывается и в Google Sheets через Файл → Импорт
    setShowExportDropdown(false);
  };

  return (
    <div className="users-container">

      {/* ПАНЕЛЬ УПРАВЛЕНИЯ */}
      <div className="users-controls">
        <div className="controls-top-row">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Поиск по ФИО..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="export-wrapper" ref={exportRef}>
            <button className="btn-control primary" onClick={() => setShowExportDropdown(!showExportDropdown)}>
              <Download size={18} /> Экспорт <ChevronDown size={14} />
            </button>
            {showExportDropdown && (
              <div className="export-dropdown">
                <div className="export-dropdown-item" onClick={handleExportExcel}>
                  <Download size={14} /> Excel (CSV)
                </div>
                <div className="export-dropdown-item" onClick={handleExportGoogle}>
                  <Download size={14} /> Google Таблицы (CSV)
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="filters-row">
          <select className="filter-select" value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}>
            <option value="all">Все статусы</option>
            <option value="partner">Партнёр</option>
            <option value="guest">Гость</option>
          </select>

          <select className="filter-select" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}>
            <option value="all">Все страны</option>
            {allCountries.map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>

          <select className="filter-select" value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
            <option value="all">Любой пол</option>
            {allGenders.map(gender => (
              <option key={gender} value={gender}>{gender}</option>
            ))}
          </select>

          <select className="filter-select" value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}>
            <option value="all">Все лица</option>
            <option value="phys">Физ. лицо</option>
            <option value="legal">Юр. лицо</option>
          </select>

          <select className="filter-select" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            <option value="all">Все теги</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>

          <button
            className={`btn-sort${sortConfig.key === 'registrationDate' ? ' btn-sort-active' : ''}`}
            onClick={() => handleSort('registrationDate')}
          >
            <ArrowUpDown size={14} />
            Дата регистрации
            {sortConfig.key === 'registrationDate' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
          </button>

          <button
            className={`btn-sort${sortConfig.key === 'commission' ? ' btn-sort-active' : ''}`}
            onClick={() => handleSort('commission')}
          >
            <ArrowUpDown size={14} />
            Комиссия
            {sortConfig.key === 'commission' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
          </button>

          {hasActiveFilters && (
            <button className="btn-reset-filters" onClick={resetFilters}>
              <X size={14} />
              Сбросить
            </button>
          )}
        </div>
      </div>

      {/* ТАБЛИЦА */}
      <div className="table-wrapper">
        <table className="winline-table">
          <thead>
            <tr>
              <th></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedUsers.map(user => (
              <tr key={user.id}>
                <td>
                  <Link to={`/users/${user.id}`} className="user-cell-link">
                    <div className="user-cell">
                      <div className="user-avatar">
                        {user.fullName.charAt(0)}
                      </div>
                      <span className="user-name">{user.fullName}</span>
                    </div>
                  </Link>
                </td>

                <td>
                  <div className="tags-wrapper">
                    {user.tags.map(tag => (
                      <span
                        key={tag}
                        className={`tag-badge${filterTag === tag ? ' tag-active' : ''}`}
                        onClick={() => handleTagClick(tag)}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>

                <td>
                  <button className="btn-chat" onClick={() => handleOpenChat(user.id)}>
                    <MessageSquare size={16} />
                    Чат
                  </button>
                </td>
              </tr>
            ))}
            {filteredAndSortedUsers.length === 0 && (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
                  Пользователи не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
