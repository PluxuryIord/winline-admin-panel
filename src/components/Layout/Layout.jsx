import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import './Layout.css';

export default function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className={`layout-container${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {isMobileMenuOpen && (
        <div className="mobile-overlay" onClick={closeMobileMenu}></div>
      )}

      <Sidebar
        isMobileMenuOpen={isMobileMenuOpen}
        closeMobileMenu={closeMobileMenu}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
      />

      <div className="main-wrapper">
        <Header setIsMobileMenuOpen={setIsMobileMenuOpen} />

        <main className="workspace">
          <Outlet />
        </main>
      </div>
    </div>
  );
}