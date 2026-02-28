import { Settings, Bell, Menu } from 'lucide-react';

export default function Header({ setIsMobileMenuOpen }) {
  return (
    <header className="header">
      {/* Кнопка гамбургера для мобилок */}
      <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
        <Menu size={24} />
      </button>

      <div className="header-actions">
        <Bell size={20} className="icon-orange" />
        <Settings size={20} className="icon-orange" />
      </div>
    </header>
  );
}