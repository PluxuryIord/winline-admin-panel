import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Download, MessageSquare, ArrowUpDown, X, ChevronDown, Loader } from 'lucide-react';
import './Users.css';

export default function Users() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Состояния фильтров
  const [filterRole, setFilterRole] = useState('all');
  const [filterBanned, setFilterBanned] = useState('all');
  const [filterTag, setFilterTag] = useState('all');

  // Состояние сортировки
  const [sortConfig, setSortConfig] = useState({ key: 'registrationDate', direction: 'desc' });

  // Export dropdown
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportRef = useRef(null);

  // Загрузка пользователей из API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error(`Ошибка ${res.status}`);
        const data = await res.json();
        if (!cancelled) setUsers(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Все уникальные теги
  const allTags = useMemo(() => {
    const tags = new Set();
    users.forEach(user => (user.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags);
  }, [users]);

  // Все уникальные роли
  const allRoles = useMemo(() => {
    const roles = new Set();
    users.forEach(user => { if (user.role && user.role !== '—') roles.add(user.role); });
    return Array.from(roles).sort();
  }, [users]);

  // Фильтрация и сортировка
  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    // 1. Поиск
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.fullName.toLowerCase().includes(q) ||
        u.telegram.toLowerCase().includes(q)
      );
    }

    // 2. Фильтры
    if (filterRole !== 'all') {
      result = result.filter(u => u.role === filterRole);
    }
    if (filterBanned !== 'all') {
      const banned = filterBanned === 'banned';
      result = result.filter(u => u.banned === banned);
    }
    if (filterTag !== 'all') {
      result = result.filter(u => (u.tags || []).includes(filterTag));
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
  }, [users, search, filterRole, filterBanned, filterTag, sortConfig]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleTagClick = (tag) => {
    setFilterTag(prev => prev === tag ? 'all' : tag);
  };

  const hasActiveFilters = filterRole !== 'all' || filterBanned !== 'all' || filterTag !== 'all' || search;

  const resetFilters = () => {
    setSearch('');
    setFilterRole('all');
    setFilterBanned('all');
    setFilterTag('all');
    setSortConfig({ key: 'registrationDate', direction: 'desc' });
  };

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
  const exportCSV = (list) => {
    const BOM = '\uFEFF';
    const headers = ['ФИО', 'Telegram', 'Роль', 'Дата регистрации', 'Забанен', 'Теги'];
    const rows = list.map(u => [
      u.fullName,
      u.telegram,
      u.role,
      u.registrationDate,
      u.banned ? 'Да' : 'Нет',
      (u.tags || []).join('; ')
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
  const handleExportGoogle = () => { exportCSV(filteredAndSortedUsers); setShowExportDropdown(false); };

  if (loading) {
    return (
      <div className="users-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
        <Loader size={32} className="spinner" />
        <span style={{ marginLeft: 12, color: '#aaa' }}>Загрузка пользователей...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="users-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#ff5555' }}>
        Ошибка загрузки: {error}
      </div>
    );
  }

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
              placeholder="Поиск по ФИО или Telegram..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span style={{ color: '#888', fontSize: 14 }}>Всего: {users.length} | Найдено: {filteredAndSortedUsers.length}</span>
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
          <select className="filter-select" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="all">Все роли</option>
            {allRoles.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>

          <select className="filter-select" value={filterBanned} onChange={(e) => setFilterBanned(e.target.value)}>
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="banned">Забаненные</option>
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
              <tr key={user.id} className={user.banned ? 'row-banned' : ''}>
                <td>
                  <Link to={`/users/${user.id}`} className="user-cell-link">
                    <div className="user-cell">
                      <div className="user-avatar">
                        {user.fullName.charAt(0)}
                      </div>
                      <div className="user-name-block">
                        <span className="user-name">{user.fullName}</span>
                        <span className="user-telegram">{user.telegram}</span>
                      </div>
                    </div>
                  </Link>
                </td>

                <td>
                  <div className="tags-wrapper">
                    {(user.tags || []).map(tag => (
                      <span
                        key={tag}
                        className={`tag-badge${filterTag === tag ? ' tag-active' : ''}${tag === 'Старый пользователь' ? ' tag-old' : ''}`}
                        onClick={() => handleTagClick(tag)}
                      >
                        {tag}
                      </span>
                    ))}
                    {user.banned && <span className="tag-badge tag-banned">Забанен</span>}
                    {user.role && user.role !== '—' && <span className="tag-badge tag-role">{user.role}</span>}
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
