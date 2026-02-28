'use client';

import { useState, useRef, useEffect } from 'react';

export default function TagSelect({ allTags, selectedTagIds, onChange }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus();
    }, [open]);

    const filtered = allTags.filter(t =>
        !t.archived && t.name.toLowerCase().includes(query.toLowerCase())
    );

    const toggle = (tagId) => {
        const next = selectedTagIds.includes(tagId)
            ? selectedTagIds.filter(id => id !== tagId)
            : [...selectedTagIds, tagId];
        onChange(next);
    };

    const remove = (tagId, e) => {
        e.stopPropagation();
        onChange(selectedTagIds.filter(id => id !== tagId));
    };

    const selectedTags = allTags.filter(t => selectedTagIds.includes(t.id));

    return (
        <div className="ts-root" ref={ref}>
            <div className="ts-trigger" onClick={() => setOpen(!open)}>
                <div className="ts-pills">
                    {selectedTags.length === 0 && <span className="ts-placeholder">タグを選択...</span>}
                    {selectedTags.map(tag => (
                        <span key={tag.id} className={`ts-pill ${tag.archived ? 'ts-pill-archived' : ''}`} style={{ backgroundColor: tag.color }}>
                            {tag.name}
                            <button type="button" className="ts-pill-x" onClick={(e) => remove(tag.id, e)}>×</button>
                        </span>
                    ))}
                </div>
                <span className="ts-chevron">{open ? '▲' : '▼'}</span>
            </div>

            {open && (
                <div className="ts-dropdown">
                    <div className="ts-search-wrap">
                        <input
                            ref={inputRef}
                            type="text"
                            className="ts-search"
                            placeholder="タグを検索..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="ts-options">
                        {filtered.length === 0 && (
                            <div className="ts-no-results">一致するタグがありません</div>
                        )}
                        {filtered.map(tag => {
                            const isSelected = selectedTagIds.includes(tag.id);
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    className={`ts-option ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggle(tag.id)}
                                >
                                    <span className="ts-opt-color" style={{ backgroundColor: tag.color }}></span>
                                    <span className="ts-opt-name">{tag.name}</span>
                                    {isSelected && <span className="ts-check">✓</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <style jsx>{`
        .ts-root { position: relative; width: 100%; }
        .ts-trigger {
          display: flex; align-items: center; gap: 0.5rem;
          background: var(--color-surface-hover); border: 1px solid var(--border-color);
          border-radius: var(--radius-sm); padding: 0.4rem 0.65rem;
          cursor: pointer; min-height: 38px; transition: border-color 0.2s;
        }
        .ts-trigger:hover { border-color: var(--border-color-hover); }
        .ts-pills { display: flex; flex-wrap: wrap; gap: 0.3rem; flex: 1; }
        .ts-placeholder { color: var(--color-text-disabled); font-size: 0.85rem; }
        .ts-pill {
          display: inline-flex; align-items: center; gap: 0.3rem;
          font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem;
          border-radius: 12px; color: white;
        }
        .ts-pill-x {
          background: none; border: none; color: rgba(255,255,255,0.7);
          cursor: pointer; font-size: 0.8rem; padding: 0; line-height: 1; transition: color 0.15s;
        }
        .ts-pill-x:hover { color: white; }
        .ts-pill-archived { opacity: 0.6; }
        .ts-chevron { font-size: 0.55rem; color: var(--color-text-muted); flex-shrink: 0; }

        .ts-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          z-index: 100; background: var(--color-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          box-shadow: 0 12px 40px rgba(0,0,0,0.1);
          animation: dropIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden;
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .ts-search-wrap { padding: 0.5rem; border-bottom: 1px solid var(--border-color); }
        .ts-search {
          width: 100%; background: var(--color-surface-hover);
          border: 1px solid var(--border-color);
          border-radius: 6px; padding: 0.45rem 0.6rem;
          color: var(--color-text); font-size: 0.85rem; outline: none;
          transition: border-color 0.2s; font-family: inherit;
        }
        .ts-search:focus { border-color: var(--color-primary); }
        .ts-search::placeholder { color: var(--color-text-disabled); }

        .ts-options { max-height: 200px; overflow-y: auto; padding: 0.25rem; }
        .ts-options::-webkit-scrollbar { width: 4px; }
        .ts-options::-webkit-scrollbar-thumb { background: #d0d5e0; border-radius: 2px; }

        .ts-option {
          display: flex; align-items: center; gap: 0.6rem;
          width: 100%; background: transparent; border: none;
          padding: 0.5rem 0.6rem; color: var(--color-text); cursor: pointer;
          border-radius: 6px; font-size: 0.85rem; text-align: left;
          transition: background 0.12s; font-family: inherit;
        }
        .ts-option:hover { background: var(--color-surface-hover); }
        .ts-option.selected { background: var(--color-primary-subtle); }
        .ts-opt-color { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .ts-opt-name { flex: 1; }
        .ts-check { color: var(--color-primary); font-weight: 600; font-size: 0.85rem; }

        .ts-no-results {
          padding: 1rem; text-align: center; color: var(--color-text-muted); font-size: 0.85rem;
        }
      `}</style>
        </div>
    );
}
