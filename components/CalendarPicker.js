'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export default function CalendarPicker({ value, onChange, label, alignRight = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const selected = value ? new Date(value + 'T00:00:00') : null;
  const [viewYear, setViewYear] = useState(selected ? selected.getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(selected ? selected.getMonth() : new Date().getMonth());
  const [focusedDay, setFocusedDay] = useState(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setFocusedDay(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus the dropdown DOM element when it opens
  useEffect(() => {
    if (open) {
      setTimeout(() => dropdownRef.current?.focus(), 0);
    }
  }, [open]);

  // Compute initial focused day based on current view
  const computeInitialFocusedDay = () => {
    if (selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth) {
      return selected.getDate();
    }
    const now = new Date();
    if (now.getFullYear() === viewYear && now.getMonth() === viewMonth) {
      return now.getDate();
    }
    return 1;
  };

  const openCalendar = () => {
    setOpen(true);
    setFocusedDay(computeInitialFocusedDay());
  };

  const closeCalendar = () => {
    setOpen(false);
    setFocusedDay(null);
  };

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
    closeCalendar();
    triggerRef.current?.focus();
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    closeCalendar();
    triggerRef.current?.focus();
  };

  // IMP-21: Keyboard support for trigger (Enter/Space to open/close)
  // IMP-37: Delete/Backspace to clear date from trigger (Tab order optimization)
  const handleTriggerKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) { closeCalendar(); } else { openCalendar(); }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && value) {
      e.preventDefault();
      onChange('');
    }
  };

  // IMP-21: Keyboard navigation within the calendar dropdown
  const handleDropdownKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeCalendar();
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedDay) {
        handleSelect(focusedDay);
      }
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const current = new Date(viewYear, viewMonth, focusedDay || 1);

      if (e.key === 'ArrowLeft') current.setDate(current.getDate() - 1);
      if (e.key === 'ArrowRight') current.setDate(current.getDate() + 1);
      if (e.key === 'ArrowUp') current.setDate(current.getDate() - 7);
      if (e.key === 'ArrowDown') current.setDate(current.getDate() + 7);

      setViewYear(current.getFullYear());
      setViewMonth(current.getMonth());
      setFocusedDay(current.getDate());
      return;
    }
  };

  const today = new Date();
  const todayStr = toDateStr(today);

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="cal-root" ref={ref}>
      <div
        className="cal-trigger"
        ref={triggerRef}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { if (open) { closeCalendar(); } else { openCalendar(); } }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="cal-icon"><Calendar size={14} /></span>
        <span className={`cal-value ${!value ? 'placeholder' : ''}`}>
          {value || '日付を選択'}
        </span>
        {value && <button type="button" className="cal-clear" tabIndex={-1} onClick={handleClear}>✕</button>}
      </div>

      {open && (
        <div
          className={`cal-dropdown ${alignRight ? 'align-right' : ''}`}
          ref={dropdownRef}
          tabIndex={-1}
          role="dialog"
          aria-label="カレンダー"
          onKeyDown={handleDropdownKeyDown}
        >
          <div className="cal-header">
            <button type="button" className="cal-nav" tabIndex={-1} onClick={prevMonth}>‹</button>
            <span className="cal-title">{viewYear}年 {MONTHS[viewMonth]}</span>
            <button type="button" className="cal-nav" tabIndex={-1} onClick={nextMonth}>›</button>
          </div>
          <div className="cal-weekdays">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className={`cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</span>
            ))}
          </div>
          <div className="cal-grid" role="grid">
            {cells.map((day, i) => {
              if (day === null) return <span key={`e${i}`} className="cal-cell empty"></span>;
              const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const isSelected = value === dateStr;
              const isToday = dateStr === todayStr;
              const isFocused = focusedDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  tabIndex={-1}
                  className={`cal-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isFocused ? 'focused' : ''}`}
                  onClick={() => handleSelect(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="cal-footer">
            <button type="button" className="cal-today-btn" tabIndex={-1} onClick={() => { onChange(todayStr); closeCalendar(); triggerRef.current?.focus(); }}>
              今日
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .cal-root { position: relative; width: 100%; }
        .cal-trigger {
          display: flex; align-items: center; gap: 6px;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-sm); padding: 6px 8px;
          cursor: pointer; transition: border-color 100ms;
          font-size: 0.82rem; color: var(--color-text);
        }
        .cal-trigger:hover { border-color: var(--border-color-hover); }
        .cal-trigger:focus {
          outline: none; border-color: var(--color-accent);
        }
        .cal-icon { font-size: 0.85rem; }
        .cal-value { flex: 1; }
        .cal-value.placeholder { color: var(--color-text-disabled); }
        .cal-clear {
          background: none; border: none; color: var(--color-text-muted); cursor: pointer;
          font-size: 0.65rem; padding: 2px 4px; border-radius: var(--radius-sm); transition: color 100ms;
        }
        .cal-clear:hover { color: var(--color-text); }

        .cal-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0;
          z-index: 1050; min-width: 270px;
          background: var(--color-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          padding: 8px;
          outline: none;
        }
        .cal-dropdown.align-right { left: auto; right: 0; }

        .cal-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 6px;
        }
        .cal-nav {
          background: none; border: none; color: var(--color-text-muted);
          font-size: 1.1rem; cursor: pointer; width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: background 100ms, color 100ms;
        }
        .cal-nav:hover { background: var(--color-surface-hover); color: var(--color-text); }
        .cal-title { font-size: 0.85rem; font-weight: 700; color: var(--color-text); }

        .cal-weekdays {
          display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 2px;
        }
        .cal-wd {
          text-align: center; font-size: 0.72rem; font-weight: 700;
          color: var(--color-text-muted); padding: 3px 0;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .cal-wd.sun { color: var(--color-danger); }
        .cal-wd.sat { color: var(--color-saturday); }

        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
        .cal-cell {
          aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
          font-size: 0.78rem; border-radius: var(--radius-sm); border: none; cursor: pointer;
          background: transparent; color: var(--color-text); transition: background 100ms, color 100ms;
        }
        .cal-cell.empty { cursor: default; }
        .cal-cell:not(.empty):hover { background: var(--color-surface-hover); }
        .cal-cell.today {
          border: 1px solid var(--color-accent);
          color: var(--color-accent); font-weight: 700;
        }
        .cal-cell.selected {
          background: var(--color-accent) !important;
          color: white; font-weight: 700;
        }
        .cal-cell.focused:not(.selected) {
          outline: 2px solid var(--color-accent);
          outline-offset: -2px;
          background: var(--color-surface-hover);
        }
        .cal-cell.focused.selected {
          outline: 2px solid var(--color-text);
          outline-offset: 2px;
        }

        .cal-footer {
          display: flex; justify-content: center; margin-top: 6px;
          padding-top: 6px; border-top: 1px solid var(--border-color);
        }
        .cal-today-btn {
          background: transparent; border: 1px solid var(--border-color);
          color: var(--color-accent); font-size: 0.72rem; font-weight: 700;
          padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer;
          transition: background 100ms;
        }
        .cal-today-btn:hover { background: var(--color-accent-subtle); }
      `}</style>
    </div>
  );
}
