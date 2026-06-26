import { useState, useEffect } from 'react';
import {
  Calendar, RefreshCw, Download, ChevronDown, Loader,
  Users, UserCheck, LogIn, Ban, MessageCircle, Send, Bot, Tag, TrendingUp, Filter,
} from 'lucide-react';
import './Analytics.css';

const PERIOD_MAP = {
  'За всё время': 'all', 'Сегодня': 'today', 'За 24 часа': '24h',
  'За неделю': 'week', 'За месяц': 'month', 'За год': 'year',
};
const PERIODS = ['За всё время', 'Сегодня', 'За 24 часа', 'За неделю', 'За месяц', 'За год'];

const EMPTY = {
  audience: { total: 0, active: 0, blocked: 0, registered: 0, guests: 0, loggedIn: 0, newUsers: 0 },
  growth: [], segments: { role: [], traffic: [], phoneFilled: 0, nameFilled: 0 },
  funnel: [], support: { chats: 0, messages: 0, fromUsers: 0, periodMessages: 0 },
  broadcasts: { panelCount: 0, panelRecipients: 0, panelDelivered: 0, panelFailed: 0, botCount: 0, botSent: 0, botErrors: 0 },
  tags: [],
};

const ru = (n) => Number(n || 0).toLocaleString('ru-RU');
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) : '0.0');

/* ── KPI big card ─────────────────────────────────────────────────────────── */
function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className={`an-kpi ${tone || ''}`}>
      <div className="an-kpi-top">
        <div className="an-kpi-ic"><Icon size={18} /></div>
        <span className="an-kpi-label">{label}</span>
      </div>
      <div className="an-kpi-value">{ru(value)}</div>
      {sub && <div className="an-kpi-sub">{sub}</div>}
    </div>
  );
}

/* ── Card wrapper ─────────────────────────────────────────────────────────── */
function Card({ title, hint, children, className }) {
  return (
    <div className={`an-card ${className || ''}`}>
      <div className="an-card-head">
        <span className="an-card-title">{title}</span>
        {hint && <span className="an-card-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ── Horizontal bar list (stacked = full labels on their own line) ────────── */
function BarList({ data, color = 'var(--color-orange)', empty = 'Нет данных', stacked = false }) {
  if (!data?.length) return <div className="an-empty">{empty}</div>;
  const max = Math.max(...data.map((d) => d.count), 1);
  if (stacked) {
    return (
      <div className="an-bars">
        {data.map((d, i) => (
          <div className="an-bar-stack" key={i}>
            <div className="an-bar-stack-top">
              <span className="an-bar-slabel">{d.label}</span>
              <span className="an-bar-val">{ru(d.count)}</span>
            </div>
            <div className="an-bar-track">
              <div className="an-bar-fill" style={{ width: `${(d.count / max) * 100}%`, background: color }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="an-bars">
      {data.map((d, i) => (
        <div className="an-bar-row" key={i}>
          <span className="an-bar-label" title={d.label}>{d.label}</span>
          <div className="an-bar-track">
            <div className="an-bar-fill" style={{ width: `${(d.count / max) * 100}%`, background: color }} />
          </div>
          <span className="an-bar-val">{ru(d.count)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Funnel ───────────────────────────────────────────────────────────────── */
function Funnel({ data }) {
  if (!data?.length) return <div className="an-empty">Нет данных</div>;
  const top = data[0]?.count || 1;
  return (
    <div className="an-funnel">
      {data.map((s, i) => {
        const w = Math.max(4, (s.count / top) * 100);
        const conv = i === 0 ? 100 : pct(s.count, top);
        return (
          <div className="an-funnel-step" key={i}>
            <div className="an-funnel-meta">
              <span className="an-funnel-stage">{s.stage}</span>
              <span className="an-funnel-count">{ru(s.count)} <em>· {conv}%</em></span>
            </div>
            <div className="an-funnel-bar-wrap">
              <div className="an-funnel-bar" style={{ width: `${w}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Area chart: SVG area/line + HTML dots (round, не сплющены) + hover ────── */
function AreaChart({ data }) {
  const [hover, setHover] = useState(null);
  if (!data?.length) return <div className="an-empty">Нет данных за период</div>;
  const max = Math.max(...data.map((d) => d.count), 1);
  const n = data.length;
  const xPct = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (v) => (1 - v / max) * 100;
  const line = data.map((d, i) => `${xPct(i)},${yPct(d.count)}`).join(' ');
  const area = `0,100 ${line} 100,100`;
  const ticks = [max, Math.round(max * 0.66), Math.round(max * 0.33), 0];
  const step = Math.max(1, Math.ceil(n / 6));
  return (
    <div className="an-chart2">
      <div className="an-chart2-grid">
        <div className="an-yaxis">{ticks.map((t, i) => <span key={i}>{ru(t)}</span>)}</div>
        <div className="an-plot">
          {ticks.map((_, i) => <div key={i} className="an-grid-line" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />)}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="an-chart2-svg">
            <defs>
              <linearGradient id="anFill2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-orange)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-orange)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={area} fill="url(#anFill2)" />
            <polyline points={line} fill="none" stroke="var(--color-orange)" strokeWidth="2"
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {data.map((d, i) => (
            <div key={i} className="an-dot" style={{ left: `${xPct(i)}%`, top: `${yPct(d.count)}%` }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
          {hover != null && (
            <div className="an-tip" style={{ left: `${xPct(hover)}%`, top: `${yPct(data[hover].count)}%` }}>
              <b>{ru(data[hover].count)}</b><span>{data[hover].date}</span>
            </div>
          )}
        </div>
      </div>
      <div className="an-xaxis">
        {data.map((d, i) => (i % step === 0 || i === n - 1)
          ? <span key={i} style={{ left: `${xPct(i)}%` }}>{d.date}</span> : null)}
      </div>
    </div>
  );
}

/* ── Donut (SVG) ──────────────────────────────────────────────────────────── */
function Donut({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <div className="an-donut-wrap">
      <svg viewBox="0 0 42 42" className="an-donut">
        <circle cx="21" cy="21" r="15.915" fill="none" stroke="#23233a" strokeWidth="5" />
        {segments.map((s, i) => {
          const frac = (s.value / total) * 100;
          const el = (
            <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={s.color} strokeWidth="5"
              strokeDasharray={`${frac} ${100 - frac}`} strokeDashoffset={25 - acc} strokeLinecap="butt" />
          );
          acc += frac; return el;
        })}
        <text x="21" y="20.5" className="an-donut-num">{ru(total)}</text>
        <text x="21" y="25" className="an-donut-cap">всего</text>
      </svg>
      <div className="an-donut-legend">
        {segments.map((s, i) => (
          <div className="an-leg" key={i}>
            <span className="an-leg-dot" style={{ background: s.color }} />
            <span className="an-leg-label">{s.label}</span>
            <span className="an-leg-val">{ru(s.value)} · {pct(s.value, total)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Small stat row ───────────────────────────────────────────────────────── */
function Stat({ label, value, tone }) {
  return (
    <div className="an-stat">
      <span className="an-stat-label">{label}</span>
      <span className={`an-stat-val ${tone || ''}`}>{ru(value)}</span>
    </div>
  );
}

export default function Analytics() {
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('За месяц');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isCustomRange, setIsCustomRange] = useState(false);

  const load = async (opts) => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (opts?.from && opts?.to) { params.from = opts.from; params.to = opts.to; }
      else params.period = PERIOD_MAP[opts?.period || selectedPeriod] || 'month';
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`/api/analytics?${qs}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData({ ...EMPTY, ...(await res.json()) });
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  useEffect(() => { load({ period: selectedPeriod }); /* eslint-disable-next-line */ }, []);

  const periodLabel = isCustomRange && dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString('ru-RU')} — ${new Date(dateTo).toLocaleDateString('ru-RU')}`
    : selectedPeriod;

  const a = data.audience;
  const activeGuests = Math.max(0, a.active - a.registered);

  const exportTxt = () => {
    const s = data; const L = [
      'ОТЧЁТ ПО АНАЛИТИКЕ', `Период: ${periodLabel}`, `Дата: ${new Date().toLocaleDateString('ru-RU')}`,
      '─'.repeat(40), 'АУДИТОРИЯ',
      `Всего в боте: ${ru(a.total)}`, `Завершили регистрацию: ${ru(a.registered)}`,
      `Залогинены: ${ru(a.loggedIn)}`, `Активные: ${ru(a.active)}`, `Заблокировали бота: ${ru(a.blocked)}`,
      `Новых за период: +${ru(a.newUsers)}`,
      '─'.repeat(40), 'ПОДДЕРЖКА',
      `Диалогов: ${ru(s.support.chats)}`, `Сообщений от юзеров: ${ru(s.support.fromUsers)}`,
      '─'.repeat(40), 'РАССЫЛКИ',
      `Из панели: ${ru(s.broadcasts.panelCount)} (доставлено ${ru(s.broadcasts.panelDelivered)})`,
      `Из бота: ${ru(s.broadcasts.botCount)} (отправлено ${ru(s.broadcasts.botSent)})`,
    ];
    const blob = new Blob([L.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const el = document.createElement('a');
    el.href = url; el.download = `analytics_${new Date().toISOString().slice(0, 10)}.txt`; el.click();
    URL.revokeObjectURL(url); setIsExportOpen(false);
  };

  return (
    <div className="analytics-container">
      {/* Controls */}
      <div className="analytics-controls">
        <div className="control-wrapper">
          <button className="btn-control" onClick={() => { setIsPeriodOpen(!isPeriodOpen); setIsExportOpen(false); }}>
            <Calendar size={18} />{isCustomRange ? 'Произвольный' : selectedPeriod}<ChevronDown size={16} />
          </button>
          {isPeriodOpen && (
            <div className="dropdown-menu">
              {PERIODS.map((p) => (
                <button key={p} className={`dropdown-item ${selectedPeriod === p && !isCustomRange ? 'active' : ''}`}
                  onClick={() => { setSelectedPeriod(p); setIsCustomRange(false); setDateFrom(''); setDateTo(''); setIsPeriodOpen(false); load({ period: p }); }}>
                  {p}
                </button>
              ))}
              <div className="dropdown-separator" />
              <button className={`dropdown-item ${isCustomRange ? 'active' : ''}`}
                onClick={() => { setIsPeriodOpen(false); setIsCustomRange(true); setSelectedPeriod('Произвольный период'); }}>
                <Calendar size={14} style={{ marginRight: 8 }} />Выбрать даты...
              </button>
            </div>
          )}
        </div>
        {isCustomRange && (
          <div className="date-range-picker">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="date-input" />
            <span className="date-sep">—</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="date-input" />
          </div>
        )}
        <button className="btn-control primary"
          onClick={() => (isCustomRange && dateFrom && dateTo ? load({ from: dateFrom, to: dateTo }) : load({ period: selectedPeriod }))}
          disabled={loading}>
          <RefreshCw size={18} className={loading ? 'spin' : ''} />Сформировать
        </button>
        <div className="control-wrapper" style={{ marginLeft: 'auto' }}>
          <button className="btn-control" onClick={() => { setIsExportOpen(!isExportOpen); setIsPeriodOpen(false); }}>
            <Download size={18} />Экспорт<ChevronDown size={16} />
          </button>
          {isExportOpen && (
            <div className="dropdown-menu" style={{ right: 0, left: 'auto', minWidth: '150px' }}>
              <button className="dropdown-item" onClick={exportTxt}>в Текст (.txt)</button>
            </div>
          )}
        </div>
      </div>

      <div className="analytics-period-label">Данные: <span>{periodLabel}</span></div>
      {error && <div className="analytics-error">Ошибка загрузки: {error}</div>}

      {loading ? (
        <div className="an-loading"><Loader size={28} className="spin" /></div>
      ) : (
        <>
          {/* KPI hero */}
          <div className="an-kpi-row">
            <Kpi icon={Users} label="Всего в боте" value={a.total} sub={`+${ru(a.newUsers)} за период`} />
            <Kpi icon={UserCheck} label="Завершили регистрацию" value={a.registered} sub={`${pct(a.registered, a.total)}% от всех`} tone="ok" />
            <Kpi icon={LogIn} label="Залогинены (email)" value={a.loggedIn} sub={`${pct(a.loggedIn, a.total)}% от всех`} />
            <Kpi icon={Ban} label="Заблокировали бота" value={a.blocked} sub={`${pct(a.blocked, a.total)}% от всех`} tone="danger" />
          </div>

          {/* Состав + воронка */}
          <div className="an-2col">
            <Card title="Состав аудитории" hint="текущее состояние">
              <Donut segments={[
                { label: 'Завершили регистрацию', value: a.registered, color: 'var(--color-orange)' },
                { label: 'Активные гости', value: activeGuests, color: '#4a8cff' },
                { label: 'Заблокировали бота', value: a.blocked, color: '#ef4444' },
              ]} />
            </Card>
            <Card title="Воронка входа в бот" hint="текущее состояние">
              <Funnel data={data.funnel} />
            </Card>
          </div>

          {/* Рост */}
          <Card title="Рост базы бота" hint={<><TrendingUp size={13} /> новые по {periodLabel.toLowerCase()}</>}>
            <AreaChart data={data.growth} />
          </Card>

          {/* Сегменты */}
          <div className="an-2col">
            <Card title="Тип партнёра" hint={<><Filter size={13} /> role</>}>
              <BarList data={data.segments.role} empty="Поле не заполнено" />
            </Card>
            <Card title="Тип трафика" hint={<><Filter size={13} /> graph</>}>
              <BarList data={data.segments.traffic} color="#4a8cff" empty="Поле не заполнено" />
            </Card>
          </div>

          {/* Поддержка + рассылки */}
          <div className="an-2col">
            <Card title="Поддержка" hint={<><MessageCircle size={13} /> чаты</>}>
              <Stat label="Диалогов всего" value={data.support.chats} />
              <Stat label="Сообщений всего" value={data.support.messages} />
              <Stat label="Из них от юзеров" value={data.support.fromUsers} />
              <Stat label="Сообщений за период" value={data.support.periodMessages} tone="accent" />
            </Card>
            <Card title="Рассылки" hint={<><Send size={13} /> две системы</>}>
              <div className="an-sub-title"><Send size={13} /> Из панели</div>
              <Stat label="Рассылок" value={data.broadcasts.panelCount} />
              <Stat label="Доставлено" value={data.broadcasts.panelDelivered} tone="ok" />
              <Stat label="Ошибок" value={data.broadcasts.panelFailed} tone="danger" />
              <div className="an-sub-title" style={{ marginTop: 10 }}><Bot size={13} /> Из бота (пуши)</div>
              <Stat label="Рассылок" value={data.broadcasts.botCount} />
              <Stat label="Отправлено" value={data.broadcasts.botSent} tone="ok" />
              <Stat label="Ошибок" value={data.broadcasts.botErrors} tone="danger" />
            </Card>
          </div>

          {/* Теги */}
          <Card title="Сегменты по тегам" hint={<><Tag size={13} /> wl_admin_user_tags</>}>
            <BarList data={data.tags} color="#a06bff" empty="Тегов нет" stacked />
          </Card>
        </>
      )}
    </div>
  );
}
