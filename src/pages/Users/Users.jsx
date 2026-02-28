import { useState, useMemo } from 'react';
import { Search, Download, ArrowUpDown } from 'lucide-react';
import { usersData } from '../../data/usersData';
import './Users.css';

export default function Users() {
  const [search, setSearch] = useState('');
  
  // Состояния фильтров
  const [filterPartner, setFilterPartner] = useState('all'); // all, partner, guest
  const [filterEntity, setFilterEntity] = useState('all'); // all, phys, legal
  const [filterTag, setFilterTag] = useState('all');
  
  // Состояние сортировки (ключ и направление)
  const [sortConfig, setSortConfig] = useState({ key: 'registrationDate', direction: 'desc' });

  // Все уникальные теги для выпадающего списка
  const allTags = useMemo(() => {
    const tags = new Set();
    usersData.forEach(user => user.tags.forEach(t => tags.add(t)));
    return Array.from(tags);
  }, []);

  // Функция применения фильтров и сортировки
  const filteredAndSortedUsers = useMemo(() => {
    let result = [...usersData];

    // 1. Поиск (по ФИО или Telegram)
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u => 
        u.fullName.toLowerCase().includes(q) || 
        u.telegram.toLowerCase().includes(q)
      );
    }

    // 2. Фильтры
    if (filterPartner !== 'all') {
      const isPartner = filterPartner === 'partner';
      result = result.filter(u => u.isPartner === isPartner);
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
  }, [search, filterPartner, filterEntity, filterTag, sortConfig]);

  // Смена сортировки при клике на заголовок колонки
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Клик по тегу прямо в таблице (быстрая фильтрация)
  const handleTagClick = (tag) => {
    setFilterTag(tag);
  };

  const handleExport = () => {
    alert('Экспорт отфильтрованной таблицы в Excel запущен...');
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
              placeholder="Поиск по ФИО или Telegram..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-control primary" onClick={handleExport}>
            <Download size={18} /> Экспорт
          </button>
        </div>

        <div className="filters-row">
          <select className="filter-select" value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}>
            <option value="all">Все статусы</option>
            <option value="partner">Партнёр</option>
            <option value="guest">Гость</option>
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
        </div>
      </div>

      {/* ТАБЛИЦА */}
      <div className="table-wrapper">
        <table className="winline-table">
          <thead>
            <tr>
              <th>ID</th>
              <th className="col-name">Пользователь</th>
              <th>Статус</th>
              <th>Тип лица</th>
              <th onClick={() => handleSort('registrationDate')} style={{ cursor: 'pointer' }}>
                Дата регистрации <ArrowUpDown size={12} style={{ marginLeft: 4 }}/>
              </th>
              <th onClick={() => handleSort('commission')} style={{ cursor: 'pointer' }}>
                Комиссия <ArrowUpDown size={12} style={{ marginLeft: 4 }}/>
              </th>
              <th>Теги (кликните)</th>
            </tr>
          </thead>
					<tbody>
            {filteredAndSortedUsers.map(user => (
              <tr key={user.id}>
                <td style={{ color: 'rgba(255,255,255,0.4)' }}>#{user.id}</td>
                
                {/* НОВАЯ КРАСИВАЯ ЯЧЕЙКА С АВАТАРКОЙ */}
                <td className="col-name">
                  <div className="user-cell">
                    <div className="user-avatar">
                      {user.fullName.charAt(0)} {/* Берем первую букву имени */}
                    </div>
                    <div className="user-details">
                      <span className="user-name">{user.fullName}</span>
                      <span className="user-tg">{user.telegram}</span>
                    </div>
                  </div>
                </td>

                <td>
                  <span className={`status-badge ${user.isPartner ? 'status-partner' : 'status-guest'}`}>
                    {user.isPartner ? 'Партнёр' : 'Гость'}
                  </span>
                </td>
                
                <td style={{ color: 'rgba(255,255,255,0.7)' }}>{user.entityType}</td>
                
                <td className="date-cell">
                  {new Date(user.registrationDate).toLocaleDateString('ru-RU')}
                </td>
                
                <td className="commission-cell">
                  {user.commission.toLocaleString('ru-RU')} ₽
                </td>
                
                <td className="tags-cell">
                  {user.tags.map(tag => (
                    <span 
                      key={tag} 
                      className="tag-badge"
                      onClick={() => handleTagClick(tag)}
                    >
                      {tag}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {filteredAndSortedUsers.length === 0 && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
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