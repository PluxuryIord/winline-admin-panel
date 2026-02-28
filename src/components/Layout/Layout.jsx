import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

export default function Layout() {
  // Состояние для мобильного меню живет здесь и передается детям
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="layout-container">
      {/* Затемнение фона на мобилках */}
      {isMobileMenuOpen && (
        <div className="mobile-overlay" onClick={closeMobileMenu}></div>
      )}

      {/* Вынесли сайдбар в отдельный компонент */}
      <Sidebar 
        isMobileMenuOpen={isMobileMenuOpen} 
        closeMobileMenu={closeMobileMenu} 
      />

      <div className="main-wrapper">
        {/* Вынесли шапку в отдельный компонент */}
        <Header setIsMobileMenuOpen={setIsMobileMenuOpen} />

        <main className="workspace">
          <Outlet />
        </main>
      </div>
    </div>
  );
}