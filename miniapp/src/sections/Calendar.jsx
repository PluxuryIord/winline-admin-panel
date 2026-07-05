import { useState, useEffect } from 'react';
import { Loader, ExternalLink, CalendarDays } from 'lucide-react';
import { api } from '../lib/api.js';
import { openLink } from '../lib/telegram.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function Calendar() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api.get('/calendar').then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setErr(res.data?.error === 'not_authorized' ? 'Войдите, чтобы открыть календарь' : 'Не удалось загрузить');
    });
    return () => { alive = false; };
  }, []);

  if (err) return <p className="dim">{err}</p>;
  if (!data) return <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader className="spin" /></div>;

  const today = todayIso();
  const events = data.events || [];

  return (
    <div>
      <h2 className="section-title">Календарь мероприятий</h2>

      {data.unavailable && (
        <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
          {`Календарь временно недоступен (${data.unavailable}).`}
        </p>
      )}

      {events.map((e, i) => {
        const past = e.date_iso && e.date_iso < today;
        return (
          <div key={i} className={`cal-card ${past ? 'cal-card--past' : ''}`}>
            <div className="cal-date">
              <CalendarDays size={14} />
              {e.date_raw || 'дата уточняется'}
            </div>
            <div className="cal-title">{e.title}</div>
            {e.fields.map((f, j) => (
              /^https?:\/\//.test(f.value)
                ? (
                  <button key={j} className="cal-link" onClick={() => openLink(f.value)}>
                    {f.header} <ExternalLink size={13} />
                  </button>
                )
                : <div key={j} className="cal-field"><span>{f.header}:</span> {f.value}</div>
            ))}
          </div>
        );
      })}

      {!data.unavailable && events.length === 0 && (
        <p className="dim">Ближайших мероприятий пока нет.</p>
      )}

      {data.sheet_url && (
        <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => openLink(data.sheet_url)}>
          Открыть полную таблицу <ExternalLink size={15} />
        </button>
      )}
    </div>
  );
}
