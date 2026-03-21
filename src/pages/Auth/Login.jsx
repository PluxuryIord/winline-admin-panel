import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { LogIn, Loader } from 'lucide-react';
import './Login.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/users', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          <img src="/logo.svg" alt="Winline Partners" className="login-logo-img" />
        </div>
        <h1 className="login-title">Winline Admin</h1>
        <p className="login-subtitle">Войдите в панель управления</p>

        {error && <div className="login-error">{error}</div>}

        <div className="login-field">
          <label className="login-label">Логин</label>
          <input
            type="text"
            className="login-input"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Введите логин"
            autoFocus
            autoComplete="username"
          />
        </div>

        <div className="login-field">
          <label className="login-label">Пароль</label>
          <input
            type="password"
            className="login-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Введите пароль"
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="login-btn" disabled={loading || !username.trim() || !password.trim()}>
          {loading ? <Loader size={18} className="spinner" /> : <LogIn size={18} />}
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
