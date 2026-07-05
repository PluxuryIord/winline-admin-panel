import { useState } from 'react';

// Hand-rolled SVG charts adapted from the panel's Analytics page (AreaChart +
// Donut) for a touch screen: tap a dot to pin the tooltip.

const ru = (n) => Number(n || 0).toLocaleString('ru-RU');

// Compact ruble sum for tight spots (the donut hole): 11 455 374 → «11,5 млн».
// Full amounts stay in the legend rows next to it.
function compactRub(n) {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (a >= 1e5) return `${Math.round(v / 1e3).toLocaleString('ru-RU')} тыс`;
  return ru(v);
}

export function AreaChart({ data, valueKey = 'value', labelKey = 'label' }) {
  const [pick, setPick] = useState(null);
  if (!data?.length) return <div className="dim" style={{ padding: 20, textAlign: 'center' }}>Нет данных за период</div>;
  const vals = data.map((d) => Number(d[valueKey] || 0));
  const max = Math.max(...vals, 1);
  const n = data.length;
  const xPct = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (v) => (1 - v / max) * 100;
  const line = data.map((d, i) => `${xPct(i)},${yPct(vals[i])}`).join(' ');
  const area = `0,100 ${line} 100,100`;
  const step = Math.max(1, Math.ceil(n / 5));

  return (
    <div className="ch-wrap">
      <div className="ch-plot" onClick={() => setPick(null)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="ch-svg">
          <defs>
            <linearGradient id="chFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF7E00" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#FF7E00" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#chFill)" />
          <polyline points={line} fill="none" stroke="#FF7E00" strokeWidth="2"
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {data.map((d, i) => (
          <button
            key={i}
            className={`ch-dot ${pick === i ? 'on' : ''}`}
            style={{ left: `${xPct(i)}%`, top: `${yPct(vals[i])}%` }}
            onClick={(e) => { e.stopPropagation(); setPick(pick === i ? null : i); }}
            aria-label={d[labelKey]}
          />
        ))}
        {pick != null && (
          <div className="ch-tip" style={{ left: `${xPct(pick)}%`, top: `${yPct(vals[pick])}%` }}>
            <b>{ru(vals[pick])}</b><span>{data[pick][labelKey]}</span>
          </div>
        )}
      </div>
      <div className="ch-xaxis">
        {data.map((d, i) => (i % step === 0 || i === n - 1)
          ? <span key={i} style={{ left: `${xPct(i)}%` }}>{d[labelKey]}</span> : null)}
      </div>
    </div>
  );
}

export function Donut({ segments, centerLabel = 'всего', money = false }) {
  const total = segments.reduce((s, x) => s + Number(x.value || 0), 0);
  const denom = total || 1;
  let acc = 0;
  return (
    <div className="dn-wrap">
      <svg viewBox="0 0 42 42" className="dn-svg">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#23233a" strokeWidth="5" />
        {segments.map((s, i) => {
          const frac = (Number(s.value || 0) / denom) * 100;
          const el = (
            <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={s.color} strokeWidth="5"
              strokeDasharray={`${frac} ${100 - frac}`} strokeDashoffset={25 - acc} strokeLinecap="butt" />
          );
          acc += frac;
          return el;
        })}
        <text x="21" y="20.5" className="dn-num">{money ? compactRub(total) : ru(total)}</text>
        <text x="21" y="25" className="dn-cap">{money ? `₽ · ${centerLabel}` : centerLabel}</text>
      </svg>
      <div className="dn-legend">
        {segments.map((s, i) => (
          <div className="dn-leg" key={i}>
            <span className="dn-leg-dot" style={{ background: s.color }} />
            <span className="dn-leg-label">{s.label}</span>
            <span className="dn-leg-val">{ru(s.value)}{money ? ' ₽' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCard({ label, value, money = false }) {
  return (
    <div className="st-card">
      <div className="st-val">{ru(value)}{money ? ' ₽' : ''}</div>
      <div className="st-label">{label}</div>
    </div>
  );
}
