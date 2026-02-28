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
                    display: inline-flex; align-items: center; gap: 0.3rem;
                    padding: 0.35rem 0.55rem; border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm); background: var(--color-surface);
                    color: var(--color-text-secondary); font-size: 0.8rem;
                    font-weight: 500; font-family: inherit; cursor: pointer;
                    transition: all 0.15s; white-space: nowrap;
                }
                .msf-btn:hover {
                    border-color: var(--border-color-hover);
                    background: var(--color-surface-hover);
                }
                .msf-btn.filtered {
                    border-color: var(--color-primary);
                    color: var(--color-primary);
                    background: rgba(79, 110, 247, 0.06);
                }
                .msf-label { font-size: 0.78rem; }
                .msf-count {
                    display: inline-flex; align-items: center; justify-content: center;
                    min-width: 16px; height: 16px; padding: 0 4px;
                    border-radius: 8px; background: var(--color-primary);
                    color: #fff; font-size: 0.65rem; font-weight: 700; line-height: 1;
                }
                .msf-arrow {
                    font-size: 0.7rem; color: var(--color-text-muted);
                    transition: transform 0.2s;
                }
                .msf-arrow.up { transform: rotate(180deg); }
                .msf-panel {
                    position: absolute; top: calc(100% + 4px); left: 0;
                    min-width: 180px; max-height: 280px; overflow-y: auto;
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm); box-shadow: var(--shadow-lg);
                    z-index: 100; padding: 0.3rem 0;
                    animation: msfIn 0.15s ease;
                }
                @keyframes msfIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .msf-item {
                    display: flex; align-items: center; gap: 0.4rem;
                    padding: 0.4rem 0.75rem; cursor: pointer;
                    transition: background 0.1s; font-size: 0.82rem;
                    color: var(--color-text); user-select: none;
                }
                .msf-item:hover { background: var(--color-surface-hover); }
                .msf-item input { display: none; }
                .msf-check {
                    width: 16px; height: 16px; border: 1.5px solid var(--border-color);
                    border-radius: 3px; flex-shrink: 0;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.15s; background: var(--color-surface);
                }
                .msf-item input:checked + .msf-check {
                    background: var(--color-primary); border-color: var(--color-primary);
                }
                .msf-item input:checked + .msf-check::after {
                    content: '✓'; color: #fff; font-size: 0.65rem;
                    font-weight: 700; line-height: 1;
                }
                .msf-dot {
                    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
                }
                .msf-text { flex: 1; font-weight: 500; }
                .msf-all .msf-text { font-weight: 600; }
                .msf-sep {
                    height: 1px; background: var(--border-color); margin: 0.2rem 0;
                }
            `}</style>
        </div>
    );
}
