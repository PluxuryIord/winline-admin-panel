import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Users, MessageSquare, Send, BookOpen,
  Database, BarChart, Calendar, Trophy, LogOut, X,
  Shield, FileText, History, ChevronsLeft, ChevronsRight,
  ChevronDown, ChevronRight, Package, MessageCircle, PieChart, Settings,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useUnread } from '../../contexts/UnreadContext.jsx';
import logoSvg from '../../assets/logo.svg';

export default function Sidebar({ isMobileMenuOpen, closeMobileMenu, collapsed, onToggleCollapse }) {
  const { user, logout } = useAuth();
  const { hasUnread } = useUnread();
  const location = useLocation();

  // Описание секций. Если nested-пунктов нет (для не-админа в админ-секции),
  // — секция автоматически скроется.
  const sections = useMemo(() => [
    {
      key: 'content',
      label: 'Контент',
      icon: <Package size={18} />,
      items: [
        { name: 'Сценарии', path: '/scenarios', icon: <BookOpen size={18} /> },
        { name: 'База знаний', path: '/knowledge', icon: <Database size={18} /> },
        { name: 'Рассылки и контент', path: '/mailings', icon: <Send size={18} /> },
      ],
    },
    {
      key: 'partners',
      label: 'Партнёры',
      icon: <MessageCircle size={18} />,
      items: [
        { name: 'Пользователи', path: '/users', icon: <Users size={18} /> },
        { name: 'Чаты', path: '/chats', icon: <MessageSquare size={18} /> },
      ],
    },
    {
      key: 'analytics',
      label: 'Аналитика',
      icon: <PieChart size={18} />,
      items: [
        { name: 'Аналитика', path: '/analytics', icon: <BarChart size={18} /> },
        { name: 'Работа на ивенте', path: '/events', icon: <Calendar size={18} /> },
        { name: 'Розыгрыши', path: '/raffles', icon: <Trophy size={18} /> },
      ],
    },
    {
      key: 'admin',
      label: 'Админ',
      icon: <Settings size={18} />,
      items: [
        ...(user?.role === 'admin' ? [{ name: 'Пользователи', path: '/admin-users', icon: <Shield size={18} /> }] : []),
        { name: 'Журнал действий', path: '/audit-log', icon: <FileText size={18} /> },
        { name: 'История версий', path: '/version-history', icon: <History size={18} /> },
      ],
    },
  ].filter(s => s.items.length > 0), [user?.role]);

  // Какая секция содержит текущий активный путь — её открываем по умолчанию.
  const activeSectionKey = useMemo(() => {
    const cur = location.pathname;
    for (const s of sections) {
      if (s.items.some(it => cur === it.path || cur.startsWith(it.path + '/'))) {
        return s.key;
      }
    }
    return sections[0]?.key;
  }, [location.pathname, sections]);

  // Accordion: одновременно открыта только одна секция (или ни одной).
  const [openSection, setOpenSection] = useState(activeSectionKey);

  // При навигации в новый раздел переключаемся на его секцию.
  useEffect(() => {
    setOpenSection(activeSectionKey);
  }, [activeSectionKey]);

  const toggleSection = (key) => {
    setOpenSection(prev => prev === key ? null : key);
  };

  // В свернутом режиме рендерим плоский список иконок (заголовки секций бесполезны).
  const renderFlat = () => (
    <nav className="menu">
      {sections.flatMap(s => s.items).map(item => (
        <NavLink
          to={item.path}
          key={item.path}
          onClick={closeMobileMenu}
          className={({ isActive }) => isActive ? "menu-item active" : "menu-item"}
          title={item.name}
        >
          <div className="icon-wrapper">{item.icon}</div>
          {item.path === '/chats' && hasUnread && <span className="menu-unread-dot" />}
        </NavLink>
      ))}
    </nav>
  );

  const renderSectioned = () => (
    <nav className="menu">
      {sections.map(section => {
        const isOpen = openSection === section.key;
        return (
          <div key={section.key} className="menu-section">
            <button
              type="button"
              className={`menu-section-header ${isOpen ? 'open' : ''}`}
              onClick={() => toggleSection(section.key)}
            >
              <div className="icon-wrapper">{section.icon}</div>
              <span className="menu-label">{section.label}</span>
              <span className="menu-section-chevron">
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>
            {isOpen && (
              <div className="menu-section-items">
                {section.items.map(item => (
                  <NavLink
                    to={item.path}
                    key={item.path}
                    onClick={closeMobileMenu}
                    className={({ isActive }) => isActive ? "menu-item active" : "menu-item"}
                  >
                    <div className="icon-wrapper">{item.icon}</div>
                    <span className="menu-label">{item.name}</span>
                    {item.path === '/chats' && hasUnread && <span className="menu-unread-dot" />}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="logo-area">
        {!collapsed && <img src={logoSvg} alt="Winline Partners" className="sidebar-logo" />}
        <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title={collapsed ? 'Развернуть' : 'Свернуть'}>
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
        <button className="mobile-close-btn" onClick={closeMobileMenu}>
          <X size={24} />
        </button>
      </div>

      <div className="sidebar-scroll">
        {collapsed ? renderFlat() : renderSectioned()}
      </div>

      <div className="admin-profile">
        <div className="admin-avatar">{(user?.username || 'AD').slice(0, 2).toUpperCase()}</div>
        {!collapsed && (
          <div className="admin-info">
            <span className="admin-name">{user?.username || 'admin'}</span>
          </div>
        )}
        {!collapsed && <LogOut size={18} className="logout-icon" onClick={logout} title="Выйти" />}
      </div>
    </aside>
  );
}
