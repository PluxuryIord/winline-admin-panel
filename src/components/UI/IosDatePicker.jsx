import { useState, useEffect, useRef } from 'react';
import './IosDatePicker.css';

const MONTH_NAMES = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const ITEM_H = 36;
const VISIBLE = 5;

export default function IosDatePicker({ value, onChange, compact = false }) {
  const today = new Date();
  const parsed = value ? new Date(value + 'T00:00:00') : today;
  const [selDay, setSelDay] = useState(parsed.getDate());
  const [selMonth, setSelMonth] = useState(parsed.getMonth());
  const [selYear, setSelYear] = useState(parsed.getFullYear());
  const [open, setOpen] = useState(false);

  const dayRef = useRef(null);
  const monRef = useRef(null);
  const wrapRef = useRef(null);

  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();

  const scrollTo = (ref, val) => {
    if (ref.current) ref.current.scrollTop = val * ITEM_H;
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        scrollTo(dayRef, selDay - 1);
        scrollTo(monRef, selMonth);
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

  const emit = (d, m, y) => {
    const maxD = new Date(y, m + 1, 0).getDate();
    const day = Math.min(d, maxD);
    onChange(`${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  const handleDayScroll = () => {
    const idx = Math.round(dayRef.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(daysInMonth - 1, idx));
    const newDay = clamped + 1;
    setSelDay(newDay);
    emit(newDay, selMonth, selYear);
  };

  const handleMonScroll = () => {
    const idx = Math.round(monRef.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(11, idx));
    setSelMonth(clamped);
    const maxD = new Date(selYear, clamped + 1, 0).getDate();
    const newDay = Math.min(selDay, maxD);
    setSelDay(newDay);
    emit(newDay, clamped, selYear);
  };

  const renderCol = (ref, items, activeIdx, onScroll) => (
    <div className="ios-dp-col" ref={ref} onScroll={onScroll} style={{ height: ITEM_H * VISIBLE }}>
      <div style={{ height: ITEM_H * 2 }} />
      {items.map((label, i) => (
        <div key={i} className={`ios-dp-item ${i === activeIdx ? 'ios-dp-item--active' : ''}`}
          style={{ height: ITEM_H }} onClick={() => scrollTo(ref, i)}>
          {label}
        </div>
      ))}
      <div style={{ height: ITEM_H * 2 }} />
    </div>
  );

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
            {renderCol(dayRef, dayItems, selDay - 1, handleDayScroll)}
            {renderCol(monRef, MONTH_NAMES, selMonth, handleMonScroll)}
            <span className="ios-dp-year">{selYear}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ios-dp-inline">
      <div className="ios-dp-highlight" style={{ height: ITEM_H, top: ITEM_H * 2 }} />
      {renderCol(dayRef, dayItems, selDay - 1, handleDayScroll)}
      {renderCol(monRef, MONTH_NAMES, selMonth, handleMonScroll)}
      <span className="ios-dp-year">{selYear}</span>
    </div>
  );
}
