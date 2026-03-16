'use client';

import { useMemo } from 'react';
import { generateRhythmSummary } from '@/lib/dashboardUtils';

/* ================================================================
   [B] Rhythm Section (自分のリズム)
   ================================================================ */

export default function RhythmSection({ rhythm }) {
    const summary = useMemo(() => generateRhythmSummary(rhythm), [rhythm]);
    const todayDow = new Date().getDay();
    const hasData = rhythm.some(d => d.rate > 0);

    return (
        <div className="rh-card">
            <span className="rh-label">自分のリズム</span>
            {hasData ? (
                <>
                    {summary && <div className="rh-summary">{summary}</div>}
                    <div className="rh-bars">
                        {rhythm.map((r, i) => {
                            const rhythmDow = i === 6 ? 0 : i + 1;
                            const isToday = todayDow === rhythmDow;
                            return (
                                <div key={i} className="rh-bar-col">
                                    <div
                                        className="rh-bar"
                                        style={{
                                            height: Math.max(4, r.rate * 44),
                                            background: r.rate >= 0.3
                                                ? `color-mix(in srgb, var(--color-accent) ${Math.round(20 + r.rate * 55)}%, transparent)`
                                                : 'var(--color-surface-active)',
                                        }}
                                    />
                                    <span className={`rh-day ${isToday ? 'rh-day-today' : ''}`}>{r.day}</span>
                                </div>
                            );
                        })}
                    </div>
                    <span className="rh-caption">直近10週の活動パターン</span>
                </>
            ) : (
                <div className="rh-empty">まだ活動パターンを分析中です</div>
            )}

            <style jsx>{`
                .rh-card {
                    background: var(--color-surface); border-radius: var(--radius-md);
                    padding: 16px; margin-bottom: 12px;
                    display: flex; flex-direction: column;
                }
                .rh-label {
                    font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted);
                    letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px;
                }
                .rh-summary {
                    font-size: 0.88rem; font-weight: 600; color: var(--color-text);
                    margin-bottom: 10px;
                }
                .rh-bars {
                    display: flex; align-items: flex-end; gap: 8px; height: 52px; margin-bottom: 6px;
                }
                .rh-bar-col {
                    display: flex; flex-direction: column; align-items: center; flex: 1;
                }
                .rh-bar {
                    width: 18px; border-radius: 2px;
                    transition: height 0.7s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .rh-day {
                    font-size: 0.62rem; color: var(--color-text-disabled);
                    margin-top: 4px; text-align: center;
                }
                .rh-day-today {
                    font-weight: 700; color: var(--color-text);
                }
                .rh-caption {
                    font-size: 0.58rem; color: var(--color-text-disabled); margin-top: 8px;
                }
                .rh-empty {
                    font-size: 0.78rem; color: var(--color-text-muted);
                    flex: 1; display: flex; flex-direction: column; align-items: flex-start;
                }
                .rh-empty::before {
                    content: ''; display: block; width: 32px; height: 3px;
                    background: var(--color-accent); margin-bottom: 8px;
                }
            `}</style>
        </div>
    );
}
