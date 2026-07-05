import { useState } from 'react';
import { Loader, LogOut, Mail, User as UserIcon, AtSign } from 'lucide-react';
import { api } from '../lib/api.js';
import { haptic } from '../lib/telegram.js';

export default function Profile({ me, refreshMe, goBack }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function logout() {
    if (!window.confirm('Выйти из аккаунта?')) return;
    setBusy(true); setErr('');
    const res = await api.post('/auth/logout');
    setBusy(false);
    if (res.ok) {
      haptic('medium');
      await refreshMe();
      goBack();
    } else {
      setErr(res.data?.message || 'Не удалось выйти, попробуйте позже');
    }
  }

  return (
    <div>
      <h2 className="section-title">Профиль</h2>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <UserIcon size={16} style={{ color: 'var(--c-orange)' }} />
          <span>{me?.name || me?.tg?.first_name || '—'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <AtSign size={16} style={{ color: 'var(--c-orange)' }} />
          <span className="dim">{me?.tg?.username ? `@${me.tg.username}` : '—'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mail size={16} style={{ color: 'var(--c-orange)' }} />
          <span>{me?.email || '—'}</span>
        </div>
      </div>

      <button className="btn btn-danger" onClick={logout} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? <Loader size={17} className="spin" /> : <><LogOut size={17} /> Выйти из аккаунта</>}
      </button>

      {err && <p style={{ color: 'var(--c-red)', fontSize: 13, marginTop: 12 }}>{err}</p>}
    </div>
  );
}
