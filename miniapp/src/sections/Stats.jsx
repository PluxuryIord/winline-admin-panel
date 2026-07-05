import { useState, useEffect, useCallback } from 'react';
import { Loader } from 'lucide-react';
import { api } from '../lib/api.js';
import { AreaChart, Donut, StatCard } from '../components/charts.jsx';

// Periods mirror the bot's get_period_range (MSK): yesterday / previous
// calendar week Mon–Sun / previous calendar month, plus a custom range.
const MSK_OFFSET_MIN = 3 * 60;

function mskToday() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + MSK_OFFSET_MIN * 60000);
}
const iso = (d) => d.toISOString().slice(0, 10);
const dm = (isoStr) => `${isoStr.slice(8, 10)}.${isoStr.slice(5, 7)}`;

function presetRange(preset) {
  const t = mskToday();
  const today = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  if (preset === 'yesterday') {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - 1);
    return { start: iso(d), end: iso(d) };
  }
  if (preset === 'week') {
    const dow = (today.getUTCDay() + 6) % 7; // Mon=0
    const thisMon = new Date(today); thisMon.setUTCDate(thisMon.getUTCDate() - dow);
    const lastMon = new Date(thisMon); lastMon.setUTCDate(lastMon.getUTCDate() - 7);
    const lastSun = new Date(lastMon); lastSun.setUTCDate(lastSun.getUTCDate() + 6);
    return { start: iso(lastMon), end: iso(lastSun) };
  }
  // month: previous calendar month
  const firstThis = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastPrev = new Date(firstThis); lastPrev.setUTCDate(0);
  const firstPrev = new Date(Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1));
  return { start: iso(firstPrev), end: iso(lastPrev) };
}

const PRESETS = [
  { id: 'yesterday', label: 'Вчера' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'custom', label: 'Период' },
];

const METRICS = [
  { key: 'clicks', label: '👁 Клики' },
  { key: 'goal11Quantity', label: '📝 РЕГ' },
  { key: 'goal12Quantity', label: '💵 ДЕП' },
  { key: 'goal13Quantity', label: '🔁 ДЕП2' },
];

export default function Stats() {
  const [preset, setPreset] = useState('week');
  const [range, setRange] = useState(presetRange('week'));
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [data, setData] = useState(null);   // {days, totals} | {unavailable}
  const [metric, setMetric] = useState('clicks');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (r) => {
    setBusy(true); setErr('');
    const res = await api.get(`/stats/daily?start=${r.start}&end=${r.end}`);
    setBusy(false);
    if (res.ok) setData(res.data);
    else if (res.status === 404) setErr('Статистика недоступна: профиль не найден. Попробуйте перезайти.');
    else setErr(res.data?.error || 'Не удалось загрузить');
  }, []);

  useEffect(() => { load(range); }, []); // первый рендер — неделя

  function pickPreset(id) {
    setPreset(id);
    if (id === 'custom') return; // ждём дат
    const r = presetRange(id);
    setRange(r);
    load(r);
  }

  function applyCustom() {
    if (!custom.start || !custom.end) return;
    if (custom.end < custom.start) { setErr('Дата «по» раньше даты «с»'); return; }
    const days = (new Date(custom.end) - new Date(custom.start)) / 86400000;
    if (days > 92) { setErr('Максимум 92 дня'); return; }
    const r = { start: custom.start, end: custom.end };
    setRange(r);
    load(r);
  }

  const totals = data?.totals || {};
  const days = data?.days || [];
  const unavailable = data?.unavailable;
  const chartData = days.map((d) => ({ label: dm(d.date), value: d[metric] || 0 }));
  const showChart = days.length > 1;

  return (
    <div>
      <h2 className="section-title">Моя статистика</h2>

      <div className="st-presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={`st-preset ${preset === p.id ? 'on' : ''}`} onClick={() => pickPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="st-range">
          <input type="date" value={custom.start} max={custom.end || undefined}
            onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
          <span className="dim">—</span>
          <input type="date" value={custom.end} min={custom.start || undefined}
            onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} />
          <button className="btn btn-primary st-range-go" onClick={applyCustom} disabled={busy || !custom.start || !custom.end}>
            ОК
          </button>
        </div>
      )}

      <p className="dim" style={{ fontSize: 12, marginBottom: 12 }}>
        {dm(range.start)}.{range.start.slice(0, 4)} — {dm(range.end)}.{range.end.slice(0, 4)}
      </p>

      {busy && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Loader className="spin" /></div>}
      {!busy && err && <p style={{ color: 'var(--c-red)', fontSize: 13 }}>{err}</p>}
      {!busy && !err && unavailable && (
        <p className="dim" style={{ fontSize: 13 }}>Статистика временно недоступна ({unavailable}). Попробуйте позже.</p>
      )}

      {!busy && !err && !unavailable && data && (
        <>
          <div className="st-grid">
            {METRICS.map((m) => <StatCard key={m.key} label={m.label} value={totals[m.key] || 0} />)}
          </div>

          {showChart && (
            <div className="card">
              <div className="st-metric-tabs">
                {METRICS.map((m) => (
                  <button key={m.key} className={`st-mtab ${metric === m.key ? 'on' : ''}`} onClick={() => setMetric(m.key)}>
                    {m.label.replace(/^\S+\s/, '')}
                  </button>
                ))}
              </div>
              <AreaChart data={chartData} valueKey="value" labelKey="label" />
            </div>
          )}

          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 10 }}>💰 Комиссия</div>
            <Donut
              money
              centerLabel="комиссия"
              segments={[
                { label: 'Подтверждена', value: totals.rewardConfirmed || 0, color: '#4bd97a' },
                { label: 'В обработке', value: totals.rewardCreated || 0, color: '#FF7E00' },
                { label: 'Аннулирована', value: totals.rewardCanceled || 0, color: '#ef4444' },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
