'use client';

import { useState, useRef, useEffect, useId } from 'react';

/**
 * Excel-like multi-select dropdown filter.
 *
 * Props:
 *   label    – display text on trigger button (e.g. "ステータス")
 *   options  – [{value, label, color?}]
 *   selected – array of currently selected values.  [] = "all" (no filter)
 *   onChange – (newSelected) => void
 */
export default function MultiSelectFilter({ label, options, selected, onChange, selectionMode = 'include' }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const panelId = useId();

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        const handleEscape = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [open]);

    const isAllSelected = selected.length === 0;

    const handleToggleAll = () => {
        if (!isAllSelected) {
            onChange([]);
        }
    };

    const handleToggleItem = (value) => {
        if (selectionMode === 'include') {
            const next = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
            onChange(next.length === options.length ? [] : next);
            return;
        }
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

    const isItemChecked = (value) => (selectionMode !== 'include' && isAllSelected) || selected.includes(value);
    const activeCount = isAllSelected ? 0 : selected.length;

    return (
        <div className="msf-wrap" ref={containerRef}>
            <button
                ref={triggerRef}
                className={`msf-btn ${activeCount > 0 ? 'filtered' : ''}`}
                onClick={() => setOpen(!open)}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                aria-haspopup="true"
            >
                <span className="msf-label">{label}</span>
                {activeCount > 0 && <span className="msf-count">{activeCount}</span>}
                <span className={`msf-arrow ${open ? 'up' : ''}`}>▾</span>
            </button>

            {open && (
                <div className="msf-panel" id={panelId} role="group" aria-label={`${label}フィルター`}>
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
                    height: 32px; padding: 0 10px; border: 1px solid var(--border-color);
                    border-radius: 8px; background: var(--color-surface);
                    color: var(--color-text-secondary); font-size: 12px;
                    font-weight: 500; font-family: inherit; cursor: pointer;
                    transition: background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out); white-space: nowrap;
                }
                .msf-btn:hover {
                    border-color: var(--border-color-hover);
                    background: var(--color-surface-hover);
                }
                .msf-btn.filtered {
                    background: var(--color-accent-subtle); color: var(--color-accent);
                    border-color: var(--color-accent);
                }
                .msf-btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
                .msf-label { font-size: 12px; line-height: 1.5; }
                .msf-count {
                    display: inline-flex; align-items: center; justify-content: center;
                    min-width: 15px; height: 15px; padding: 0 3px;
                    border-radius: var(--radius-pill); background: var(--color-accent);
                    color: var(--color-on-accent, #fff); font-size: 10px; font-weight: 600; line-height: 1;
                }
                .msf-btn:not(.filtered) .msf-count {
                    background: var(--color-accent); color: var(--color-on-accent, #fff);
                }
                .msf-arrow {
                    font-size: 0.65rem; color: var(--color-text-muted);
                    transition: transform var(--duration-fast) var(--ease-out);
                }
                .msf-btn.filtered .msf-arrow { color: var(--color-accent); }
                .msf-arrow.up { transform: rotate(180deg); }
                .msf-panel {
                    position: absolute; top: calc(100% + 4px); left: 0;
                    min-width: 180px; max-height: 280px; overflow-y: auto;
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: 8px; box-shadow: var(--shadow-md);
                    z-index: 100; padding: 4px 0;
                }
                .msf-item {
                    position: relative; display: flex; align-items: center; gap: 5px;
                    min-height: 32px; padding: 6px 10px; cursor: pointer;
                    transition: background var(--duration-fast) var(--ease-out); font-size: 12px; line-height: 1.5;
                    color: var(--color-text); user-select: none;
                }
                .msf-item:hover { background: var(--color-surface-hover); }
                .msf-item input { position: absolute; inset-inline-start: 10px; width: 1px; height: 1px; opacity: 0; }
                .msf-check {
                    width: 15px; height: 15px; border: 1.5px solid var(--border-color);
                    border-radius: var(--radius-sm); flex-shrink: 0;
                    display: flex; align-items: center; justify-content: center;
                    transition: background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out); background: var(--color-surface);
                }
                .msf-item input:checked + .msf-check {
                    background: var(--color-accent); border-color: var(--color-accent);
                }
                .msf-item input:checked + .msf-check::after {
                    content: '✓'; color: var(--color-on-accent, #fff); font-size: 0.6rem;
                    font-weight: 700; line-height: 1;
                }
                .msf-item input:focus-visible + .msf-check { outline: 2px solid var(--color-accent); outline-offset: 2px; }
                .msf-dot {
                    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
                }
                .msf-text { flex: 1; font-weight: 500; }
                .msf-all .msf-text { font-weight: 700; }
                .msf-sep {
                    height: 1px; background: var(--border-color); margin: 2px 0;
                }
            `}</style>
        </div>
    );
}
