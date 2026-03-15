'use client';

import { useState, useMemo, useCallback } from 'react';
import { heatmapQuartiles, heatLevel, groupIntoWeeks } from '@/lib/dashboardUtils';

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const HEAT_LEVEL_TIPS = ['—', '少し活動', '活動あり', 'かなり活発'];

/* ================================================================
   [C] Footprint Map (あしあとマップ)
   ================================================================ */

export default function FootprintMap({ heatmap }) {
    const { days, activeDays, totalCompleted } = heatmap;
    const [q1, q3] = useMemo(() => heatmapQuartiles(days), [days]);
    const weeks = useMemo(() => groupIntoWeeks(days), [days]);
    const [tooltip, setTooltip] = useState(null);

    const monthLabels = useMemo(() => {
        const labels = [];
        let lastMonth = -1;
        weeks.forEach((wk, wi) => {
            const dateStr = wk[0].dateStr;
            const m = parseInt(dateStr.split('-')[1], 10) - 1;
            if (m !== lastMonth) {
                labels.push({ month: m, weekIdx: wi });
                lastMonth = m;
            }
        });
        return labels;
    }, [weeks]);

    const handleCellEnter = useCallback((e, day) => {
        if (day.isFuture) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const parentRect = e.currentTarget.closest('.fm-grid').getBoundingClientRect();
        const level = heatLevel(day.total, q1, q3);
        const d = new Date(day.dateStr + 'T00:00:00');
        const label = `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_NAMES[d.getDay()]}）`;
        // BUG-16: Flip tooltip below when cell is near the top of the grid
        const relativeTop = rect.top - parentRect.top;
        const showBelow = relativeTop < 28;
        setTooltip({
            text: `${label}: ${HEAT_LEVEL_TIPS[level]}${day.total > 0 ? `（${day.total}件）` : ''}`,
            x: rect.left - parentRect.left + rect.width / 2,
            y: showBelow ? rect.bottom - parentRect.top + 4 : relativeTop - 4,
            below: showBelow,
        });
    }, [q1, q3]);

    const handleCellLeave = useCallback(() => setTooltip(null), []);

    return (
        <div className="fm-card">
            <div className="fm-header">
                <span className="fm-label">90日間のあしあと</span>
                <div className="fm-stats">
                    <span>90日中 <b className="fm-stat-num">{activeDays}</b> 日、手が動いた</span>
                    <span>完了 <b className="fm-stat-num">{totalCompleted}</b> 件</span>
                </div>
            </div>

            {/* Month labels row */}
            <div className="fm-months">
                {monthLabels.map((ml, i) => (
                    <span key={i} className="fm-month" style={{ left: 22 + ml.weekIdx * 14 }}>
                        {MONTH_NAMES[ml.month]}
                    </span>
                ))}
            </div>

            {/* Heatmap grid */}
            <div className="fm-grid" style={{ position: 'relative' }}>
                {/* Weekday labels */}
                <div className="fm-dow-col">
                    {['', '月', '', '水', '', '金', ''].map((l, i) => (
                        <div key={i} className="fm-dow-label">{l}</div>
                    ))}
                </div>

                {/* Week columns */}
                {weeks.map((wk, wi) => (
                    <div key={wi} className="fm-week-col">
                        {(() => {
                            const cells = [];
                            // Pad empty cells for the first day-of-week offset
                            for (let d = 0; d < wk[0].dow; d++) {
                                cells.push(<div key={`p${d}`} className="fm-cell fm-cell-empty" />);
                            }
                            wk.forEach(day => {
                                const level = heatLevel(day.total, q1, q3);
                                const cls = ['fm-cell',
                                    day.isFuture ? 'fm-cell-future' : `fm-cell-lv${level}`,
                                    day.isToday ? 'fm-cell-today' : '',
                                ].filter(Boolean).join(' ');
                                cells.push(
                                    <div
                                        key={day.dateStr}
                                        className={cls}
                                        onMouseEnter={e => handleCellEnter(e, day)}
                                        onMouseLeave={handleCellLeave}
                                    />
                                );
                            });
                            return cells;
                        })()}
                    </div>
                ))}

                {/* Tooltip */}
                {tooltip && (
                    <div className={`fm-tooltip${tooltip.below ? ' fm-tooltip-below' : ''}`} style={{
                        left: tooltip.x, top: tooltip.y,
                    }}>
                        {tooltip.text}
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="fm-legend">
                <span>少</span>
                <div className="fm-cell fm-cell-lv0 fm-legend-cell" />
                <div className="fm-cell fm-cell-lv1 fm-legend-cell" />
                <div className="fm-cell fm-cell-lv2 fm-legend-cell" />
                <div className="fm-cell fm-cell-lv3 fm-legend-cell" />
                <span>多</span>
            </div>

            <style jsx>{`
                .fm-card {
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
                    box-shadow: var(--shadow-sm);
                }
                .fm-header {
                    display: flex; justify-content: space-between; align-items: baseline;
                    margin-bottom: 0.75rem;
                }
                .fm-label {
                    font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted);
                    letter-spacing: 0.04em; text-transform: uppercase;
                }
                .fm-stats {
                    display: flex; gap: 1rem; font-size: 0.72rem; color: var(--color-text-muted);
                }
                .fm-stat-num { font-weight: 600; color: var(--color-text-secondary); }
                .fm-months {
                    position: relative; height: 18px; margin-bottom: 3px; padding-left: 22px;
                }
                .fm-month {
                    position: absolute; font-size: 0.56rem; color: var(--color-text-disabled);
                }
                .fm-grid {
                    display: flex; gap: 3px; overflow-x: auto;
                }
                .fm-dow-col {
                    display: flex; flex-direction: column; gap: 3px; width: 16px; flex-shrink: 0;
                }
                .fm-dow-label {
                    height: 11px; font-size: 0.5rem; color: var(--color-text-disabled);
                    display: flex; align-items: center;
                }
                .fm-week-col {
                    display: flex; flex-direction: column; gap: 3px;
                }
                .fm-cell {
                    width: 11px; height: 11px; border-radius: 2.5px;
                    transition: transform 0.12s;
                }
                .fm-cell:not(.fm-cell-empty):not(.fm-cell-future):not(.fm-legend-cell):hover {
                    transform: scale(1.35);
                }
                .fm-cell-empty { visibility: hidden; }
                .fm-cell-future { background: var(--heatmap-future); }
                .fm-cell-lv0 { background: var(--heatmap-lv0); }
                .fm-cell-lv1 { background: var(--heatmap-lv1); }
                .fm-cell-lv2 { background: var(--heatmap-lv2); }
                .fm-cell-lv3 { background: var(--heatmap-lv3); }
                .fm-cell-today { outline: 1.5px solid var(--color-text); outline-offset: -1px; }
                .fm-tooltip {
                    position: absolute; transform: translate(-50%, -100%);
                    padding: 3px 8px; border-radius: 4px;
                    background: var(--color-text); color: var(--color-background);
                    font-size: 0.62rem; white-space: nowrap; pointer-events: none;
                    z-index: 10;
                }
                .fm-tooltip-below {
                    transform: translate(-50%, 0);
                }
                .fm-legend {
                    display: flex; align-items: center; justify-content: flex-end;
                    gap: 4px; margin-top: 0.5rem; font-size: 0.56rem; color: var(--color-text-disabled);
                }
                .fm-legend-cell {
                    width: 10px; height: 10px;
                }
                @media (max-width: 700px) {
                    .fm-header { flex-direction: column; gap: 0.35rem; }
                    .fm-stats { flex-wrap: wrap; }
                }
            `}</style>
        </div>
    );
}
