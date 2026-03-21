import { NavLink } from 'react-router-dom';
import {
  Users, MessageSquare, Send, BookOpen,
  Database, BarChart, Calendar, LogOut, X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useUnread } from '../../contexts/UnreadContext.jsx';

export default function Sidebar({ isMobileMenuOpen, closeMobileMenu }) {
  const { user, logout } = useAuth();
  const { hasUnread } = useUnread();
  return (
    <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
      <div className="logo-area">
        <img src="/logo.svg" alt="Winline Partners" className="sidebar-logo" />
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
          >
            <div className="icon-wrapper">
              {item.icon}
            </div>
            {item.name}
            {item.path === '/chats' && hasUnread && <span className="menu-unread-dot" />}
          </NavLink>
        ))}
      </nav>

      <div className="admin-profile">
        <div className="admin-avatar">{(user?.username || 'AD').slice(0, 2).toUpperCase()}</div>
        <div className="admin-info">
          <span className="admin-name">{user?.username || 'admin'}</span>
        </div>
        <LogOut size={18} className="logout-icon" onClick={logout} title="Выйти" />
      </div>
    </aside>
  );
}