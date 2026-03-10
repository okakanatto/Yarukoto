'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchDb } from '@/lib/utils';
import { computeVelocityText, buildHeatmapData, heatmapQuartiles, heatLevel, groupIntoWeeks } from '@/lib/dashboardUtils';

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export default function DashboardPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboard().then(setData).catch(err => {
            console.error('Dashboard load error', err);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                detail: { message: 'ダッシュボードの読み込みに失敗しました', type: 'error' }
            }));
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ maxWidth: 960, animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <h2 className="page-title">ダッシュボード</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '3rem', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                <span className="spinner" /> 読み込み中...
            </div>
        </div>
    );

    if (!data) return null;

    const now = new Date();
    const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${WEEKDAY_NAMES[now.getDay()]}）`;

    return (
        <div className="db-root">
            <h2 className="page-title">ダッシュボード</h2>
            <p className="db-date">{dateLabel}</p>

            <SummarySection data={data} />
            <FootprintMap heatmap={data.heatmap} />

            <style jsx>{`
                .db-root { max-width: 960px; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .db-date { color: var(--color-text-muted); font-size: 0.82rem; margin-top: -1.25rem; margin-bottom: 1.5rem; }
            `}</style>
        </div>
    );
}

/* ================================================================
   Data Loading
   ================================================================ */

async function loadDashboard() {
    const db = await fetchDb();
    const today = new Date().toLocaleDateString('sv-SE');

    // Get the start of the current week (Monday)
    const nowDate = new Date();
    const dow = nowDate.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const weekStart = new Date(nowDate);
    weekStart.setDate(weekStart.getDate() + mondayOffset);
    const weekStartStr = weekStart.toLocaleDateString('sv-SE');

    // Get the start of the current month
    const monthStart = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-01`;

    // --- Summary: completed & created counts for month/week/today ---
    const summaryRows = await db.select(`
        SELECT
            SUM(CASE WHEN date(completed_at) >= $1 THEN 1 ELSE 0 END) as month_completed,
            SUM(CASE WHEN date(created_at) >= $2 THEN 1 ELSE 0 END) as month_created,
            SUM(CASE WHEN date(completed_at) >= $3 THEN 1 ELSE 0 END) as week_completed,
            SUM(CASE WHEN date(created_at) >= $4 THEN 1 ELSE 0 END) as week_created,
            SUM(CASE WHEN date(completed_at) = $5 THEN 1 ELSE 0 END) as today_completed,
            SUM(CASE WHEN date(created_at) = $6 THEN 1 ELSE 0 END) as today_created
        FROM tasks
        WHERE status_code != 5
    `, [monthStart, monthStart, weekStartStr, weekStartStr, today, today]);

    // Routine completions for summary
    const routineSummaryRows = await db.select(`
        SELECT
            SUM(CASE WHEN completion_date >= $1 THEN 1 ELSE 0 END) as month_completed,
            SUM(CASE WHEN completion_date >= $2 THEN 1 ELSE 0 END) as week_completed,
            SUM(CASE WHEN completion_date = $3 THEN 1 ELSE 0 END) as today_completed
        FROM routine_completions
    `, [monthStart, weekStartStr, today]);

    const s = summaryRows[0] || {};
    const rs = routineSummaryRows[0] || {};

    const summary = {
        month: { completed: (s.month_completed || 0) + (rs.month_completed || 0), created: s.month_created || 0 },
        week: { completed: (s.week_completed || 0) + (rs.week_completed || 0), created: s.week_created || 0 },
        today: { completed: (s.today_completed || 0) + (rs.today_completed || 0), created: s.today_created || 0 },
    };

    // --- Project breakdown ---
    const projectRows = await db.select(`
        SELECT
            p.id, p.name, p.color,
            SUM(CASE WHEN date(t.completed_at) >= $1 THEN 1 ELSE 0 END) as month_completed,
            SUM(CASE WHEN date(t.created_at) >= $2 THEN 1 ELSE 0 END) as month_created,
            SUM(CASE WHEN date(t.completed_at) >= $3 THEN 1 ELSE 0 END) as week_completed,
            SUM(CASE WHEN date(t.created_at) >= $4 THEN 1 ELSE 0 END) as week_created,
            SUM(CASE WHEN date(t.completed_at) = $5 THEN 1 ELSE 0 END) as today_completed,
            SUM(CASE WHEN date(t.created_at) = $6 THEN 1 ELSE 0 END) as today_created
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id AND t.status_code != 5
        WHERE p.archived_at IS NULL
        GROUP BY p.id
    `, [monthStart, monthStart, weekStartStr, weekStartStr, today, today]);

    // Sort by month activity (completed + created) descending, take top 5
    const projectsWithActivity = projectRows.map(p => ({
        ...p,
        monthActivity: (p.month_completed || 0) + (p.month_created || 0),
    })).filter(p => p.monthActivity > 0).sort((a, b) => b.monthActivity - a.monthActivity);

    const topProjects = projectsWithActivity.slice(0, 5);
    const otherProjects = projectsWithActivity.slice(5);

    let projects = topProjects.map(p => ({
        name: p.name,
        color: p.color,
        month: { completed: p.month_completed || 0, created: p.month_created || 0 },
        week: { completed: p.week_completed || 0, created: p.week_created || 0 },
        today: { completed: p.today_completed || 0, created: p.today_created || 0 },
    }));

    if (otherProjects.length > 0) {
        const other = { name: 'その他', color: '#9CA3AF', month: { completed: 0, created: 0 }, week: { completed: 0, created: 0 }, today: { completed: 0, created: 0 } };
        for (const p of otherProjects) {
            other.month.completed += p.month_completed || 0;
            other.month.created += p.month_created || 0;
            other.week.completed += p.week_completed || 0;
            other.week.created += p.week_created || 0;
            other.today.completed += p.today_completed || 0;
            other.today.created += p.today_created || 0;
        }
        projects.push(other);
    }

    // --- Weekly data for cumulative chart (8 weeks) ---
    // Calculate 8 weeks of Monday starts going back from current week
    const weeksData = [];
    for (let w = 7; w >= 0; w--) {
        const wkStart = new Date(weekStart);
        wkStart.setDate(wkStart.getDate() - w * 7);
        const wkEnd = new Date(wkStart);
        wkEnd.setDate(wkEnd.getDate() + 6);
        const wkStartStr = wkStart.toLocaleDateString('sv-SE');
        const wkEndStr = wkEnd.toLocaleDateString('sv-SE');
        const label = `${wkStart.getMonth() + 1}/${wkStart.getDate()}`;
        weeksData.push({ wkStartStr, wkEndStr, label });
    }

    const chartStart = weeksData[0].wkStartStr;
    const chartEnd = weeksData[weeksData.length - 1].wkEndStr;

    // Heatmap needs 90 days back; use the earlier of chartStart and 89 days ago
    const heatmapStart = new Date(nowDate);
    heatmapStart.setDate(heatmapStart.getDate() - 89);
    const heatmapStartStr = heatmapStart.toLocaleDateString('sv-SE');
    const dataStart = heatmapStartStr < chartStart ? heatmapStartStr : chartStart;

    // Batch query: daily completed tasks in the extended range
    const dailyCompletedRows = await db.select(`
        SELECT date(completed_at) as d, COUNT(*) as c
        FROM tasks
        WHERE status_code != 5 AND date(completed_at) >= $1 AND date(completed_at) <= $2
        GROUP BY date(completed_at)
    `, [dataStart, chartEnd]);

    const dailyCreatedRows = await db.select(`
        SELECT date(created_at) as d, COUNT(*) as c
        FROM tasks
        WHERE status_code != 5 AND date(created_at) >= $1 AND date(created_at) <= $2
        GROUP BY date(created_at)
    `, [dataStart, chartEnd]);

    const dailyRoutineCompRows = await db.select(`
        SELECT completion_date as d, COUNT(*) as c
        FROM routine_completions
        WHERE completion_date >= $1 AND completion_date <= $2
        GROUP BY completion_date
    `, [dataStart, chartEnd]);

    // Build day-level lookup
    const completedByDay = {};
    for (const r of dailyCompletedRows) { completedByDay[r.d] = (completedByDay[r.d] || 0) + r.c; }
    for (const r of dailyRoutineCompRows) { completedByDay[r.d] = (completedByDay[r.d] || 0) + r.c; }
    const createdByDay = {};
    for (const r of dailyCreatedRows) { createdByDay[r.d] = (createdByDay[r.d] || 0) + r.c; }

    // Aggregate into weekly buckets
    const chartWeeks = weeksData.map(wk => {
        let completed = 0, created = 0;
        const start = new Date(wk.wkStartStr + 'T00:00:00');
        for (let d = 0; d < 7; d++) {
            const dt = new Date(start);
            dt.setDate(dt.getDate() + d);
            const ds = dt.toLocaleDateString('sv-SE');
            if (ds > wk.wkEndStr) break;
            completed += completedByDay[ds] || 0;
            created += createdByDay[ds] || 0;
        }
        return { label: wk.label, completed, created };
    });

    // --- Velocity: compare this week vs median of prior 4 weeks same-day-count ---
    // "This week so far" = chartWeeks[7] (current week)
    // "Prior 4 weeks at same day of week" means completed up to the same weekday
    const currentDow = nowDate.getDay() === 0 ? 7 : nowDate.getDay(); // Mon=1, Sun=7
    const thisWeekCompleted = summary.week.completed;

    // For prior 4 weeks, compute completed up to same day
    const priorWeekCompletions = [];
    for (let w = 1; w <= 4; w++) {
        const priorWkStart = new Date(weekStart);
        priorWkStart.setDate(priorWkStart.getDate() - w * 7);
        let count = 0;
        for (let d = 0; d < currentDow; d++) {
            const dt = new Date(priorWkStart);
            dt.setDate(dt.getDate() + d);
            const ds = dt.toLocaleDateString('sv-SE');
            count += completedByDay[ds] || 0;
        }
        priorWeekCompletions.push(count);
    }

    // Compute velocity text
    const velocity = computeVelocityText(thisWeekCompleted, priorWeekCompletions, chartWeeks, summary);

    // --- Heatmap: 90-day footprint data ---
    const heatmap = buildHeatmapData(completedByDay, createdByDay, nowDate);

    return { summary, projects, chartWeeks, velocity, heatmap };
}

/* ================================================================
   [A] Summary Section Component
   ================================================================ */

function SummarySection({ data }) {
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

/* ================================================================
   [C] Footprint Map (あしあとマップ)
   ================================================================ */

const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const HEAT_LEVEL_TIPS = ['—', '少し活動', '活動あり', 'かなり活発'];

function FootprintMap({ heatmap }) {
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
        setTooltip({
            text: `${label}: ${HEAT_LEVEL_TIPS[level]}${day.total > 0 ? `（${day.total}件）` : ''}`,
            x: rect.left - parentRect.left + rect.width / 2,
            y: rect.top - parentRect.top - 4,
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
                    <div className="fm-tooltip" style={{
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
                    box-shadow: var(--shadow-sm); margin-top: 1rem;
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
                    position: relative; height: 14px; margin-bottom: 3px; padding-left: 22px;
                }
                .fm-month {
                    position: absolute; font-size: 0.56rem; color: var(--color-text-disabled);
                }
                .fm-grid {
                    display: flex; gap: 3px;
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
                .fm-cell:not(.fm-cell-empty):not(.fm-cell-future):hover {
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
                .fm-legend {
                    display: flex; align-items: center; justify-content: flex-end;
                    gap: 4px; margin-top: 0.5rem; font-size: 0.56rem; color: var(--color-text-disabled);
                }
                .fm-legend-cell {
                    width: 10px; height: 10px;
                }
                .fm-legend-cell:hover { transform: none; }
            `}</style>
        </div>
    );
}
