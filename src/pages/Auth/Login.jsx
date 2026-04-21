import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { LogIn, Loader, ShieldCheck, ArrowLeft } from 'lucide-react';
import logoSvg from '../../assets/logo.svg';
import './Login.css';

export default function Login() {
  const { login, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('credentials'); // 'credentials' | 'otp'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [otpSession, setOtpSession] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);

  const handleCreds = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setError('');
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      if (result?.needsOtp) {
        setOtpSession(result.otpSession);
        setMaskedEmail(result.maskedEmail || '');
        setStep('otp');
        setOtp('');
      } else {
        navigate('/users', { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = async (e) => {
    e.preventDefault();
    if (otp.trim().length < 4) return;
    setError('');
    setLoading(true);
    try {
      await verifyOtp(otpSession, otp.trim(), trustDevice);
      navigate('/users', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goBackToCreds = () => {
    setStep('credentials');
    setOtp('');
    setOtpSession('');
    setError('');
  };

  if (step === 'otp') {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleOtp}>
          <div className="login-logo">
            <img src={logoSvg} alt="Winline Partners" className="login-logo-img" />
          </div>
          <p className="login-subtitle">
            Код подтверждения отправлен на {maskedEmail || 'вашу почту'}
          </p>

          {error && <div className="login-error">{error}</div>}

          <div className="login-field">
            <label className="login-label">Код из письма</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="login-input login-otp-input"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              autoFocus
              autoComplete="one-time-code"
            />
          </div>

          <label className="login-remember">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={e => setTrustDevice(e.target.checked)}
            />
            <span>Не спрашивать код 30 дней на этом устройстве</span>
          </label>

          <button
            type="submit"
            className="login-btn"
            disabled={loading || otp.length < 6}
          >
            {loading ? <Loader size={18} className="spinner" /> : <ShieldCheck size={18} />}
            {loading ? 'Проверка...' : 'Подтвердить'}
          </button>

          <button type="button" className="login-back" onClick={goBackToCreds} disabled={loading}>
            <ArrowLeft size={14} /> Назад ко входу
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleCreds}>
        <div className="login-logo">
          <img src={logoSvg} alt="Winline Partners" className="login-logo-img" />
        </div>
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
