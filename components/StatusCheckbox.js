'use client';

import { useState } from 'react';

export default function StatusCheckbox({ statusCode, onChange, sparkle = false, twoStateOnly = false, disabled = false }) {
    const [hovered, setHovered] = useState(false);
    const code = parseInt(statusCode);

    const handleMainClick = () => {
        if (disabled || code === 5) return; // disabled or キャンセル時は操作不可
        if (code === 3) {
            onChange(1); // 完了 → 未着手
        } else if (code === 2) {
            onChange(3); // 着手中 → 完了
        } else {
            onChange(3); // 未着手/保留/キャンセル → 完了
        }
    };

    const handlePlayClick = (e) => {
        e.stopPropagation();
        if (disabled || code === 5) return;
        if (code === 1) onChange(2); // 未着手 → 着手中
    };

    const handleRevertClick = (e) => {
        e.stopPropagation();
        if (disabled || code === 5) return;
        if (code === 2) onChange(1); // 着手中 → 未着手
    };

    const showPlay = code === 1 && hovered && !twoStateOnly && !disabled;
    const showRevert = code === 2 && hovered && !twoStateOnly && !disabled;

    return (
        <div
            className="status-cb-wrap"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <button
                className={`status-cb-main${code === 3 ? ' checked' : ''}${code === 2 ? ' in-progress' : ''}${code === 5 ? ' cancelled' : ''}${disabled ? ' disabled' : ''}${sparkle ? ' sparkle' : ''}`}
                onClick={handleMainClick}
                title={code === 3 ? '未着手に戻す' : code === 2 ? '完了にする' : '完了にする'}
            >
                {code === 3 && '✓'}
                {code === 2 && '▶'}
            </button>
            {showPlay && (
                <button
                    className="status-cb-play"
                    onClick={handlePlayClick}
                    title="着手中にする"
                >
                    ▶
                </button>
            )}
            {showRevert && (
                <button
                    className="status-cb-revert"
                    onClick={handleRevertClick}
                    title="未着手に戻す"
                >
                    ↩
                </button>
            )}
            <style jsx>{`
                .status-cb-wrap {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-shrink: 0;
                }
                .status-cb-main {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    border: 2px solid var(--border-color);
                    background: transparent;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-size: 0.85rem;
                    color: transparent;
                    transition: all 0.2s;
                    position: relative;
                    overflow: visible;
                }
                .status-cb-main.disabled {
                    cursor: not-allowed;
                    opacity: 0.5;
                    pointer-events: none;
                }
                .status-cb-main.cancelled {
                    cursor: not-allowed;
                    opacity: 0.5;
                    border-color: var(--color-text-disabled);
                    background: var(--color-surface-hover);
                }
                .status-cb-main:not(.cancelled):hover {
                    border-color: var(--color-primary);
                    background: var(--color-primary-subtle);
                }
                .status-cb-main.checked {
                    background: var(--color-success);
                    border-color: var(--color-success);
                    color: white;
                    font-weight: 700;
                }
                .status-cb-main.checked:not(.cancelled):hover {
                    background: var(--color-success);
                    border-color: var(--color-success);
                    opacity: 0.85;
                }
                .status-cb-main.in-progress {
                    background: transparent;
                    border-color: var(--color-primary);
                    color: var(--color-primary);
                    font-size: 0.7rem;
                    font-weight: 700;
                }
                .status-cb-main.in-progress:hover {
                    background: var(--color-primary-subtle);
                }
                .status-cb-play {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    border: 1.5px solid var(--color-primary);
                    background: var(--color-primary-subtle);
                    color: var(--color-primary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.55rem;
                    transition: all 0.15s;
                    animation: statusCbFadeIn 0.15s ease;
                    flex-shrink: 0;
                }
                .status-cb-play:hover {
                    background: var(--color-primary);
                    color: white;
                    transform: scale(1.1);
                }
                .status-cb-revert {
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    border: 1.5px solid var(--color-text-muted);
                    background: var(--color-surface-hover);
                    color: var(--color-text-muted);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.65rem;
                    transition: all 0.15s;
                    animation: statusCbFadeIn 0.15s ease;
                    flex-shrink: 0;
                }
                .status-cb-revert:hover {
                    background: var(--color-text-muted);
                    color: white;
                    transform: scale(1.1);
                }
                @keyframes statusCbFadeIn {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                }

                /* Sparkle animations */
                .status-cb-main.sparkle {
                    animation: statusCbPop 0.4s cubic-bezier(.34,1.56,.64,1);
                }
                .status-cb-main.sparkle::before,
                .status-cb-main.sparkle::after {
                    content: '';
                    position: absolute;
                    border-radius: 50%;
                    pointer-events: none;
                }
                .status-cb-main.sparkle::before {
                    width: 40px; height: 40px; top: -6px; left: -6px;
                    border: 2px solid var(--color-success);
                    animation: statusCbRing 0.6s ease-out forwards;
                }
                .status-cb-main.sparkle::after {
                    width: 6px; height: 6px; background: var(--color-success);
                    top: -4px; left: 50%;
                    box-shadow:
                        12px 8px 0 #f59e0b,
                        -12px 8px 0 #3b82f6,
                        6px -12px 0 #ef4444,
                        -8px -10px 0 #10b981,
                        14px -4px 0 #8b5cf6,
                        -14px -2px 0 #f97316;
                    animation: statusCbParticles 0.6s ease-out forwards;
                }
                @keyframes statusCbPop {
                    0% { transform: scale(1); }
                    40% { transform: scale(1.3); }
                    100% { transform: scale(1); }
                }
                @keyframes statusCbRing {
                    0% { transform: scale(0.5); opacity: 1; }
                    100% { transform: scale(1.8); opacity: 0; }
                }
                @keyframes statusCbParticles {
                    0% { transform: scale(1); opacity: 1; }
                    100% { transform: scale(2.5); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
