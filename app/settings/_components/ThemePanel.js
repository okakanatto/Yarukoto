'use client';

import { fetchDb } from '@/lib/utils';
import { Sun, Moon } from 'lucide-react';

const ACCENT_PRESETS = [
    { key: 'coral',  label: 'Coral',  color: '#F97316' },
    { key: 'amber',  label: 'Amber',  color: '#F59E0B' },
    { key: 'rose',   label: 'Rose',   color: '#F43F5E' },
    { key: 'teal',   label: 'Teal',   color: '#0D9488' },
    { key: 'violet', label: 'Violet', color: '#8B5CF6' },
    { key: 'blue',   label: 'Blue',   color: '#3B82F6' },
];

export default function ThemePanel({ appSettings, setAppSettings, flash }) {
    const mode = appSettings.theme_mode || 'light';
    const accent = appSettings.theme_accent || 'coral';

    const saveSetting = async (key, value) => {
        try {
            const db = await fetchDb();
            await db.execute(
                'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
                [key, value]
            );
        } catch (e) {
            console.error('Failed to save theme setting:', e);
            flash('err', '設定の保存に失敗しました');
            throw e;
        }
    };

    const handleModeChange = async (newMode) => {
        const prevMode = mode;
        setAppSettings(prev => ({ ...prev, theme_mode: newMode }));
        window.dispatchEvent(new CustomEvent('yarukoto:themeChanged', { detail: { theme_mode: newMode } }));
        try {
            await saveSetting('theme_mode', newMode);
        } catch {
            setAppSettings(prev => ({ ...prev, theme_mode: prevMode }));
            window.dispatchEvent(new CustomEvent('yarukoto:themeChanged', { detail: { theme_mode: prevMode } }));
        }
    };

    const handleAccentChange = async (newAccent) => {
        const prevAccent = accent;
        setAppSettings(prev => ({ ...prev, theme_accent: newAccent }));
        window.dispatchEvent(new CustomEvent('yarukoto:themeChanged', { detail: { theme_accent: newAccent } }));
        try {
            await saveSetting('theme_accent', newAccent);
        } catch {
            setAppSettings(prev => ({ ...prev, theme_accent: prevAccent }));
            window.dispatchEvent(new CustomEvent('yarukoto:themeChanged', { detail: { theme_accent: prevAccent } }));
        }
    };

    return (
        <div className="tp-root">
            <h3 className="s-heading">外観モード</h3>
            <div className="tp-mode-group">
                <button
                    className={`tp-mode-btn ${mode === 'light' ? 'active' : ''}`}
                    onClick={() => handleModeChange('light')}
                >
                    <Sun size={20} strokeWidth={1.75} />
                    <span>ライト</span>
                </button>
                <button
                    className={`tp-mode-btn ${mode === 'dark' ? 'active' : ''}`}
                    onClick={() => handleModeChange('dark')}
                >
                    <Moon size={20} strokeWidth={1.75} />
                    <span>ダーク</span>
                </button>
            </div>

            <h3 className="s-heading" style={{ marginTop: '1.5rem' }}>アクセントカラー</h3>
            <div className="tp-accent-grid">
                {ACCENT_PRESETS.map(p => (
                    <button
                        key={p.key}
                        className={`tp-accent-btn ${accent === p.key ? 'active' : ''}`}
                        onClick={() => handleAccentChange(p.key)}
                        title={p.label}
                    >
                        <span className="tp-accent-swatch" style={{ backgroundColor: p.color }} />
                        <span className="tp-accent-label">{p.label}</span>
                    </button>
                ))}
            </div>

            <style jsx>{`
                .tp-root { }

                .tp-mode-group {
                    display: flex; gap: .5rem;
                }
                .tp-mode-btn {
                    flex: 1; display: flex; align-items: center; justify-content: center;
                    gap: .5rem; padding: .85rem 1rem;
                    background-color: var(--color-surface);
                    border: 2px solid var(--border-color);
                    border-radius: var(--radius-md); cursor: pointer;
                    font-size: .88rem; font-weight: 500; font-family: inherit;
                    color: var(--color-text-muted);
                    transition: all .2s;
                }
                .tp-mode-btn:hover {
                    border-color: var(--border-color-hover);
                    color: var(--color-text);
                }
                .tp-mode-btn.active {
                    border-color: var(--color-accent);
                    color: var(--color-accent);
                    background-color: var(--color-accent-subtle);
                    font-weight: 600;
                }

                .tp-accent-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: .5rem;
                }
                .tp-accent-btn {
                    display: flex; align-items: center; gap: .6rem;
                    padding: .7rem .85rem;
                    background-color: var(--color-surface);
                    border: 2px solid var(--border-color);
                    border-radius: var(--radius-md); cursor: pointer;
                    font-family: inherit; font-size: .82rem; font-weight: 500;
                    color: var(--color-text-muted);
                    transition: all .2s;
                }
                .tp-accent-btn:hover {
                    border-color: var(--border-color-hover);
                    color: var(--color-text);
                }
                .tp-accent-btn.active {
                    border-color: var(--color-accent);
                    background-color: var(--color-accent-subtle);
                    color: var(--color-text);
                    font-weight: 600;
                }
                .tp-accent-swatch {
                    width: 22px; height: 22px; border-radius: 50%;
                    flex-shrink: 0;
                    box-shadow: 0 1px 3px rgba(0,0,0,.15);
                }
                .tp-accent-label {
                    font-size: .82rem;
                }
            `}</style>
        </div>
    );
}
