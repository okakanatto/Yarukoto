'use client';

import { useState } from 'react';

/* Curated color palette for quick selection */
const PALETTE = [
    // Row 1: Reds & Oranges
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    // Row 2: Greens
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    // Row 3: Blues & Cyans
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    // Row 4: Purples & Pinks
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    // Row 5: Neutrals
    '#64748b', '#78716c', '#94a3b8', '#cbd5e1',
];

export default function ColorPalette({ value, onChange }) {
    const [showCustom, setShowCustom] = useState(false);

    return (
        <div className="color-palette-root">
            <div className="swatches">
                {PALETTE.map(color => (
                    <button
                        key={color}
                        type="button"
                        className={`swatch ${value === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => onChange(color)}
                        title={color}
                    />
                ))}
            </div>

            <div className="custom-row">
                <button
                    type="button"
                    className="toggle-custom"
                    onClick={() => setShowCustom(!showCustom)}
                >
                    {showCustom ? '▲ 閉じる' : '🎨 カスタム色'}
                </button>
                {showCustom && (
                    <div className="custom-picker">
                        <input
                            type="color"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            className="color-input"
                        />
                        <span className="color-hex">{value}</span>
                    </div>
                )}
            </div>

            <style jsx>{`
        .color-palette-root { display: flex; flex-direction: column; gap: 6px; }
        .swatches { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; }
        .swatch {
          width: 100%; aspect-ratio: 1; min-width: 22px; max-width: 30px;
          border: 2px solid transparent; border-radius: var(--radius-pill);
          cursor: pointer; transition: border-color var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out); padding: 0;
        }
        .swatch:hover { border-color: var(--color-text-muted); transform: scale(1.1); }
        .swatch.active {
          border-color: var(--color-text);
        }
        .custom-row { display: flex; align-items: center; gap: 6px; }
        .toggle-custom {
          background: transparent; border: none;
          color: var(--color-text-muted); font-size: 0.72rem;
          font-weight: 500;
          cursor: pointer; padding: 2px 0;
          transition: color var(--duration-fast) var(--ease-out);
        }
        .toggle-custom:hover { color: var(--color-text); }
        .custom-picker {
          display: flex; align-items: center; gap: 6px;
        }
        .color-input {
          width: 26px; height: 26px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-pill); cursor: pointer; padding: 1px;
          background: transparent;
        }
        .color-hex {
          font-size: 0.72rem; color: var(--color-text-secondary); font-family: monospace;
        }
      `}</style>
        </div>
    );
}
