'use client';

import { useState, useEffect } from 'react';
import { fetchDb, formatMin } from '@/lib/utils';

export default function DashboardPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadDashboard = async () => {
            try {
                const db = await fetchDb();
                const dateStr = new Date().toLocaleDateString('sv-SE');

                // 1. Overall
                const overallData = await db.select(`SELECT COUNT(*) as total, SUM(CASE WHEN status_code = 3 THEN 1 ELSE 0 END) as completed FROM tasks WHERE status_code != 5 AND archived_at IS NULL`);

                // 2. Today
                // 2a. Tasks
                const todayTasks = await db.select(`SELECT COUNT(*) as total, SUM(CASE WHEN status_code = 3 THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status_code != 3 THEN estimated_hours ELSE 0 END) as remainingMinutes FROM tasks WHERE status_code != 5 AND archived_at IS NULL AND (today_date = $1 OR due_date = $2 OR (due_date < $3 AND status_code != 3) OR (status_code = 3 AND date(completed_at) = $4))`, [dateStr, dateStr, dateStr, dateStr]);

                // 2b. Routines
                const { isRoutineActiveOnDate } = await import('@/lib/holidayService');

                // Get all active routines
                const allRoutines = await db.select(`
                  SELECT r.*
                  FROM routines r
                  WHERE r.enabled = 1
                    AND (r.end_date IS NULL OR r.end_date >= $1)
                `, [dateStr]);

                // Today completions
                const todayComps = await db.select(`SELECT routine_id FROM routine_completions WHERE completion_date = $1`, [dateStr]);
                const todayCompSet = new Set(todayComps.map(c => c.routine_id));

                let todayTotal = todayTasks[0]?.total || 0;
                let todayCompleted = todayTasks[0]?.completed || 0;
                let todayRemainingMinutes = todayTasks[0]?.remainingMinutes || 0;

                for (const r of allRoutines) {
                    if (await isRoutineActiveOnDate(db, r, dateStr)) {
                        todayTotal++;
                        if (todayCompSet.has(r.id)) {
                            todayCompleted++;
                        } else {
                            todayRemainingMinutes += r.estimated_hours || 0;
                        }
                    }
                }

                // 3. Biz3
                const d3 = new Date();
                d3.setDate(d3.getDate() + 3);
                const biz3Date = d3.toLocaleDateString('sv-SE');
                const biz3Tasks = await db.select(`SELECT COUNT(*) as total, SUM(CASE WHEN status_code = 3 THEN 1 ELSE 0 END) as completed FROM tasks WHERE status_code != 5 AND archived_at IS NULL AND due_date >= $1 AND due_date <= $2`, [dateStr, biz3Date]);

                // For Biz3 routines, we need to iterate the next 3 days and count matching routines
                let biz3Total = biz3Tasks[0]?.total || 0;
                let biz3Completed = biz3Tasks[0]?.completed || 0;

                for (let i = 0; i <= 3; i++) {
                    const cd = new Date();
                    cd.setDate(cd.getDate() + i);
                    const cdStr = cd.toLocaleDateString('sv-SE');

                    const cdComps = await db.select(`SELECT routine_id FROM routine_completions WHERE completion_date = $1`, [cdStr]);
                    const cdCompSet = new Set(cdComps.map(c => c.routine_id));

                    for (const r of allRoutines) {
                        if (await isRoutineActiveOnDate(db, r, cdStr)) {
                            biz3Total++;
                            if (cdCompSet.has(r.id)) biz3Completed++;
                        }
                    }
                }

                // 4. Daily Completions
                const dailyData = await db.select(`
                    SELECT DATE(completed_at) as date, COUNT(*) as count
                    FROM tasks
                    WHERE status_code = 3 AND completed_at IS NOT NULL AND archived_at IS NULL AND DATE(completed_at) >= date('now', 'localtime', '-6 days')
                    GROUP BY DATE(completed_at)
                    ORDER BY date ASC
                `);

                const routineDailyData = await db.select(`
                    SELECT DATE(completion_date) as date, COUNT(*) as count
                    FROM routine_completions
                    WHERE DATE(completion_date) >= date('now', 'localtime', '-6 days')
                    GROUP BY DATE(completion_date)
                `);

                const dailyCompletions = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const ds = d.toLocaleDateString('sv-SE');
                    const taskCount = dailyData.find(x => x.date === ds)?.count || 0;
                    const routineCount = routineDailyData.find(x => x.date === ds)?.count || 0;
                    dailyCompletions.push({ date: ds, count: taskCount + routineCount });
                }

                // 5. Status Distribution (Tasks Only)
                const stData = await db.select(`
                    SELECT sm.code, sm.label, sm.color, COUNT(t.id) as count
                    FROM status_master sm
                    LEFT JOIN tasks t ON sm.code = t.status_code AND t.status_code != 5 AND t.archived_at IS NULL
                    GROUP BY sm.code
                    ORDER BY sm.sort_order
                `);

                // 6. Overdue (Tasks Only)
                const overdueTasks = await db.select(`
                    SELECT id, title, due_date
                    FROM tasks
                    WHERE status_code != 3 AND status_code != 5 AND archived_at IS NULL AND due_date < $1
                    ORDER BY due_date ASC
                `, [dateStr]);

                setData({
                    overall: { total: overallData[0]?.total || 0, completed: overallData[0]?.completed || 0 },
                    today: { total: todayTotal, completed: todayCompleted, remainingMinutes: todayRemainingMinutes },
                    biz3: { total: biz3Total, completed: biz3Completed },
                    dailyCompletions,
                    statusDistribution: stData,
                    overdue: { count: overdueTasks.length, tasks: overdueTasks.slice(0, 5) }
                });
            } catch (err) {
                console.error("Dashboard Tauri DB Error", err);
            } finally {
                setLoading(false);
            }
        };

        loadDashboard();
    }, []);

    if (loading) return (
        <div className="page-container" style={{ maxWidth: 960 }}>
            <h2 className="page-title">📊 ダッシュボード</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '3rem', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                <span className="spinner" /> 読み込み中...
            </div>
        </div>
    );

    if (!data) return null;

    const { overall, today, biz3, dailyCompletions, statusDistribution, overdue } = data;
    const overallPct = overall.total > 0 ? Math.round((overall.completed / overall.total) * 100) : 0;
    const todayPct = today.total > 0 ? Math.round((today.completed / today.total) * 100) : 0;
    const biz3Pct = biz3.total > 0 ? Math.round((biz3.completed / biz3.total) * 100) : 0;
    const maxDailyCount = Math.max(...dailyCompletions.map(d => d.count), 1);
    const maxStatusCount = Math.max(...statusDistribution.map(s => s.count), 1);

    return (
        <div className="db-root">
            <h2 className="page-title">📊 ダッシュボード</h2>
            <p className="db-subtitle">タスクの進捗状況をひと目で確認</p>

            {/* Top Row: 3 ring cards */}
            <div className="db-top-row">
                <RingCard title="全体の完了率" pct={overallPct} total={overall.total} done={overall.completed}
                    color="var(--color-primary)" subtitle={`${overall.completed} / ${overall.total} タスク完了`} />
                <RingCard title="今日の進捗" pct={todayPct} total={today.total} done={today.completed}
                    color={todayPct === 100 && today.total > 0 ? 'var(--color-success)' : '#f59e0b'}
                    subtitle={today.total > 0 ? `残り${today.total - today.completed}件 / 想定${formatMin(today.remainingMinutes)}` : '今日のタスクなし'} />
                <RingCard title="直近3営業日" pct={biz3Pct} total={biz3.total} done={biz3.completed}
                    color="#8b5cf6"
                    subtitle={biz3.total > 0 ? `${biz3.completed} / ${biz3.total} タスク完了` : '期限内タスクなし'} />
            </div>

            {/* Bottom Row */}
            <div className="db-bottom-row">
                {/* Daily Completions Chart */}
                <div className="db-card db-card-wide">
                    <h3 className="db-card-title">📈 直近7日間の完了数</h3>
                    <div className="db-bar-chart">
                        {dailyCompletions.map((d, i) => {
                            const dayLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
                            const dow = new Date(d.date + 'T00:00:00').getDay();
                            const isWeekend = dow === 0 || dow === 6;
                            return (
                                <div key={i} className="bar-col">
                                    <span className="bar-value">{d.count > 0 ? d.count : ''}</span>
                                    <div className="bar-track">
                                        <div className="bar-fill" style={{
                                            height: `${(d.count / maxDailyCount) * 100}%`,
                                            background: d.date === new Date().toLocaleDateString('sv-SE')
                                                ? 'var(--color-primary)' : 'var(--color-primary-subtle)',
                                            borderColor: d.date === new Date().toLocaleDateString('sv-SE') ? 'var(--color-primary)' : 'transparent'
                                        }} />
                                    </div>
                                    <span className={`bar-label ${isWeekend ? 'weekend' : ''}`}>{dayLabel}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="db-card">
                    <h3 className="db-card-title">📊 ステータス分布</h3>
                    <div className="db-status-list">
                        {statusDistribution.map((s, i) => (
                            <div key={i} className="status-bar-row">
                                <div className="status-bar-label">
                                    <span className="status-dot" style={{ background: s.color }} />
                                    <span>{s.label}</span>
                                    <span className="status-count">{s.count}</span>
                                </div>
                                <div className="status-bar-track">
                                    <div className="status-bar-fill" style={{
                                        width: `${(s.count / maxStatusCount) * 100}%`,
                                        background: s.color
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Overdue Warning */}
            {overdue.count > 0 && (
                <div className="db-card db-overdue">
                    <h3 className="db-card-title">⚠️ 期限切れタスク <span className="overdue-badge">{overdue.count}件</span></h3>
                    <div className="overdue-list">
                        {overdue.tasks.map(t => (
                            <div key={t.id} className="overdue-item">
                                <span className="overdue-title">{t.title}</span>
                                <span className="overdue-date">📅 {t.due_date}</span>
                            </div>
                        ))}
                        {overdue.count > 5 && (
                            <div className="overdue-more">他 {overdue.count - 5} 件</div>
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
        .db-root { max-width: 960px; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .db-subtitle { color: var(--color-text-muted); font-size: 0.9rem; margin-top: -1.25rem; margin-bottom: 2rem; }

        /* Top Row */
        .db-top-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }

        /* Bottom Row */
        .db-bottom-row { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1rem; margin-bottom: 1rem; }

        /* Cards */
        .db-card {
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
          box-shadow: var(--shadow-sm);
        }
        .db-card-wide { grid-column: span 1; }
        .db-card-title {
          font-size: 0.85rem; font-weight: 600; color: var(--color-text-secondary);
          margin: 0 0 1rem 0;
        }

        /* Bar Chart */
        .db-bar-chart { display: flex; gap: 0.5rem; align-items: flex-end; height: 140px; }
        .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.3rem; height: 100%; }
        .bar-value { font-size: 0.7rem; font-weight: 700; color: var(--color-primary); min-height: 16px; }
        .bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
        .bar-fill {
          width: 100%; min-height: 4px; border-radius: 4px 4px 0 0;
          transition: height 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .bar-label { font-size: 0.68rem; color: var(--color-text-muted); white-space: nowrap; }
        .bar-label.weekend { color: var(--color-danger); opacity: 0.6; }

        /* Status Distribution */
        .db-status-list { display: flex; flex-direction: column; gap: 0.65rem; }
        .status-bar-row { display: flex; flex-direction: column; gap: 0.25rem; }
        .status-bar-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--color-text-secondary); }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .status-count { margin-left: auto; font-weight: 700; color: var(--color-text); font-size: 0.85rem; }
        .status-bar-track { height: 6px; background: var(--color-surface-hover); border-radius: 3px; overflow: hidden; }
        .status-bar-fill { height: 100%; border-radius: 3px; transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1); }

        /* Overdue */
        .db-overdue { border-color: rgba(220, 38, 38, 0.2); background: rgba(220, 38, 38, 0.02); }
        .overdue-badge {
          background: var(--color-danger); color: white; font-size: 0.7rem;
          padding: 0.1rem 0.5rem; border-radius: 10px; margin-left: 0.4rem; font-weight: 700;
        }
        .overdue-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .overdue-item { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.4rem 0; }
        .overdue-title { font-size: 0.85rem; color: var(--color-text); font-weight: 500; }
        .overdue-date { font-size: 0.78rem; color: var(--color-danger); white-space: nowrap; }
        .overdue-more { font-size: 0.8rem; color: var(--color-text-muted); text-align: center; padding-top: 0.3rem; }

        @media (max-width: 768px) {
          .db-top-row { grid-template-columns: 1fr; }
          .db-bottom-row { grid-template-columns: 1fr; }
        }
      `}</style>
        </div>
    );
}

/* ---- Reusable Ring Card Component ---- */
function RingCard({ title, pct, total, done, color, subtitle }) {
    return (
        <div className="ring-card">
            <h3 className="ring-card-title">{title}</h3>
            <div className="ring-card-body">
                <div className="ring-area">
                    <svg viewBox="0 0 120 120" className="ring-svg">
                        <circle cx="60" cy="60" r="50" className="ring-bg2" />
                        <circle cx="60" cy="60" r="50" className="ring-fill2"
                            style={{ strokeDasharray: `${pct * 3.14} 314`, stroke: color }} />
                    </svg>
                    <div className="ring-center">
                        <span className="ring-pct2">{pct}<small>%</small></span>
                    </div>
                </div>
                <p className="ring-card-sub">{subtitle}</p>
            </div>

            <style jsx>{`
        .ring-card {
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
          box-shadow: var(--shadow-sm); text-align: center;
          transition: all 0.2s;
        }
        .ring-card:hover { box-shadow: var(--shadow-md); border-color: var(--border-color-hover); }
        .ring-card-title { font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); margin: 0 0 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .ring-card-body { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; }

        .ring-area { position: relative; width: 90px; height: 90px; }
        .ring-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ring-bg2 { fill: none; stroke: var(--color-surface-hover); stroke-width: 8; }
        .ring-fill2 { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dasharray 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
        .ring-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .ring-pct2 { font-size: 1.4rem; font-weight: 800; color: var(--color-text); }
        .ring-pct2 small { font-size: 0.7rem; font-weight: 600; }

        .ring-card-sub { font-size: 0.78rem; color: var(--color-text-muted); margin: 0; }
      `}</style>
        </div>
    );
}
