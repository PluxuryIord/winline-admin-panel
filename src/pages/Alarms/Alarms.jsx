import { useState, useEffect, useCallback } from 'react';
import {
  Loader, Mail, Globe, Clock, XCircle, CheckCircle2, MousePointerClick,
  Plus, Trash2, Check, AlertTriangle, ScrollText, RefreshCw, Info,
} from 'lucide-react';
import { api } from '../../utils/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import './Alarms.css';

// Per-trigger UI metadata (server is the source of truth for values).
const TRIGGER_META = {
  email_unconfirmed: {
    icon: Mail,
    desc: 'Партнёр зарегистрировался, но не подтвердил email дольше указанного срока.',
    placeholders: ['{first_name}'],
  },
  no_site: {
    icon: Globe,
    desc: 'Партнёр зарегистрирован дольше срока, но не создал ни одной площадки.',
    placeholders: ['{first_name}'],
  },
  site_moderation: {
    icon: Clock,
    desc: 'Площадка висит на модерации (статус «на модерации») дольше указанного срока.',
    placeholders: ['{first_name}', '{site_name}', '{site_url}'],
  },
  site_rejected: {
    icon: XCircle,
    desc: 'Площадку только что отклонили. Срабатывает на сам факт перехода в «отклонена».',
    placeholders: ['{first_name}', '{reason}', '{site_name}'],
  },
  site_approved: {
    icon: CheckCircle2,
    desc: 'Площадку только что одобрили (модерация → активна).',
    placeholders: ['{first_name}', '{site_name}'],
  },
  no_clicks: {
    icon: MousePointerClick,
    desc: 'Есть активная площадка дольше срока, но кликов 0. ⚠️ Данные по кликам в зеркале неполные — возможны ложные срабатывания.',
    placeholders: ['{first_name}', '{site_name}', '{site_url}'],
  },
};

const UNIT_OPTIONS = [
  { value: 'minutes', label: 'минут' },
  { value: 'hours', label: 'часов' },
  { value: 'days', label: 'дней' },
];

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) +
    ' ' + dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`alarm-toggle ${checked ? 'on' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
    >
      <span className="alarm-toggle-knob" />
    </button>
  );
}

function RuleCard({ rule, canEdit, onSaved }) {
  const meta = TRIGGER_META[rule.trigger_type] || {};
  const Icon = meta.icon || Info;

  const [enabled, setEnabled] = useState(rule.enabled);
  const [thrValue, setThrValue] = useState(rule.threshold_value ?? '');
  const [thrUnit, setThrUnit] = useState(rule.threshold_unit || 'hours');
  const [message, setMessage] = useState(rule.message_text || '');
  const [buttons, setButtons] = useState(rule.buttons || []);
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [errMsg, setErrMsg] = useState('');

  // Re-sync if parent reloads
  useEffect(() => {
    setEnabled(rule.enabled);
    setThrValue(rule.threshold_value ?? '');
    setThrUnit(rule.threshold_unit || 'hours');
    setMessage(rule.message_text || '');
    setButtons(rule.buttons || []);
  }, [rule]);

  const dirty =
    enabled !== rule.enabled ||
    String(thrValue) !== String(rule.threshold_value ?? '') ||
    thrUnit !== (rule.threshold_unit || 'hours') ||
    message !== (rule.message_text || '') ||
    JSON.stringify(buttons) !== JSON.stringify(rule.buttons || []);

  async function persist(patch) {
    setStatus('saving');
    setErrMsg('');
    try {
      const body = {
        enabled,
        message_text: message,
        buttons,
        ...(rule.has_threshold ? { threshold_value: Number(thrValue), threshold_unit: thrUnit } : {}),
        ...patch,
      };
      const res = await api.put(`/api/alarms/${rule.id}`, body);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Ошибка сохранения');
      }
      const data = await res.json();
      setStatus('saved');
      onSaved(data.rule);
      setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      setStatus('error');
      setErrMsg(e.message);
    }
  }

  function toggleEnabled(next) {
    setEnabled(next);
    // toggle persists immediately (uses the currently edited content too)
    persist({ enabled: next });
  }

  function updateButton(i, key, val) {
    setButtons((bs) => bs.map((b, idx) => (idx === i ? { ...b, [key]: val } : b)));
  }
  function addButton() { setButtons((bs) => [...bs, { text: '', url: '' }]); }
  function removeButton(i) { setButtons((bs) => bs.filter((_, idx) => idx !== i)); }

  return (
    <div className={`alarm-card ${enabled ? 'enabled' : ''}`}>
      <div className="alarm-card-head">
        <div className="alarm-card-icon"><Icon size={20} /></div>
        <div className="alarm-card-titles">
          <div className="alarm-card-name">{rule.name}</div>
          <div className="alarm-card-desc">{meta.desc}</div>
        </div>
        <Toggle checked={enabled} onChange={toggleEnabled} disabled={!canEdit} />
      </div>

      <div className="alarm-card-body">
        {rule.has_threshold && (
          <div className="alarm-field alarm-field-threshold">
            <label>Срок</label>
            <div className="alarm-threshold-inputs">
              <input
                type="number" min="1"
                value={thrValue}
                onChange={(e) => setThrValue(e.target.value)}
                disabled={!canEdit}
              />
              <select value={thrUnit} onChange={(e) => setThrUnit(e.target.value)} disabled={!canEdit}>
                {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="alarm-field">
          <label>Текст сообщения</label>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!canEdit}
            placeholder="Текст, который получит партнёр…"
          />
          {meta.placeholders?.length > 0 && (
            <div className="alarm-placeholders">
              Подстановки:&nbsp;
              {meta.placeholders.map((p) => (
                <code key={p} onClick={() => canEdit && setMessage((m) => m + ' ' + p)} title="Вставить">{p}</code>
              ))}
            </div>
          )}
        </div>

        <div className="alarm-field">
          <label>Кнопки (необязательно)</label>
          {buttons.map((b, i) => (
            <div className="alarm-button-row" key={i}>
              <input
                placeholder="Текст кнопки" value={b.text}
                onChange={(e) => updateButton(i, 'text', e.target.value)} disabled={!canEdit}
              />
              <input
                placeholder="https://…" value={b.url}
                onChange={(e) => updateButton(i, 'url', e.target.value)} disabled={!canEdit}
              />
              <button className="alarm-icon-btn danger" onClick={() => removeButton(i)} disabled={!canEdit} title="Удалить">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {canEdit && (
            <button className="alarm-add-btn" onClick={addButton}>
              <Plus size={14} /> Добавить кнопку
            </button>
          )}
        </div>
      </div>

      <div className="alarm-card-foot">
        {status === 'error' && <span className="alarm-save-err">{errMsg}</span>}
        {status === 'saved' && <span className="alarm-save-ok"><Check size={14} /> Сохранено</span>}
        {canEdit && (
          <button
            className="alarm-save-btn"
            onClick={() => persist({})}
            disabled={!dirty || status === 'saving'}
          >
            {status === 'saving' ? <Loader size={14} className="spin" /> : 'Сохранить'}
          </button>
        )}
      </div>
    </div>
  );
}

function LogPanel({ canEdit }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/alarms/log?limit=200');
      if (res.ok) setLog((await res.json()).log || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) fetchLog(); }, [open, fetchLog]);

  async function resetLog(scope) {
    const msg = scope === 'all'
      ? 'Удалить ВЕСЬ журнал отправок (включая боевые)? Боевые алармы смогут уйти повторно.'
      : 'Очистить тест-журнал (dry-run)? Это нужно перед переходом в бой.';
    if (!window.confirm(msg)) return;
    setResetting(true);
    try {
      const res = await api.post('/api/alarms/reset-log', { scope });
      if (res.ok) fetchLog();
    } catch { /* ignore */ } finally { setResetting(false); }
  }

  return (
    <div className="alarm-log">
      <button className="alarm-log-toggle" onClick={() => setOpen((o) => !o)}>
        <ScrollText size={16} /> Журнал отправок {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="alarm-log-body">
          <div className="alarm-log-actions">
            <button onClick={fetchLog} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Обновить
            </button>
            {canEdit && (
              <>
                <button onClick={() => resetLog('dry')} disabled={resetting}>Сбросить тест-журнал</button>
                <button className="danger" onClick={() => resetLog('all')} disabled={resetting}>Сбросить всё</button>
              </>
            )}
          </div>
          {loading ? (
            <div className="alarm-log-loading"><Loader size={20} className="spin" /></div>
          ) : log.length === 0 ? (
            <div className="alarm-log-empty">Пока ничего не отправлялось.</div>
          ) : (
            <table className="alarm-log-table">
              <thead>
                <tr><th>Время</th><th>Триггер</th><th>Получатель</th><th>Режим</th><th>Статус</th><th>Текст</th></tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.sent_at)}</td>
                    <td>{r.name}</td>
                    <td>{r.full_name || r.username || r.telegram_id}</td>
                    <td>{r.dry_run ? <span className="alarm-badge dry">тест</span> : <span className="alarm-badge live">бой</span>}</td>
                    <td>{r.ok ? <span className="alarm-badge ok">ok</span> : <span className="alarm-badge fail">сбой</span>}</td>
                    <td className="alarm-log-preview">{r.message_preview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function Alarms() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/alarms');
      if (res.ok) setRules((await res.json()).rules || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function onRuleSaved(updated) {
    setRules((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  }

  return (
    <div className="alarms-container">
      <h1 className="alarms-title">Триггерные алармы</h1>

      <div className="alarms-info">
        <AlertTriangle size={18} />
        <div>
          Правила ниже задают <b>что и когда</b> отправлять. Рубильники безопасности — на стороне бота
          (<code>.env</code>): <code>ALARMS_ENABLED</code> (общий выключатель), <code>ALARMS_DRY_RUN</code>
          {' '}(сухой прогон — ничего не шлёт), <code>ALARM_TEST_CHAT_ID</code> (слать всё себе).
          Пока бот в dry-run или выключен, реальных сообщений не будет. Алармы доходят только до партнёров,
          которые <b>залогинены в боте</b>.
          {!canEdit && <div className="alarms-readonly">Только просмотр — редактирование доступно администраторам.</div>}
        </div>
      </div>

      {loading ? (
        <div className="alarms-loading"><Loader size={26} className="spin" /></div>
      ) : (
        <div className="alarms-grid">
          {rules.map((r) => (
            <RuleCard key={r.id} rule={r} canEdit={canEdit} onSaved={onRuleSaved} />
          ))}
        </div>
      )}

      <LogPanel canEdit={canEdit} />
    </div>
  );
}
