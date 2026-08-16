import { useState, useEffect, useRef } from 'react';
import { Loader, ExternalLink } from 'lucide-react';
import { api } from '../lib/api.js';
import { openLink } from '../lib/telegram.js';

const WD_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Calendar() {
  const [data, setData] = useState(null);   // {month, year, days, months, sheet_url, unavailable}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const todayRef = useRef(null);

  async function load(month) {
    setBusy(true); setErr('');
    const res = await api.get(`/calendar${month ? `?month=${encodeURIComponent(month)}` : ''}`);
    setBusy(false);
    if (res.ok) setData(res.data);
    else setErr(res.data?.error === 'not_authorized' ? 'Войдите, чтобы открыть календарь' : 'Не удалось загрузить');
  }

  useEffect(() => { load(); }, []);

  // Автопрокрутка к сегодняшнему дню при первом показе текущего месяца.
  useEffect(() => {
    if (todayRef.current) todayRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [data?.month]);

  if (err) return <p className="dim">{err}</p>;
  if (!data) return <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader className="spin" /></div>;

  const today = todayIso();
  const days = data.days || [];

  return (
    <div>
      <h2 className="section-title">Календарь спортивных событий</h2>

      {data.months?.length > 1 && (
        <div className="st-presets" style={{ marginBottom: 14 }}>
          {data.months.map((m) => (
            <button
              key={m}
              className={`st-preset ${m === data.month ? 'on' : ''}`}
              onClick={() => m !== data.month && !busy && load(m)}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {busy && <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Loader className="spin" /></div>}

      {!busy && data.unavailable && (
        <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
          {`Календарь временно недоступен (${data.unavailable}).`}
        </p>
      )}

      {!busy && !data.unavailable && days.map((d) => {
        const isToday = d.date_iso === today;
        const past = d.date_iso < today;
        const wd = WD_RU[new Date(`${d.date_iso}T12:00:00`).getDay()];
        return (
          <div
            key={d.date_iso}
            ref={isToday ? todayRef : null}
            className={`cal-day ${past ? 'cal-day--past' : ''} ${isToday ? 'cal-day--today' : ''}`}
          >
            <div className="cal-day-head">
              <span className="cal-day-num">{d.day}</span>
              <span className="cal-day-wd">{data.month.toLowerCase()}, {wd}</span>
              {isToday && <span className="cal-today-badge">сегодня</span>}
            </div>
            <ul className="cal-items">
              {d.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </div>
        );
      })}

      {!busy && !data.unavailable && days.length === 0 && (
        <p className="dim">В этом месяце событий нет.</p>
      )}

      {data.sheet_url && (
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => openLink(data.sheet_url)}>
          Открыть полную таблицу <ExternalLink size={15} />
        </button>
      )}
    </div>
  );
}
