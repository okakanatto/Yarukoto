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
        .color-palette-root { display: flex; flex-direction: column; gap: 0.5rem; }
        .swatches { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
        .swatch {
          width: 100%; aspect-ratio: 1; min-width: 24px; max-width: 32px;
          border: 2px solid transparent; border-radius: 6px;
          cursor: pointer; transition: all 0.15s; padding: 0;
        }
        .swatch:hover { transform: scale(1.2); z-index: 1; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
        .swatch.active {
          border-color: var(--color-text);
          box-shadow: 0 0 0 2px var(--color-primary-glow);
          transform: scale(1.15);
        }
        .custom-row { display: flex; align-items: center; gap: 0.5rem; }
        .toggle-custom {
          background: transparent; border: none;
          color: var(--color-text-muted); font-size: 0.75rem;
          cursor: pointer; padding: 0.2rem 0;
        }
        .toggle-custom:hover { color: var(--color-text); }
        .custom-picker {
          display: flex; align-items: center; gap: 0.5rem;
          animation: fadeIn 0.2s;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .color-input {
          width: 28px; height: 28px;
          border: 1px solid var(--border-color);
          border-radius: 4px; cursor: pointer; padding: 1px;
          background: transparent;
        }
        .color-hex { font-size: 0.75rem; color: var(--color-text-muted); font-family: monospace; }
      `}</style>
        </div>
    );
}
