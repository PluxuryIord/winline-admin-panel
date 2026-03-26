import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Download, MessageSquare, ArrowUpDown, X, ChevronDown, Loader, Pencil, Trash2 } from 'lucide-react';
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
  const [filterTags, setFilterTags] = useState([]);  // [] = all
  const [tagSearch, setTagSearch] = useState('');

  // Сортировка
  const [sortConfig, setSortConfig] = useState({ key: 'registrationDate', direction: 'desc' });

  // Tag filter dropdown
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagFilterRef = useRef(null);

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

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Все уникальные теги — загружаем с сервера
  const [allTags, setAllTags] = useState([]);
  const loadTags = useCallback(() => {
    api.get('/api/users/all-tags').then(r => r.json()).then(setAllTags).catch(() => {});
  }, []);
  useEffect(() => { loadTags(); }, [loadTags]);

  // Модал редактирования тега
  const [tagModal, setTagModal] = useState(null); // { tag, newName }
  const [tagModalSaving, setTagModalSaving] = useState(false);

  const openRenameModal = (tag, e) => {
    e.stopPropagation();
    setTagModal({ tag, newName: tag });
    setShowTagDropdown(false);
  };

  const handleRenameSubmit = async () => {
    if (!tagModal || !tagModal.newName.trim() || tagModal.newName.trim() === tagModal.tag) {
      setTagModal(null);
      return;
    }
    setTagModalSaving(true);
    try {
      const res = await api.put('/api/users/tags/rename', { oldTag: tagModal.tag, newTag: tagModal.newName.trim() });
      const data = await res.json();
      if (data.ok) {
        loadTags();
        fetchUsers(0, debouncedSearch);
        if (filterTags.includes(tagModal.tag)) setFilterTags(filterTags.map(t => t === tagModal.tag ? tagModal.newName.trim() : t));
      }
    } catch (err) { alert('Ошибка: ' + err.message); }
    setTagModalSaving(false);
    setTagModal(null);
  };

  // Модал удаления тега
  const [deleteTagModal, setDeleteTagModal] = useState(null); // tag string
  const [deleteTagSaving, setDeleteTagSaving] = useState(false);

  const openDeleteModal = (tag, e) => {
    e.stopPropagation();
    setDeleteTagModal(tag);
    setShowTagDropdown(false);
  };

  const handleDeleteSubmit = async () => {
    if (!deleteTagModal) return;
    setDeleteTagSaving(true);
    try {
      const res = await api.delete(`/api/users/tags/bulk-delete?tag=${encodeURIComponent(deleteTagModal)}`);
      const data = await res.json();
      if (data.ok) {
        loadTags();
        fetchUsers(0, debouncedSearch);
        if (filterTags.includes(deleteTagModal)) setFilterTags(filterTags.filter(t => t !== deleteTagModal));
      }
    } catch (err) { alert('Ошибка: ' + err.message); }
    setDeleteTagSaving(false);
    setDeleteTagModal(null);
  };

  // Фильтрация и сортировка (клиентская, по загруженным)
  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    if (filterTags.length > 0) {
      result = result.filter(u => filterTags.some(ft => (u.tags || []).includes(ft)));
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [users, filterTags, sortConfig]);

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

  const hasActiveFilters = filterTags.length > 0 || search;

  const resetFilters = () => {
    setSearch('');
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
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
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
  const handleExportTxt = () => {
    const BOM = '\uFEFF';
    const lines = filteredAndSortedUsers.map(u =>
      `${u.fullName} | ${u.telegram} | ${u.registrationDate} | ${u.banned ? 'Забанен' : 'Активен'} | ${(u.tags || []).join(', ')}`
    );
    const txt = lines.join('\n');
    const blob = new Blob([BOM + txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.txt';
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDropdown(false);
  };

  if (loading && users.length === 0 && !search && !debouncedSearch) {
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
                <div className="export-dropdown-item" onClick={handleExportTxt}>
                  <Download size={14} /> Текст (TXT)
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="filters-row">
          <div className="tag-filter-wrapper" ref={tagFilterRef}>
            <button
              className={`filter-select${filterTags.length > 0 ? ' filter-select--active' : ''}`}
              onClick={() => { setShowTagDropdown(!showTagDropdown); setTagSearch(''); }}
            >
              {filterTags.length === 0 ? 'Все теги' : filterTags.length === 1 ? filterTags[0] : `${filterTags.length} тегов`}
              <ChevronDown size={14} className={`filter-chevron${showTagDropdown ? ' filter-chevron--open' : ''}`} />
            </button>
            {showTagDropdown && (
              <div className="tag-filter-dropdown">
                {allTags.length > 5 && (
                  <div className="tag-filter-search-wrap">
                    <input
                      className="tag-filter-search"
                      placeholder="Поиск тегов..."
                      value={tagSearch}
                      onChange={e => setTagSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}
                <div
                  className={`tag-filter-item${filterTags.length === 0 ? ' tag-filter-item--active' : ''}`}
                  onClick={() => { setFilterTags([]); setShowTagDropdown(false); }}
                >
                  Все теги
                </div>
                {allTags
                  .filter(tag => !tagSearch.trim() || tag.toLowerCase().includes(tagSearch.trim().toLowerCase()))
                  .map(tag => (
                  <div
                    key={tag}
                    className={`tag-filter-item${filterTags.includes(tag) ? ' tag-filter-item--active' : ''}`}
                    onClick={() => {
                      setFilterTags(prev =>
                        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                      );
                    }}
                  >
                    <span className="tag-filter-item-check">{filterTags.includes(tag) ? '✓' : ''}</span>
                    <span className="tag-filter-item-text">{tag}</span>
                    <div className="tag-filter-actions">
                      <button className="tag-action-btn" onClick={(e) => openRenameModal(tag, e)} title="Переименовать">
                        <Pencil size={12} />
                      </button>
                      <button className="tag-action-btn tag-action-delete" onClick={(e) => openDeleteModal(tag, e)} title="Удалить у всех">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                        className={`tag-badge${filterTags.includes(tag) ? ' tag-active' : ''}`}
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

      {/* Модал переименования тега */}
      {tagModal && (
        <div className="tag-modal-overlay" onClick={() => setTagModal(null)}>
          <div className="tag-modal" onClick={e => e.stopPropagation()}>
            <button className="tag-modal-close" onClick={() => setTagModal(null)}><X size={18} /></button>
            <h3>Переименовать тег</h3>
            <p className="tag-modal-desc">
              Тег <strong>«{tagModal.tag}»</strong> будет переименован у всех пользователей
            </p>
            <div className="tag-modal-field">
              <label>Новое название</label>
              <input
                type="text"
                value={tagModal.newName}
                onChange={e => setTagModal({ ...tagModal, newName: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleRenameSubmit()}
                autoFocus
              />
            </div>
            <div className="tag-modal-actions">
              <button className="tag-modal-cancel" onClick={() => setTagModal(null)}>Отмена</button>
              <button
                className="tag-modal-submit"
                onClick={handleRenameSubmit}
                disabled={tagModalSaving || !tagModal.newName.trim() || tagModal.newName.trim() === tagModal.tag}
              >
                {tagModalSaving ? 'Сохранение...' : 'Переименовать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модал удаления тега */}
      {deleteTagModal && (
        <div className="tag-modal-overlay" onClick={() => setDeleteTagModal(null)}>
          <div className="tag-modal" onClick={e => e.stopPropagation()}>
            <button className="tag-modal-close" onClick={() => setDeleteTagModal(null)}><X size={18} /></button>
            <h3>Удалить тег</h3>
            <p className="tag-modal-desc">
              Тег <strong>«{deleteTagModal}»</strong> будет удалён у всех пользователей. Это действие необратимо.
            </p>
            <div className="tag-modal-actions">
              <button className="tag-modal-cancel" onClick={() => setDeleteTagModal(null)}>Отмена</button>
              <button
                className="tag-modal-submit tag-modal-danger"
                onClick={handleDeleteSubmit}
                disabled={deleteTagSaving}
              >
                {deleteTagSaving ? 'Удаление...' : 'Удалить у всех'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
