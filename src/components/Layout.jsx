import { NavLink, Outlet } from 'react-router-dom';
// Добавили иконку LogOut для кнопки выхода в профиле
import { Users, MessageSquare, Send, BookOpen, Database, BarChart, Calendar, Settings, Bell, LogOut } from 'lucide-react';
import './Layout.css';

export default function Layout() {
  const menuItems = [
    { name: 'Пользователи', path: '/users', icon: <Users size={18} /> },
    { name: 'Чаты', path: '/chats', icon: <MessageSquare size={18} /> },
    { name: 'Рассылки и контент', path: '/mailings', icon: <Send size={18} /> },
    { name: 'Сценарии', path: '/scenarios', icon: <BookOpen size={18} /> },
    { name: 'База знаний', path: '/knowledge', icon: <Database size={18} /> },
    { name: 'Аналитика', path: '/analytics', icon: <BarChart size={18} /> },
    { name: 'Работа на ивенте', path: '/events', icon: <Calendar size={18} /> },
  ];

  return (
    <div className="layout-container">
      {/* Левая панель */}
      <aside className="sidebar">
        
        {/* Логотип в стиле Winline */}
        <div className="logo-area">
          <h2>Admin <span>Panel</span></h2>
        </div>
        
        {/* Навигация */}
        <nav className="menu">
          {menuItems.map((item) => (
            <NavLink 
              to={item.path} 
              key={item.path} 
              // NavLink сам проверяет активна ли ссылка (isActive) 
              // и добавляет нужные классы
              className={({ isActive }) => isActive ? "menu-item active" : "menu-item"}
            >
              {/* Обертка для иконки, чтобы сделать ей фон */}
              <div className="icon-wrapper">
                {item.icon}
              </div>
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* Профиль администратора (прижат к низу) */}
        <div className="admin-profile">
          <div className="admin-avatar">AD</div>
          <div className="admin-info">
            <span className="admin-name">admin</span>
          </div>
          <LogOut size={18} className="logout-icon" />
        </div>

      </aside>

      {/* Правая часть: Шапка + Рабочее поле */}
      <div className="main-wrapper">
        <header className="header">
          <div className="header-actions">
            <Bell size={20} className="icon-orange" />
            <Settings size={20} className="icon-orange" />
          </div>
        </header>

        <main className="workspace">
          <Outlet />
        </main>
      </div>
    </div>
  );
}