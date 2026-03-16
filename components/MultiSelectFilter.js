'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Excel-like multi-select dropdown filter.
 *
 * Props:
 *   label    – display text on trigger button (e.g. "ステータス")
 *   options  – [{value, label, color?}]
 *   selected – array of currently selected values.  [] = "all" (no filter)
 *   onChange – (newSelected) => void
 */
export default function MultiSelectFilter({ label, options, selected, onChange }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const isAllSelected = selected.length === 0;

    const handleToggleAll = () => {
        if (!isAllSelected) {
            onChange([]);
        }
    };

    const handleToggleItem = (value) => {
        if (isAllSelected) {
            // Uncheck this item from "all" → select everything except this
            const newSelected = options.filter(o => o.value !== value).map(o => o.value);
            onChange(newSelected);
        } else if (selected.includes(value)) {
            // Uncheck this item
            const newSelected = selected.filter(v => v !== value);
            if (newSelected.length === 0) {
                onChange([]); // Last item unchecked → reset to all
            } else {
                onChange(newSelected);
            }
        } else {
            // Check this item
            const newSelected = [...selected, value];
            if (newSelected.length >= options.length) {
                onChange([]); // All items now checked → reset to "all"
            } else {
                onChange(newSelected);
            }
        }
    };

    const isItemChecked = (value) => isAllSelected || selected.includes(value);
    const activeCount = isAllSelected ? 0 : selected.length;

    return (
        <div className="msf-wrap" ref={containerRef}>
            <button
                className={`msf-btn ${activeCount > 0 ? 'filtered' : ''}`}
                onClick={() => setOpen(!open)}
                type="button"
            >
                <span className="msf-label">{label}</span>
                {activeCount > 0 && <span className="msf-count">{activeCount}</span>}
                <span className={`msf-arrow ${open ? 'up' : ''}`}>▾</span>
            </button>

            {open && (
                <div className="msf-panel">
                    <label className="msf-item msf-all">
                        <input type="checkbox" checked={isAllSelected} onChange={handleToggleAll} />
                        <span className="msf-check" />
                        <span className="msf-text">すべて</span>
                    </label>
                    <div className="msf-sep" />
                    {options.map(opt => (
                        <label key={opt.value} className="msf-item">
                            <input
                                type="checkbox"
                                checked={isItemChecked(opt.value)}
                                onChange={() => handleToggleItem(opt.value)}
                            />
                            <span className="msf-check" />
                            {opt.color && <span className="msf-dot" style={{ backgroundColor: opt.color }} />}
                            <span className="msf-text">{opt.label}</span>
                        </label>
                    ))}
                </div>
            )}

            <style jsx>{`
                .msf-wrap { position: relative; }
                .msf-btn {
                    display: inline-flex; align-items: center; gap: 4px;
                    padding: 5px 8px; border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm); background: var(--color-surface);
                    color: var(--color-text-secondary); font-size: 0.78rem;
                    font-weight: 500; font-family: inherit; cursor: pointer;
                    transition: background 80ms, border-color 80ms, color 80ms; white-space: nowrap;
                }
                .msf-btn:hover {
                    border-color: var(--border-color-hover);
                    background: var(--color-surface-hover);
                }
                .msf-btn.filtered {
                    border-color: var(--color-accent);
                    color: var(--color-accent);
                    background: var(--color-accent-subtle);
                }
                .msf-label { font-size: 0.76rem; }
                .msf-count {
                    display: inline-flex; align-items: center; justify-content: center;
                    min-width: 15px; height: 15px; padding: 0 3px;
                    border-radius: var(--radius-sm); background: var(--color-accent);
                    color: #fff; font-size: 0.62rem; font-weight: 700; line-height: 1;
                }
                .msf-arrow {
                    font-size: 0.65rem; color: var(--color-text-muted);
                    transition: transform 80ms;
                }
                .msf-arrow.up { transform: rotate(180deg); }
                .msf-panel {
                    position: absolute; top: calc(100% + 4px); left: 0;
                    min-width: 180px; max-height: 280px; overflow-y: auto;
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-md); box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    z-index: 100; padding: 4px 0;
                    animation: msfIn 0.15s ease;
                }
                @keyframes msfIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .msf-item {
                    display: flex; align-items: center; gap: 5px;
                    padding: 5px 8px; cursor: pointer;
                    transition: background 80ms; font-size: 0.8rem;
                    color: var(--color-text); user-select: none;
                }
                .msf-item:hover { background: var(--color-surface-hover); }
                .msf-item input { display: none; }
                .msf-check {
                    width: 15px; height: 15px; border: 1.5px solid var(--border-color);
                    border-radius: var(--radius-sm); flex-shrink: 0;
                    display: flex; align-items: center; justify-content: center;
                    transition: background 80ms, border-color 80ms; background: var(--color-surface);
                }
                .msf-item input:checked + .msf-check {
                    background: var(--color-accent); border-color: var(--color-accent);
                }
                .msf-item input:checked + .msf-check::after {
                    content: '✓'; color: #fff; font-size: 0.6rem;
                    font-weight: 700; line-height: 1;
                }
                .msf-dot {
                    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
                }
                .msf-text { flex: 1; font-weight: 500; }
                .msf-all .msf-text { font-weight: 600; }
                .msf-sep {
                    height: 1px; background: var(--border-color); margin: 2px 0;
                }
            `}</style>
        </div>
    );
}
