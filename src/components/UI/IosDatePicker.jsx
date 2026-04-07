import { useState, useEffect, useRef } from 'react';
import './IosDatePicker.css';

const MONTH_NAMES = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const ITEM_H = 36;
const VISIBLE = 5;

export default function IosDatePicker({ value, onChange, compact = false, minDate = null }) {
  const today = new Date();
  const parsed = value ? new Date(value + 'T00:00:00') : today;
  const [selDay, setSelDay] = useState(parsed.getDate());
  const [selMonth, setSelMonth] = useState(parsed.getMonth());
  const [selYear, setSelYear] = useState(parsed.getFullYear());
  const [open, setOpen] = useState(false);

  const dayRef = useRef(null);
  const monRef = useRef(null);
  const wrapRef = useRef(null);

  // Parse minDate
  const minD = minDate ? new Date(minDate + 'T00:00:00') : null;
  const minDay = minD ? minD.getDate() : 1;
  const minMonth = minD ? minD.getMonth() : 0;
  const minYear = minD ? minD.getFullYear() : 2020;

  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();

  const scrollTo = (ref, val) => {
    if (ref.current) ref.current.scrollTop = val * ITEM_H;
  };

  // Helper: get filtered index for a value
  const filteredDayIdx = () => {
    let vi = 0;
    for (let i = 0; i < daysInMonth; i++) {
      if (isDayDisabled(i)) continue;
      if (i === selDay - 1) return vi;
      vi++;
    }
    return 0;
  };
  const filteredMonIdx = () => {
    let vi = 0;
    for (let i = 0; i < 12; i++) {
      if (isMonthDisabled(i)) continue;
      if (i === selMonth) return vi;
      vi++;
    }
    return 0;
  };

  useEffect(() => {
    // Scroll to active position on open (compact) or mount (inline)
    const shouldScroll = compact ? open : true;
    if (shouldScroll) {
      setTimeout(() => {
        scrollTo(dayRef, filteredDayIdx());
        scrollTo(monRef, filteredMonIdx());
      }, 50);
    }
  }, [open]); // eslint-disable-line

  // Sync from parent value
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      setSelDay(d.getDate());
      setSelMonth(d.getMonth());
      setSelYear(d.getFullYear());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Clamp to minDate if needed
  const clampAndEmit = (d, m, y) => {
    const maxD = new Date(y, m + 1, 0).getDate();
    let day = Math.min(d, maxD);
    if (minD) {
      const selected = new Date(y, m, day);
      if (selected < minD) {
        day = minDay;
        m = minMonth;
        y = minYear;
      }
    }
    onChange(`${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  const handleDayScroll = (realIdx) => {
    const newDay = realIdx + 1;
    setSelDay(newDay);
    clampAndEmit(newDay, selMonth, selYear);
  };

  const handleMonScroll = (realIdx) => {
    setSelMonth(realIdx);
    const maxD = new Date(selYear, realIdx + 1, 0).getDate();
    const newDay = Math.min(selDay, maxD);
    setSelDay(newDay);
    clampAndEmit(newDay, realIdx, selYear);
  };

  // Check if a day/month is before minDate
  const isDayDisabled = (dayIdx) => {
    if (!minD) return false;
    const d = new Date(selYear, selMonth, dayIdx + 1);
    return d < minD;
  };
  const isMonthDisabled = (monIdx) => {
    if (!minD) return false;
    // Last day of that month — if even last day is before minDate
    const lastDay = new Date(selYear, monIdx + 1, 0);
    return lastDay < minD;
  };

  const renderCol = (ref, items, activeIdx, onScroll, disabledFn) => {
    // Filter out disabled items, keep mapping to original indices
    const filtered = [];
    items.forEach((label, i) => {
      const disabled = disabledFn ? disabledFn(i) : false;
      if (!disabled) filtered.push({ label, origIdx: i });
    });
    const visibleActiveIdx = filtered.findIndex(f => f.origIdx === activeIdx);
    return (
      <div className="ios-dp-col" ref={ref}
        onScroll={() => {
          const scrollIdx = Math.round(ref.current.scrollTop / ITEM_H);
          const clamped = Math.max(0, Math.min(filtered.length - 1, scrollIdx));
          const realIdx = filtered[clamped].origIdx;
          onScroll(realIdx);
        }}
        style={{ height: ITEM_H * VISIBLE }}>
        <div style={{ height: ITEM_H * 2 }} />
        {filtered.map((f, vi) => (
          <div key={f.origIdx}
            className={`ios-dp-item ${f.origIdx === activeIdx ? 'ios-dp-item--active' : ''}`}
            style={{ height: ITEM_H }}
            onClick={() => { if (ref.current) ref.current.scrollTop = vi * ITEM_H; }}>
            {f.label}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    );
  };

  const dayItems = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const displayStr = value
    ? `${String(selDay).padStart(2, '0')} ${MONTH_NAMES[selMonth]} ${selYear}`
    : 'Выбрать дату';

  if (compact) {
    return (
      <div className="ios-dp-compact-wrap" ref={wrapRef}>
        <button className="ios-dp-compact-btn" onClick={() => setOpen(!open)} type="button">
          {displayStr}
        </button>
        {open && (
          <div className="ios-dp-dropdown">
            <div className="ios-dp-highlight" style={{ height: ITEM_H, top: ITEM_H * 2 }} />
            {renderCol(dayRef, dayItems, selDay - 1, handleDayScroll, isDayDisabled)}
            {renderCol(monRef, MONTH_NAMES, selMonth, handleMonScroll, isMonthDisabled)}
            <span className="ios-dp-year">{selYear}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ios-dp-inline">
      <div className="ios-dp-highlight" style={{ height: ITEM_H, top: ITEM_H * 2 }} />
      {renderCol(dayRef, dayItems, selDay - 1, handleDayScroll, isDayDisabled)}
      {renderCol(monRef, MONTH_NAMES, selMonth, handleMonScroll, isMonthDisabled)}
      <span className="ios-dp-year">{selYear}</span>
    </div>
  );
}
