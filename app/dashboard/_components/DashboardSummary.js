'use client';

import { useMemo } from 'react';

/* ================================================================
   [A] Summary Section Component
   ================================================================ */

export default function SummarySection({ data }) {
    const { summary, projects, chartWeeks, velocity } = data;

    return (
        <div className="summary-card">
            <div className="summary-header">
                <span className="summary-label">今週のサマリー</span>
                {velocity && <span className="summary-velocity">{velocity}</span>}
            </div>

            <div className="summary-body">
                {/* Left: tables */}
                <div className="summary-left">
                    <SummaryTable summary={summary} />
                    {projects.length > 0 && <ProjectBreakdown projects={projects} />}
                </div>

                {/* Right: cumulative chart */}
                <div className="summary-right">
                    <CumulativeChart weeks={chartWeeks} />
                    <span className="chart-caption">直近8週の累積（完了 + 追加）</span>
                </div>
            </div>

            <style jsx>{`
                .summary-card {
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
                    box-shadow: var(--shadow-sm);
                }
                .summary-header {
                    display: flex; justify-content: space-between; align-items: flex-start;
                    margin-bottom: 1rem;
                }
                .summary-label {
                    font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted);
                    letter-spacing: 0.04em; text-transform: uppercase;
                }
                .summary-velocity {
                    font-size: 0.82rem; font-weight: 600; color: var(--color-accent);
                }
                .summary-body {
                    display: flex; gap: 1.5rem; align-items: flex-start;
                }
                .summary-left { flex: 0 0 auto; min-width: 280px; }
                .summary-right {
                    flex: 1; display: flex; flex-direction: column; align-items: center;
                    justify-content: center; min-height: 120px;
                }
                .chart-caption {
                    font-size: 0.68rem; color: var(--color-text-muted); margin-top: 0.25rem;
                }
                @media (max-width: 700px) {
                    .summary-body { flex-direction: column; }
                    .summary-left { min-width: unset; width: 100%; }
                }
            `}</style>
        </div>
    );
}

/* ================================================================
   Summary Table
   ================================================================ */

function SummaryTable({ summary }) {
    const periods = [
        ['今月', 'month'],
        ['今週', 'week'],
        ['今日', 'today'],
    ];

    return (
        <div className="st-wrap">
            <table className="st-table">
                <thead>
                    <tr>
                        <th className="st-th-label"></th>
                        <th className="st-th">完了</th>
                        <th className="st-th">追加</th>
                    </tr>
                </thead>
                <tbody>
                    {periods.map(([label, key], i) => (
                        <tr key={key} className={i < periods.length - 1 ? 'st-row-border' : ''}>
                            <td className="st-label">{label}</td>
                            <td className="st-value">{summary[key].completed}<span className="st-unit">件</span></td>
                            <td className="st-value">{summary[key].created}<span className="st-unit">件</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <style jsx>{`
                .st-wrap { margin-bottom: 1rem; }
                .st-table { border-collapse: collapse; width: 100%; }
                .st-th-label { text-align: left; font-weight: 400; padding: 0 0 0.35rem; }
                .st-th {
                    text-align: right; font-weight: 400; padding: 0 0 0.35rem;
                    font-size: 0.68rem; color: var(--color-text-muted);
                }
                .st-row-border td { border-bottom: 1px solid var(--border-color); }
                .st-label {
                    font-size: 0.78rem; color: var(--color-text-secondary);
                    padding: 0.4rem 0; width: 48px;
                }
                .st-value {
                    font-size: 0.85rem; font-weight: 600; color: var(--color-text);
                    text-align: right; padding: 0.4rem 0; min-width: 44px;
                }
                .st-unit { font-size: 0.65rem; font-weight: 400; color: var(--color-text-muted); margin-left: 2px; }
            `}</style>
        </div>
    );
}

/* ================================================================
   Project Breakdown
   ================================================================ */

function ProjectBreakdown({ projects }) {
    return (
        <div className="pb-wrap">
            <div className="pb-header">プロジェクト別</div>
            <table className="pb-table">
                <thead>
                    <tr>
                        <th className="pb-th-name"></th>
                        <th className="pb-th">今月</th>
                        <th className="pb-th">今週</th>
                        <th className="pb-th">今日</th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map((p, i) => (
                        <tr key={i} className={i < projects.length - 1 ? 'pb-row-border' : ''}>
                            <td className="pb-name">
                                <span className="pb-dot" style={{ background: p.color }} />
                                {p.name}
                            </td>
                            <ProjCell data={p.month} />
                            <ProjCell data={p.week} />
                            <ProjCell data={p.today} />
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="pb-legend">完了 / <span className="pb-legend-add">追加</span></div>

            <style jsx>{`
                .pb-wrap { }
                .pb-header {
                    font-size: 0.68rem; color: var(--color-text-muted); margin-bottom: 0.35rem;
                }
                .pb-table { border-collapse: collapse; width: 100%; }
                .pb-th-name { text-align: left; font-weight: 400; padding: 0 0 0.25rem; }
                .pb-th {
                    text-align: center; font-weight: 400; padding: 0 0.25rem 0.25rem;
                    font-size: 0.6rem; color: var(--color-text-muted);
                }
                .pb-row-border td { border-bottom: 1px solid var(--border-color); }
                .pb-name {
                    font-size: 0.73rem; color: var(--color-text-secondary);
                    padding: 0.3rem 0; display: flex; align-items: center; gap: 0.35rem;
                }
                .pb-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
                .pb-legend {
                    font-size: 0.6rem; color: var(--color-text-muted); margin-top: 0.35rem;
                }
                .pb-legend-add { color: var(--color-accent-subtle); }
            `}</style>
        </div>
    );
}

function ProjCell({ data }) {
    if (data.completed === 0 && data.created === 0) {
        return <td className="pc-empty">—</td>;
    }
    return (
        <td className="pc-cell">
            <span className="pc-comp">{data.completed}</span>
            <span className="pc-sep">/</span>
            <span className="pc-add">{data.created}</span>

            <style jsx>{`
                .pc-empty { font-size: 0.72rem; color: var(--color-text-disabled); text-align: center; padding: 0.2rem 0.25rem; }
                .pc-cell { font-size: 0.72rem; text-align: center; padding: 0.2rem 0.25rem; white-space: nowrap; }
                .pc-comp { color: var(--color-text-secondary); }
                .pc-sep { color: var(--color-text-disabled); margin: 0 1px; }
                .pc-add { color: var(--color-accent); opacity: 0.7; }
            `}</style>
        </td>
    );
}

/* ================================================================
   Cumulative Area Chart (SVG)
   ================================================================ */

const CHART_W = 380;
const CHART_H = 110;
const PAD = { t: 8, r: 12, b: 24, l: 12 };
const INNER_W = CHART_W - PAD.l - PAD.r;
const INNER_H = CHART_H - PAD.t - PAD.b;

function CumulativeChart({ weeks }) {
    // Build cumulative data
    const pts = useMemo(() => {
        const result = [];
        for (let i = 0; i < weeks.length; i++) {
            const prev = result[i - 1] || { cumC: 0, cumT: 0 };
            result.push({
                cumC: prev.cumC + weeks[i].completed,
                cumT: prev.cumT + weeks[i].completed + weeks[i].created,
            });
        }
        return result;
    }, [weeks]);

    const max = Math.max(pts[pts.length - 1]?.cumT || 1, 1);
    const sx = (i) => PAD.l + (i / Math.max(pts.length - 1, 1)) * INNER_W;
    const sy = (v) => PAD.t + INNER_H - (v / max) * INNER_H;

    if (pts.length === 0) return null;

    const compLine = pts.map((p, i) => `${sx(i)},${sy(p.cumC)}`).join(' ');
    const totalLine = pts.map((p, i) => `${sx(i)},${sy(p.cumT)}`).join(' ');
    const compArea = `${PAD.l},${PAD.t + INNER_H} ${compLine} ${sx(pts.length - 1)},${PAD.t + INNER_H}`;
    const createdArea = pts.map((p, i) => `${sx(i)},${sy(p.cumT)}`).join(' ')
        + ' ' + [...pts].reverse().map((p, i) => `${sx(pts.length - 1 - i)},${sy(p.cumC)}`).join(' ');

    const last = pts[pts.length - 1];

    return (
        <svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            style={{ display: 'block', maxWidth: '100%', height: 'auto' }}>
            <defs>
                <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.03" />
                </linearGradient>
                <linearGradient id="gAdd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-text-muted)" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="var(--color-text-muted)" stopOpacity="0.02" />
                </linearGradient>
            </defs>
            {/* Area fills */}
            <polygon points={compArea} fill="url(#gComp)" />
            <polygon points={createdArea} fill="url(#gAdd)" />
            {/* Lines */}
            <polyline points={compLine} fill="none" stroke="var(--color-accent)" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={totalLine} fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2"
                strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" opacity="0.5" />
            {/* Week labels */}
            {weeks.map((w, i) => (
                <text key={i} x={sx(i)} y={CHART_H - 4} textAnchor="middle"
                    fontSize="8" fill="var(--color-text-disabled)">{w.label}</text>
            ))}
            {/* End markers */}
            <circle cx={sx(pts.length - 1)} cy={sy(last.cumC)} r={3.5} fill="var(--color-accent)" />
            <circle cx={sx(pts.length - 1)} cy={sy(last.cumT)} r={3.5} fill="var(--color-text-muted)" opacity="0.6" />
            {/* End values */}
            <text x={sx(pts.length - 1) - 8} y={sy(last.cumC) - 8} textAnchor="end"
                fontSize="10" fontWeight="700" fill="var(--color-accent)">{last.cumC}</text>
            <text x={sx(pts.length - 1) - 8} y={sy(last.cumT) - 8} textAnchor="end"
                fontSize="10" fontWeight="700" fill="var(--color-text-muted)" opacity="0.7">{last.cumT}</text>
            {/* Legend */}
            <rect x={PAD.l} y={0} width={7} height={7} rx={1.5} fill="var(--color-accent)" opacity="0.5" />
            <text x={PAD.l + 10} y={7} fontSize="8" fill="var(--color-text-muted)">完了</text>
            <rect x={PAD.l + 36} y={0} width={7} height={7} rx={1.5} fill="var(--color-text-muted)" opacity="0.3" />
            <text x={PAD.l + 48} y={7} fontSize="8" fill="var(--color-text-muted)">追加</text>
        </svg>
    );
}
