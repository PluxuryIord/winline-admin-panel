import { Menu } from 'lucide-react';

export default function Header({ setIsMobileMenuOpen }) {
  return (
    <header className="header">
      {/* Кнопка гамбургера для мобилок */}
      <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
        <Menu size={24} />
      </button>
    </header>
  );
}