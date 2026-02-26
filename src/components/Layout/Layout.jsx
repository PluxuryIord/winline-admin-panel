import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
// Добавили Menu и X для мобильной кнопки
import { Users, MessageSquare, Send, BookOpen, Database, BarChart, Calendar, Settings, Bell, LogOut, Menu, X } from 'lucide-react';
import './Layout.css';

export default function Layout() {
  // Состояние для мобильного меню
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Функция для закрытия меню при клике на ссылку (чтобы меню не оставалось висеть)
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="layout-container">
      
      {/* Затемнение фона на мобилках при открытом меню */}
      {isMobileMenuOpen && (
        <div className="mobile-overlay" onClick={closeMobileMenu}></div>
      )}

      {/* Левая панель (добавляем класс open, если стейт true) */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        
        <div className="logo-area">
          <h2>Winline <span>Admin</span></h2>
          {/* Кнопка закрытия меню внутри самого сайдбара (только для мобилок) */}
          <button className="mobile-close-btn" onClick={closeMobileMenu}>
            <X size={24} />
          </button>
        </div>
        
        <nav className="menu">
          {/* В каждую ссылку добавляем onClick={closeMobileMenu} */}
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

      {/* Правая часть */}
      <div className="main-wrapper">
        <header className="header">
          {/* Кнопка гамбургера для мобилок (слева в шапке) */}
          <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu size={24} />
          </button>

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