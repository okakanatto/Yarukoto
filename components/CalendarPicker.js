'use client';

import { useState, useRef, useEffect } from 'react';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export default function CalendarPicker({ value, onChange, label, alignRight = false }) {
  const [open, setOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const ref = useRef(null);

  const selected = value ? new Date(value + 'T00:00:00') : null;
  const [viewYear, setViewYear] = useState(selected ? selected.getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(selected ? selected.getMonth() : new Date().getMonth());

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const handleSelect = (day) => {
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    onChange(dateStr);
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
  };

  const today = new Date();
  const todayStr = toDateStr(today);

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="cal-root" ref={ref}>
      <div className="cal-trigger" onClick={() => setOpen(!open)}>
        <span className="cal-icon">📅</span>
        <span className={`cal-value ${!value ? 'placeholder' : ''}`}>
          {value || '日付を選択'}
        </span>
        {value && <button type="button" className="cal-clear" onClick={handleClear}>✕</button>}
      </div>

      {open && (
        <div className={`cal-dropdown ${alignRight ? 'align-right' : ''}`}>
          <div className="cal-header">
            <button type="button" className="cal-nav" onClick={prevMonth}>‹</button>
            <span className="cal-title">{viewYear}年 {MONTHS[viewMonth]}</span>
            <button type="button" className="cal-nav" onClick={nextMonth}>›</button>
          </div>
          <div className="cal-weekdays">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className={`cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</span>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((day, i) => {
              if (day === null) return <span key={`e${i}`} className="cal-cell empty"></span>;
              const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isSelected = value === dateStr;
              const isToday = dateStr === todayStr;
              return (
                <button
                  key={day}
                  type="button"
                  className={`cal-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => handleSelect(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="cal-footer">
            <button type="button" className="cal-today-btn" onClick={() => { onChange(todayStr); setOpen(false); }}>
              今日
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .cal-root { position: relative; width: 100%; }
        .cal-trigger {
          display: flex; align-items: center; gap: 0.5rem;
          background: var(--color-surface-hover); border: 1px solid var(--border-color);
          border-radius: var(--radius-sm); padding: 0.5rem 0.65rem;
          cursor: pointer; transition: border-color 0.2s;
          font-size: 0.875rem; color: var(--color-text);
        }
        .cal-trigger:hover { border-color: var(--border-color-hover); }
        .cal-icon { font-size: 0.9rem; }
        .cal-value { flex: 1; }
        .cal-value.placeholder { color: var(--color-text-disabled); }
        .cal-clear {
          background: none; border: none; color: var(--color-text-muted); cursor: pointer;
          font-size: 0.7rem; padding: 2px 4px; border-radius: 4px; transition: color 0.15s;
        }
        .cal-clear:hover { color: var(--color-text); }

        .cal-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0;
          z-index: 1050; min-width: 280px;
          background: var(--color-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          box-shadow: 0 12px 40px rgba(0,0,0,0.1);
          padding: 0.75rem;
          animation: calDrop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes calDrop {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .cal-dropdown.align-right { left: auto; right: 0; }

        .cal-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .cal-nav {
          background: none; border: none; color: var(--color-text-muted);
          font-size: 1.2rem; cursor: pointer; width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 6px; transition: all 0.15s;
        }
        .cal-nav:hover { background: var(--color-surface-hover); color: var(--color-text); }
        .cal-title { font-size: 0.9rem; font-weight: 600; color: var(--color-text); }

        .cal-weekdays {
          display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 0.25rem;
        }
        .cal-wd {
          text-align: center; font-size: 0.7rem; font-weight: 600;
          color: var(--color-text-muted); padding: 0.25rem 0;
        }
        .cal-wd.sun { color: #ef4444; }
        .cal-wd.sat { color: #3b82f6; }

        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .cal-cell {
          aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
          font-size: 0.8rem; border-radius: 6px; border: none; cursor: pointer;
          background: transparent; color: var(--color-text); transition: all 0.12s;
        }
        .cal-cell.empty { cursor: default; }
        .cal-cell:not(.empty):hover { background: var(--color-surface-hover); }
        .cal-cell.today {
          border: 1px solid var(--color-primary);
          color: var(--color-primary); font-weight: 600;
        }
        .cal-cell.selected {
          background: var(--color-primary) !important;
          color: white; font-weight: 600;
        }

        .cal-footer {
          display: flex; justify-content: center; margin-top: 0.5rem;
          padding-top: 0.5rem; border-top: 1px solid var(--border-color);
        }
        .cal-today-btn {
          background: transparent; border: 1px solid var(--border-color);
          color: var(--color-primary); font-size: 0.78rem; font-weight: 500;
          padding: 0.3rem 1rem; border-radius: 6px; cursor: pointer;
          transition: all 0.15s;
        }
        .cal-today-btn:hover { background: var(--color-primary-subtle); }
      `}</style>
    </div>
  );
}
