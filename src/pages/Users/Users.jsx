import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Download, MessageSquare, ArrowUpDown, X, ChevronDown, Loader } from 'lucide-react';
import { api } from '../../utils/api.js';
import './Users.css';

const PAGE_SIZE = 50;

export default function Users() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const searchRef = useRef(null);

  // Фильтры
  const [filterBanned, setFilterBanned] = useState('all');
  const [filterTag, setFilterTag] = useState('all');

  // Сортировка
  const [sortConfig, setSortConfig] = useState({ key: 'registrationDate', direction: 'desc' });

  // Export dropdown
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportRef = useRef(null);
  const sentinelRef = useRef(null);

  // Дебаунс поиска — не теряем фокус
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Загрузка пользователей
  const fetchUsers = useCallback(async (offset = 0, searchQuery = '') => {
    try {
      const isAppend = offset > 0;
      if (!isAppend) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (searchQuery) params.set('search', searchQuery);

      const res = await api.get(`/api/users?${params}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();

      if (isAppend) {
        setUsers(prev => [...prev, ...data.users]);
      } else {
        setUsers(data.users);
      }
      setTotal(data.total);
      setHasMore(offset + data.users.length < data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Перезагрузка при смене поиска
  useEffect(() => {
    fetchUsers(0, debouncedSearch);
  }, [debouncedSearch, fetchUsers]);

  // Infinite scroll — IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchUsers(users.length, debouncedSearch);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, users.length, fetchUsers, debouncedSearch]);

  // Close export dropdown
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

  // Фильтрация и сортировка (клиентская, по загруженным)
  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    if (filterBanned !== 'all') {
      const banned = filterBanned === 'banned';
      result = result.filter(u => u.banned === banned);
    }
    if (filterTag !== 'all') {
      result = result.filter(u => (u.tags || []).includes(filterTag));
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [users, filterRole, filterBanned, filterTag, sortConfig]);

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

  const hasActiveFilters = filterBanned !== 'all' || filterTag !== 'all' || search;

  const resetFilters = () => {
    setSearch('');
    setFilterBanned('all');
    setFilterTag('all');
    setSortConfig({ key: 'registrationDate', direction: 'desc' });
  };

  const handleOpenChat = async (userId) => {
    try {
      const res = await api.get(`/api/chats/by-user/${userId}`);
      const chat = await res.json();
      navigate(`/chats/${chat.id}`);
    } catch {
      navigate('/chats');
    }
  };

  // Экспорт CSV
  const exportCSV = (list) => {
    const BOM = '\uFEFF';
    const headers = ['ФИО', 'Telegram', 'Дата регистрации', 'Забанен', 'Теги'];
    const rows = list.map(u => [
      u.fullName,
      u.telegram,
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

  if (loading && users.length === 0) {
    return (
      <div className="users-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
        <Loader size={32} className="spinner" />
        <span style={{ marginLeft: 12, color: '#aaa' }}>Загрузка пользователей...</span>
      </div>
    );
  }

  if (error && users.length === 0) {
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
              ref={searchRef}
              type="text"
              className="search-input"
              placeholder="Поиск по ФИО или Telegram..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span style={{ color: '#888', fontSize: 14 }}>
            Всего: {total}{filteredAndSortedUsers.length !== users.length ? ` | Найдено: ${filteredAndSortedUsers.length}` : ''}
          </span>
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
                        className={`tag-badge${filterTag === tag ? ' tag-active' : ''}`}
                        onClick={() => handleTagClick(tag)}
                      >
                        {tag}
                      </span>
                    ))}
                    {user.banned && (
                      <span className="tag-badge" onClick={() => setFilterBanned(filterBanned === 'banned' ? 'all' : 'banned')}>
                        Забанен
                      </span>
                    )}
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
            {filteredAndSortedUsers.length === 0 && !loading && (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
                  Пользователи не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Sentinel для infinite scroll */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {loadingMore && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <Loader size={24} className="spinner" />
            <span style={{ marginLeft: 10, color: '#888', fontSize: 14 }}>Загрузка...</span>
          </div>
        )}
      </div>

    </div>
  );
}
