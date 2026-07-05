import { useState, useEffect, useRef } from 'react';
import { Loader, Mail, KeyRound, Pencil } from 'lucide-react';
import { api } from '../lib/api.js';
import { setClosingConfirmation, haptic } from '../lib/telegram.js';

// Email → OTP login. Mirrors the bot's auth flow, executed via /api/miniapp/auth/*.
export default function Login({ refreshMe, goBack }) {
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef(null);

  // Guard against accidental swipe-close while a code is in flight.
  useEffect(() => {
    setClosingConfirmation(step === 'code');
    return () => setClosingConfirmation(false);
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    timerRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  async function requestOtp() {
    setBusy(true); setErr('');
    const res = await api.post('/auth/request-otp', { email: email.trim() });
    setBusy(false);
    if (res.ok) {
      setMasked(res.data.masked_email || email);
      setCooldown(res.data.resend_after_sec || 60);
      setStep('code');
      setCode('');
      haptic('light');
    } else if (res.status === 429 && res.data.retry_after_sec) {
      setErr(`Код уже отправлен. Повтор через ${res.data.retry_after_sec} с.`);
    } else {
      setErr(res.data?.message || res.data?.error || 'Ошибка, попробуйте позже');
    }
  }

  async function verify() {
    setBusy(true); setErr('');
    const res = await api.post('/auth/verify-otp', { code: code.trim() });
    setBusy(false);
    if (res.ok) {
      haptic('medium');
      await refreshMe();
      goBack();
    } else if (res.data?.error === 'wrong_code') {
      setErr(`Неверный код${res.data.attempts_left > 0 ? `, осталось попыток: ${res.data.attempts_left}` : ''}`);
    } else if (res.status === 410) {
      setErr(res.data?.message || 'Код истёк — запросите новый');
      setStep('email');
    } else {
      setErr(res.data?.message || 'Ошибка, попробуйте позже');
    }
  }

  return (
    <div>
      <h2 className="section-title">Вход</h2>

      {step === 'email' && (
        <>
          <p className="dim" style={{ marginBottom: 14, fontSize: 14, lineHeight: 1.5 }}>
            Введите email, указанный при регистрации на платформе Winline Partners.
            Мы отправим на него код подтверждения.
          </p>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email && !busy && requestOtp()}
            />
          </div>
          <button className="btn btn-primary" onClick={requestOtp} disabled={busy || !email.trim()}>
            {busy ? <Loader size={17} className="spin" /> : <><Mail size={17} /> Получить код</>}
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <p className="dim" style={{ marginBottom: 14, fontSize: 14, lineHeight: 1.5 }}>
            Код отправлен на <b style={{ color: 'var(--c-text)' }}>{masked}</b>.
            Он действует 10 минут — проверьте и папку «Спам».
          </p>
          <div className="field">
            <label>Код из письма</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && !busy && verify()}
              style={{ letterSpacing: 8, textAlign: 'center', fontSize: 22 }}
            />
          </div>
          <button className="btn btn-primary" onClick={verify} disabled={busy || code.length !== 6}>
            {busy ? <Loader size={17} className="spin" /> : <><KeyRound size={17} /> Подтвердить</>}
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-ghost" onClick={requestOtp} disabled={busy || cooldown > 0}>
              {cooldown > 0 ? `Повтор через ${cooldown} с` : 'Отправить ещё раз'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setStep('email'); setErr(''); }} disabled={busy}>
              <Pencil size={15} /> Изменить email
            </button>
          </div>
        </>
      )}

      {err && <p style={{ color: 'var(--c-red)', fontSize: 13, marginTop: 12 }}>{err}</p>}
    </div>
  );
}
