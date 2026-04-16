import { NavLink } from 'react-router-dom';
import {
  Users, MessageSquare, Send, BookOpen,
  Database, BarChart, Calendar, LogOut, X,
  Shield, FileText, History, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useUnread } from '../../contexts/UnreadContext.jsx';

export default function Sidebar({ isMobileMenuOpen, closeMobileMenu, collapsed, onToggleCollapse }) {
  const { user, logout } = useAuth();
  const { hasUnread } = useUnread();
  return (
    <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="logo-area">
        {!collapsed && <img src="/logo.svg" alt="Winline Partners" className="sidebar-logo" />}
        <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title={collapsed ? 'Развернуть' : 'Свернуть'}>
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
        <button className="mobile-close-btn" onClick={closeMobileMenu}>
          <X size={24} />
        </button>
      </div>

      <nav className="menu">
        {[
          { name: 'Пользователи', path: '/users', icon: <Users size={18} /> },
          { name: 'Чаты', path: '/chats', icon: <MessageSquare size={18} /> },
          { name: 'Рассылки и контент', path: '/mailings', icon: <Send size={18} /> },
          { name: 'Сценарии', path: '/scenarios', icon: <BookOpen size={18} /> },
          { name: 'База знаний', path: '/knowledge', icon: <Database size={18} /> },
          { name: 'Аналитика', path: '/analytics', icon: <BarChart size={18} /> },
          { name: 'Работа на ивенте', path: '/events', icon: <Calendar size={18} /> },
        ].map((item) => (
          <NavLink
            to={item.path}
            key={item.path}
            onClick={closeMobileMenu}
            className={({ isActive }) => isActive ? "menu-item active" : "menu-item"}
            title={collapsed ? item.name : undefined}
          >
            <div className="icon-wrapper">
              {item.icon}
            </div>
            {!collapsed && <span className="menu-label">{item.name}</span>}
            {item.path === '/chats' && hasUnread && <span className="menu-unread-dot" />}
          </NavLink>
        ))}
      </nav>

      {!collapsed && <div className="sidebar-divider" />}
      {!collapsed && <div className="sidebar-section-label">Администрирование</div>}
      {collapsed && <div className="sidebar-divider" />}
      <nav className="menu menu-admin">
        {[
          ...(user?.role === 'admin' ? [{ name: 'Пользователи', path: '/admin-users', icon: <Shield size={18} /> }] : []),
          { name: 'Журнал действий', path: '/audit-log', icon: <FileText size={18} /> },
          { name: 'История версий', path: '/version-history', icon: <History size={18} /> },
        ].map((item) => (
          <NavLink
            to={item.path}
            key={item.path}
            onClick={closeMobileMenu}
            className={({ isActive }) => isActive ? "menu-item active" : "menu-item"}
            title={collapsed ? item.name : undefined}
          >
            <div className="icon-wrapper">
              {item.icon}
            </div>
            {!collapsed && <span className="menu-label">{item.name}</span>}
          </NavLink>
        ))}
      </nav>

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
