import { NavLink } from 'react-router-dom';
import { 
  Users, MessageSquare, Send, BookOpen, 
  Database, BarChart, Calendar, LogOut, X 
} from 'lucide-react';

export default function Sidebar({ isMobileMenuOpen, closeMobileMenu }) {
  return (
    <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
      <div className="logo-area">
        <h2>Winline <span>Admin</span></h2>
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
          </NavLink>
        ))}
      </nav>

      <div className="admin-profile">
        <div className="admin-avatar">AD</div>
        <div className="admin-info">
          <span className="admin-name">admin</span>
        </div>
        <LogOut size={18} className="logout-icon" />
      </div>
    </aside>
  );
}