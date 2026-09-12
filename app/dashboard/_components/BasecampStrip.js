'use client';

import { useCallback } from 'react';
import Link from 'next/link';

/* ================================================================
   [E] Basecamp Strip (ベースキャンプ・ストリップ)
   ================================================================ */

export default function BasecampStrip({ task }) {
    const handleAddTask = useCallback(() => {
        window.dispatchEvent(new CustomEvent('yarukoto:openFab'));
    }, []);

    return (
        <div className="bc-strip">
            <div className="bc-left">
                {task ? (
                    <>
                        <span className="bc-dot" />
                        <span className="bc-text">
                            着手中: <b className="bc-task-name">{task.title}</b>
                        </span>
                    </>
                ) : (
                    <span className="bc-empty-text">着手中のタスクはありません</span>
                )}
            </div>
            <div className="bc-actions">
                {task && (
                    <button type="button" className="bc-chip bc-chip-primary" onClick={() => window.dispatchEvent(new CustomEvent('yarukoto:openTask', { detail: { id: task.id } }))}>開く</button>
                )}
                <Link href="/today" className="bc-chip">今日の一覧</Link>
                <button className="bc-chip" onClick={handleAddTask} type="button">タスクを追加</button>
            </div>

            <style jsx global>{`
                .bc-strip {
                    background: var(--color-surface); border-radius: var(--radius-md);
                    padding: 16px; margin-top: 12px;
                    display: flex; align-items: center; justify-content: space-between;
                    min-height: 48px;
                }
                .bc-left {
                    display: flex; align-items: center; gap: 8px;
                    flex: 1; min-width: 0;
                }
                .bc-dot {
                    width: 6px; height: 6px; border-radius: 50%;
                    background: var(--color-accent); flex-shrink: 0;
                    animation: pulse 2s ease-in-out infinite;
                }
                .bc-text {
                    font-size: 0.74rem; color: var(--color-text-muted);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .bc-task-name { color: var(--color-text-secondary); font-weight: 500; }
                .bc-empty-text {
                    font-size: 0.74rem; color: var(--color-text-disabled);
                }
                .bc-actions {
                    display: flex; gap: 6px; flex-shrink: 0;
                }
                .bc-chip {
                    font-size: 0.68rem; padding: 0.3rem 0.75rem;
                    border-radius: 3px; cursor: pointer;
                    transition: background 100ms, color 100ms, border-color 100ms; white-space: nowrap;
                    font-family: inherit; text-decoration: none;
                    display: inline-flex; align-items: center;
                    background: transparent; color: var(--color-text-muted);
                    border: 1px solid var(--border-color);
                }
                .bc-chip:hover {
                    background: var(--color-surface-hover);
                    color: var(--color-text);
                    border-color: var(--border-color-hover);
                }
                .bc-chip.bc-chip-primary {
                    background: var(--color-accent); color: #fff;
                    border: none; font-weight: 600;
                }
                .bc-chip.bc-chip-primary:hover {
                    opacity: 0.85; color: #fff;
                    background: var(--color-accent);
                }
                @media (max-width: 600px) {
                    .bc-strip { flex-direction: column; gap: 8px; align-items: flex-start; }
                    .bc-actions { width: 100%; }
                }
            `}</style>
        </div>
    );
}
