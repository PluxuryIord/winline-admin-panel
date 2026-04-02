import { Menu } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function Header({ setIsMobileMenuOpen }) {
  const { user } = useAuth();

  const roleName = user?.role === 'admin' ? 'Админ' : 'Редактор';

  return (
    <header className="header">
      {/* Кнопка гамбургера для мобилок */}
      <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
        <Menu size={24} />
      </button>

      <div className="header-spacer" />

      {user && (
        <div className="header-user-info">
          <span className="header-user-name">{user.display_name || user.displayName || user.username}</span>
          <span className={`header-role-badge role-${user.role}`}>{roleName}</span>
        </div>
      )}
    </header>
  );
}
