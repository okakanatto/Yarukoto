'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchDb, formatMin, parseTags } from '@/lib/utils';

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function DonePage() {
    const today = useMemo(() => toDateStr(new Date()), []);

    const [viewMode, setViewMode] = useState('monthly');
    const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
    const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
    const [viewWeekStart, setViewWeekStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    });
    const [selectedDay, setSelectedDay] = useState(today);

    const [summaryLoading, setSummaryLoading] = useState(true);
    const [dayCounts, setDayCounts] = useState({});
    const [periodStats, setPeriodStats] = useState({ tasks: 0, routines: 0 });

    const [detailLoading, setDetailLoading] = useState(false);
    const [dayTasks, setDayTasks] = useState([]);

    // Date range for summary query
    const dateRange = useMemo(() => {
        if (viewMode === 'monthly') {
            const start = `${viewYear}-${pad(viewMonth + 1)}-01`;
            const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
            const end = `${viewYear}-${pad(viewMonth + 1)}-${pad(lastDay)}`;
            return { start, end };
        }
        if (viewMode === 'weekly') {
            const start = toDateStr(viewWeekStart);
            const endD = new Date(viewWeekStart);
            endD.setDate(endD.getDate() + 6);
            return { start, end: toDateStr(endD) };
        }
        return { start: selectedDay, end: selectedDay };
    }, [viewMode, viewYear, viewMonth, viewWeekStart, selectedDay]);

    // Load summary counts for the period
    const loadSummary = useCallback(async () => {
        setSummaryLoading(true);
        try {
            const db = await fetchDb();
            const { start, end } = dateRange;

            const taskRes = await db.select(`
                SELECT date(completed_at) as date, COUNT(*) as count
                FROM tasks WHERE status_code = 3 AND completed_at IS NOT NULL
                AND date(completed_at) >= $1 AND date(completed_at) <= $2
                GROUP BY date(completed_at)
            `, [start, end]);

            const routineRes = await db.select(`
                SELECT completion_date as date, COUNT(*) as count
                FROM routine_completions
                WHERE completion_date >= $1 AND completion_date <= $2
                GROUP BY completion_date
            `, [start, end]);

            const counts = {};
            let totalT = 0, totalR = 0;
            for (const r of taskRes) {
                if (!counts[r.date]) counts[r.date] = { tasks: 0, routines: 0 };
                counts[r.date].tasks = r.count;
                totalT += r.count;
            }
            for (const r of routineRes) {
                if (!counts[r.date]) counts[r.date] = { tasks: 0, routines: 0 };
                counts[r.date].routines = r.count;
                totalR += r.count;
            }

            setDayCounts(counts);
            setPeriodStats({ tasks: totalT, routines: totalR });
        } catch (err) {
            console.error('Done summary load error', err);
        } finally {
            setSummaryLoading(false);
        }
    }, [dateRange]);

    // Load day detail tasks
    const loadDayDetail = useCallback(async (date) => {
        setDetailLoading(true);
        try {
            const db = await fetchDb();

            const tasks = await db.select(`
                SELECT t.id, t.title, t.completed_at, t.parent_id, t.estimated_hours,
                       t.archived_at, p.title as parent_title,
                       json_group_array(tg.id) as tag_ids,
                       json_group_array(tg.name) as tag_names,
                       json_group_array(tg.color) as tag_colors
                FROM tasks t
                LEFT JOIN tasks p ON t.parent_id = p.id
                LEFT JOIN task_tags tt ON t.id = tt.task_id
                LEFT JOIN tags tg ON tt.tag_id = tg.id
                WHERE t.status_code = 3 AND t.completed_at IS NOT NULL
                AND date(t.completed_at) = $1
                GROUP BY t.id
                ORDER BY t.completed_at DESC
            `, [date]);

            const routines = await db.select(`
                SELECT r.id, r.title, rc.completion_date
                FROM routine_completions rc
                JOIN routines r ON rc.routine_id = r.id
                WHERE rc.completion_date = $1
            `, [date]);

            const items = [
                ...tasks.map(t => ({ ...t, tags: parseTags(t), is_routine: false })),
                ...routines.map(r => ({
                    id: `routine_${r.id}`, title: r.title,
                    completed_at: r.completion_date, is_routine: true, tags: [],
                })),
            ];

            setDayTasks(items);
        } catch (err) {
            console.error('Done detail load error', err);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { loadDayDetail(selectedDay); }, [selectedDay, loadDayDetail]);

    // View mode switch
    const switchViewMode = useCallback((mode) => {
        setViewMode(mode);
        const d = new Date(selectedDay + 'T00:00:00');
        if (mode === 'monthly') {
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
        } else if (mode === 'weekly') {
            const ws = new Date(d);
            ws.setDate(ws.getDate() - ws.getDay());
            setViewWeekStart(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate()));
        }
    }, [selectedDay]);

    // Navigation
    const navigatePrev = useCallback(() => {
        if (viewMode === 'monthly') {
            let newYear = viewYear;
            let newMonth = viewMonth - 1;
            if (newMonth < 0) { newYear--; newMonth = 11; }
            setViewYear(newYear);
            setViewMonth(newMonth);
            setSelectedDay(`${newYear}-${pad(newMonth + 1)}-01`);
        } else if (viewMode === 'weekly') {
            const prev = new Date(viewWeekStart);
            prev.setDate(prev.getDate() - 7);
            const ws = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate());
            setViewWeekStart(ws);
            setSelectedDay(toDateStr(ws));
        } else {
            const d = new Date(selectedDay + 'T00:00:00');
            d.setDate(d.getDate() - 1);
            setSelectedDay(toDateStr(d));
        }
    }, [viewMode, viewYear, viewMonth, viewWeekStart, selectedDay]);

    const navigateNext = useCallback(() => {
        if (viewMode === 'monthly') {
            let newYear = viewYear;
            let newMonth = viewMonth + 1;
            if (newMonth > 11) { newYear++; newMonth = 0; }
            setViewYear(newYear);
            setViewMonth(newMonth);
            setSelectedDay(`${newYear}-${pad(newMonth + 1)}-01`);
        } else if (viewMode === 'weekly') {
            const next = new Date(viewWeekStart);
            next.setDate(next.getDate() + 7);
            const ws = new Date(next.getFullYear(), next.getMonth(), next.getDate());
            setViewWeekStart(ws);
            setSelectedDay(toDateStr(ws));
        } else {
            const d = new Date(selectedDay + 'T00:00:00');
            d.setDate(d.getDate() + 1);
            setSelectedDay(toDateStr(d));
        }
    }, [viewMode, viewYear, viewMonth, viewWeekStart, selectedDay]);

    const goToToday = useCallback(() => {
        const now = new Date();
        const ts = toDateStr(now);
        setSelectedDay(ts);
        setViewYear(now.getFullYear());
        setViewMonth(now.getMonth());
        const ws = new Date(now);
        ws.setDate(ws.getDate() - ws.getDay());
        setViewWeekStart(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate()));
    }, []);

    // Period label
    const periodLabel = useMemo(() => {
        if (viewMode === 'monthly') return `${viewYear}年${viewMonth + 1}月`;
        if (viewMode === 'weekly') {
            const endD = new Date(viewWeekStart);
            endD.setDate(endD.getDate() + 6);
            return `${viewWeekStart.getMonth() + 1}/${viewWeekStart.getDate()} 〜 ${endD.getMonth() + 1}/${endD.getDate()}`;
        }
        const d = new Date(selectedDay + 'T00:00:00');
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
    }, [viewMode, viewYear, viewMonth, viewWeekStart, selectedDay]);

    // Calendar cells for monthly view
    const calCells = useMemo(() => {
        if (viewMode !== 'monthly') return [];
        const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
        const fdow = new Date(viewYear, viewMonth, 1).getDay();
        const cells = [];
        for (let i = 0; i < fdow; i++) cells.push(null);
        for (let d = 1; d <= dim; d++) {
            const ds = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
            const c = dayCounts[ds];
            cells.push({ day: d, date: ds, total: c ? c.tasks + c.routines : 0 });
        }
        return cells;
    }, [viewMode, viewYear, viewMonth, dayCounts]);

    // Week days for weekly view
    const weekDays = useMemo(() => {
        if (viewMode !== 'weekly') return [];
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(viewWeekStart);
            d.setDate(d.getDate() + i);
            const ds = toDateStr(d);
            const c = dayCounts[ds];
            days.push({
                date: ds,
                wd: WEEKDAYS[d.getDay()],
                dom: d.getDate(),
                month: d.getMonth() + 1,
                total: c ? c.tasks + c.routines : 0,
                isWeekend: d.getDay() === 0 || d.getDay() === 6,
            });
        }
        return days;
    }, [viewMode, viewWeekStart, dayCounts]);

    const total = periodStats.tasks + periodStats.routines;

    const selectedDayLabel = useMemo(() => {
        const d = new Date(selectedDay + 'T00:00:00');
        return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
    }, [selectedDay]);

    // Heat map background for calendar cells
    const heatBg = (count) => {
        if (count === 0) return 'transparent';
        if (count <= 2) return 'rgba(22, 163, 74, 0.07)';
        if (count <= 5) return 'rgba(22, 163, 74, 0.14)';
        return 'rgba(22, 163, 74, 0.22)';
    };

    return (
        <div className="done-root">
            <div className="done-header">
                <h2 className="page-title">✅ やったタスク</h2>
                <p className="done-subtitle">完了したタスクを振り返る</p>
            </div>

            {/* Toolbar */}
            <div className="done-toolbar">
                <div className="done-view-modes">
                    {[
                        { mode: 'daily', label: '日別' },
                        { mode: 'weekly', label: '週別' },
                        { mode: 'monthly', label: '月別' },
                    ].map(v => (
                        <button key={v.mode}
                            className={`done-view-btn ${viewMode === v.mode ? 'active' : ''}`}
                            onClick={() => switchViewMode(v.mode)}>
                            {v.label}
                        </button>
                    ))}
                </div>
                <div className="done-nav">
                    <button className="done-nav-btn" onClick={navigatePrev} title="前へ">‹</button>
                    <span className="done-period">{periodLabel}</span>
                    <button className="done-nav-btn" onClick={navigateNext} title="次へ">›</button>
                </div>
                <button className="done-today-btn" onClick={goToToday}>今日</button>
            </div>

            {/* Period summary */}
            <div className="done-summary">
                <span className="done-summary-item">📋 タスク <strong>{periodStats.tasks}</strong></span>
                <span className="done-summary-item">🔄 ルーティン <strong>{periodStats.routines}</strong></span>
                <span className="done-summary-total">合計 <strong>{total}</strong> 件完了</span>
            </div>

            {summaryLoading && (
                <div className="done-loading"><span className="spinner" /> 読み込み中...</div>
            )}

            {/* Monthly Calendar */}
            {!summaryLoading && viewMode === 'monthly' && (
                <div className="done-calendar">
                    <div className="done-cal-weekdays">
                        {WEEKDAYS.map((w, i) => (
                            <span key={i} className={`done-cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</span>
                        ))}
                    </div>
                    <div className="done-cal-grid">
                        {calCells.map((cell, i) => {
                            if (cell === null) return <span key={`e${i}`} className="done-cal-cell empty" />;
                            const dow = new Date(cell.date + 'T00:00:00').getDay();
                            return (
                                <button key={cell.day}
                                    className={`done-cal-cell ${cell.date === today ? 'today' : ''} ${cell.date === selectedDay ? 'selected' : ''} ${dow === 0 || dow === 6 ? 'weekend' : ''}`}
                                    style={{ background: cell.date === selectedDay ? undefined : heatBg(cell.total) }}
                                    onClick={() => setSelectedDay(cell.date)}>
                                    <span className="done-cal-day">{cell.day}</span>
                                    {cell.total > 0 && <span className="done-cal-count">{cell.total}</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Weekly View */}
            {!summaryLoading && viewMode === 'weekly' && (
                <div className="done-weekly">
                    {weekDays.map(d => (
                        <button key={d.date}
                            className={`done-week-item ${d.date === selectedDay ? 'selected' : ''} ${d.date === today ? 'is-today' : ''}`}
                            onClick={() => setSelectedDay(d.date)}>
                            <span className={`done-week-wd ${d.isWeekend ? 'weekend' : ''}`}>{d.wd}</span>
                            <span className="done-week-date">{d.month}/{d.dom}</span>
                            {d.total > 0 ? (
                                <span className="done-week-badge">{d.total}</span>
                            ) : (
                                <span className="done-week-none">—</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Day Detail */}
            {!summaryLoading && (
                <div className="done-detail">
                    <h3 className="done-detail-title">
                        {selectedDayLabel}
                        <span className="done-detail-count">{dayTasks.length}件</span>
                    </h3>

                    {detailLoading && <div className="done-loading"><span className="spinner" /> 読み込み中...</div>}

                    {!detailLoading && dayTasks.length === 0 && (
                        <div className="done-empty">
                            <span className="done-empty-icon">📭</span>
                            <span>完了したタスクはありません</span>
                        </div>
                    )}

                    {!detailLoading && dayTasks.length > 0 && (
                        <div className="done-task-list">
                            {dayTasks.map((task, idx) => (
                                <div key={task.id}
                                    className={`done-task ${task.is_routine ? 'routine' : ''} ${task.archived_at ? 'archived' : ''}`}
                                    style={{ animationDelay: `${idx * 30}ms` }}>
                                    <span className="done-check">✓</span>
                                    <div className="done-task-info">
                                        <div className="done-task-title-row">
                                            {task.is_routine && <span className="done-badge-icon">🔄</span>}
                                            {task.archived_at && <span className="done-badge-icon" title="アーカイブ済み">📦</span>}
                                            <span className="done-task-title">{task.title}</span>
                                        </div>
                                        {task.parent_title && (
                                            <span className="done-parent">📌 {task.parent_title}</span>
                                        )}
                                        <div className="done-task-meta">
                                            {task.tags?.map(t => (
                                                <span key={t.id} className="done-tag" style={{ backgroundColor: t.color }}>{t.name}</span>
                                            ))}
                                            {task.estimated_hours > 0 && (
                                                <span className="done-meta-text">⏱ {formatMin(task.estimated_hours)}</span>
                                            )}
                                        </div>
                                    </div>
                                    {task.completed_at && !task.is_routine && (
                                        <span className="done-time">{task.completed_at.split(' ')[1]?.slice(0, 5)}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <style jsx global>{`
                .done-root { max-width: 800px; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .done-header { margin-bottom: 1rem; }
                .done-subtitle { color: var(--color-text-muted); font-size: 0.85rem; margin-top: -1rem; }

                /* Toolbar */
                .done-toolbar {
                    display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
                    margin-bottom: 1.25rem; padding: 0.6rem 0.85rem;
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
                }
                .done-view-modes {
                    display: flex; gap: 2px; background: var(--color-surface-hover);
                    border-radius: var(--radius-sm); padding: 2px;
                }
                .done-view-btn {
                    padding: 0.35rem 0.7rem; border: none; background: transparent;
                    border-radius: 6px; font-size: 0.78rem; font-weight: 600;
                    color: var(--color-text-muted); cursor: pointer;
                    transition: all 0.2s; font-family: inherit;
                }
                .done-view-btn:hover { color: var(--color-text); }
                .done-view-btn.active {
                    background: var(--color-primary); color: #fff;
                    box-shadow: 0 1px 4px rgba(79,110,247,0.2);
                }
                .done-nav { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
                .done-nav-btn {
                    background: transparent; border: 1px solid var(--border-color);
                    border-radius: 6px; width: 28px; height: 28px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.1rem; color: var(--color-text-muted);
                    cursor: pointer; transition: all 0.15s; font-family: inherit;
                }
                .done-nav-btn:hover { border-color: var(--border-color-hover); color: var(--color-text); background: var(--color-surface-hover); }
                .done-period { font-size: 0.88rem; font-weight: 600; color: var(--color-text); min-width: 120px; text-align: center; }
                .done-today-btn {
                    padding: 0.3rem 0.7rem; border: 1px solid var(--border-color);
                    border-radius: 6px; font-size: 0.78rem; font-weight: 500;
                    color: var(--color-primary); background: transparent;
                    cursor: pointer; transition: all 0.15s; font-family: inherit;
                }
                .done-today-btn:hover { background: var(--color-primary-subtle); }

                /* Summary */
                .done-summary {
                    display: flex; align-items: center; gap: 1.25rem;
                    margin-bottom: 1.25rem; padding: 0.75rem 1rem;
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
                }
                .done-summary-item { font-size: 0.85rem; color: var(--color-text-secondary); }
                .done-summary-total { margin-left: auto; font-size: 0.85rem; color: var(--color-success); font-weight: 500; }

                /* Loading */
                .done-loading {
                    display: flex; align-items: center; gap: 0.5rem; justify-content: center;
                    padding: 2rem; color: var(--color-text-muted);
                }

                /* Monthly Calendar */
                .done-calendar {
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg); padding: 1rem 1.25rem;
                    box-shadow: var(--shadow-sm); margin-bottom: 1.25rem;
                }
                .done-cal-weekdays {
                    display: grid; grid-template-columns: repeat(7, 1fr);
                    margin-bottom: 0.35rem;
                }
                .done-cal-wd {
                    text-align: center; font-size: 0.72rem; font-weight: 600;
                    color: var(--color-text-muted); padding: 0.35rem 0;
                }
                .done-cal-wd.sun { color: #ef4444; }
                .done-cal-wd.sat { color: #3b82f6; }
                .done-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
                .done-cal-cell {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; gap: 1px;
                    aspect-ratio: 1; border: none; border-radius: 8px;
                    cursor: pointer; transition: all 0.15s; font-family: inherit;
                }
                .done-cal-cell.empty { cursor: default; }
                .done-cal-cell:not(.empty):hover { box-shadow: 0 0 0 2px var(--border-color-hover); }
                .done-cal-cell.today { box-shadow: inset 0 0 0 2px var(--color-primary); }
                .done-cal-cell.selected {
                    background: var(--color-primary) !important; color: #fff;
                    box-shadow: 0 2px 8px rgba(79,110,247,0.25);
                }
                .done-cal-cell.weekend .done-cal-day { color: var(--color-text-muted); }
                .done-cal-day { font-size: 0.82rem; font-weight: 500; color: var(--color-text); line-height: 1; }
                .done-cal-cell.selected .done-cal-day { color: #fff; }
                .done-cal-count {
                    font-size: 0.6rem; font-weight: 700; color: var(--color-success);
                    line-height: 1;
                }
                .done-cal-cell.selected .done-cal-count { color: rgba(255,255,255,0.85); }

                /* Weekly View */
                .done-weekly {
                    display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
                    margin-bottom: 1.25rem;
                }
                .done-week-item {
                    display: flex; flex-direction: column; align-items: center;
                    gap: 0.2rem; padding: 0.65rem 0.25rem;
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm); cursor: pointer;
                    transition: all 0.2s; font-family: inherit;
                }
                .done-week-item:hover { border-color: var(--border-color-hover); box-shadow: var(--shadow-sm); }
                .done-week-item.selected {
                    background: var(--color-primary); border-color: var(--color-primary);
                    color: #fff; box-shadow: 0 2px 8px rgba(79,110,247,0.2);
                }
                .done-week-item.is-today:not(.selected) { box-shadow: inset 0 0 0 2px var(--color-primary); }
                .done-week-wd { font-size: 0.72rem; font-weight: 600; color: var(--color-text-muted); }
                .done-week-item.selected .done-week-wd { color: rgba(255,255,255,0.8); }
                .done-week-wd.weekend { color: var(--color-danger); }
                .done-week-item.selected .done-week-wd.weekend { color: rgba(255,200,200,0.9); }
                .done-week-date { font-size: 1rem; font-weight: 700; color: var(--color-text); }
                .done-week-item.selected .done-week-date { color: #fff; }
                .done-week-badge {
                    font-size: 0.68rem; font-weight: 700; color: var(--color-success);
                    background: var(--color-success-bg); padding: 0.1rem 0.4rem;
                    border-radius: 8px;
                }
                .done-week-item.selected .done-week-badge { background: rgba(255,255,255,0.2); color: #fff; }
                .done-week-none { font-size: 0.75rem; color: var(--color-text-disabled); }
                .done-week-item.selected .done-week-none { color: rgba(255,255,255,0.5); }

                /* Day Detail */
                .done-detail {
                    background: var(--color-surface); border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg); padding: 1.25rem 1.5rem;
                    box-shadow: var(--shadow-sm);
                }
                .done-detail-title {
                    font-size: 0.88rem; font-weight: 600; color: var(--color-text-secondary);
                    margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;
                }
                .done-detail-count {
                    font-size: 0.72rem; font-weight: 700; color: var(--color-success);
                    background: var(--color-success-bg); padding: 0.15rem 0.5rem;
                    border-radius: 10px;
                }

                /* Empty state */
                .done-empty {
                    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
                    padding: 2rem; color: var(--color-text-muted); font-size: 0.88rem;
                }
                .done-empty-icon { font-size: 2rem; opacity: 0.4; }

                /* Task list */
                .done-task-list { display: flex; flex-direction: column; gap: 0.35rem; }
                @keyframes doneItemIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .done-task {
                    display: flex; align-items: center; gap: 0.6rem;
                    padding: 0.55rem 0.65rem; border-radius: var(--radius-sm);
                    transition: background 0.15s;
                    animation: doneItemIn 0.25s ease both;
                }
                .done-task:hover { background: var(--color-surface-hover); }
                .done-task.archived { opacity: 0.5; }
                .done-task.routine { border-left: 2px solid var(--color-primary); }
                .done-check {
                    color: var(--color-success); font-weight: 700; font-size: 0.75rem;
                    width: 22px; height: 22px; display: flex; align-items: center;
                    justify-content: center; background: var(--color-success-bg);
                    border-radius: 50%; flex-shrink: 0;
                }
                .done-task-info { flex: 1; min-width: 0; }
                .done-task-title-row { display: flex; align-items: center; gap: 0.3rem; }
                .done-badge-icon { font-size: 0.75rem; flex-shrink: 0; }
                .done-task-title {
                    font-size: 0.88rem; font-weight: 500; color: var(--color-text);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .done-parent {
                    display: block; font-size: 0.7rem; color: var(--color-text-muted);
                    margin-top: 0.1rem;
                }
                .done-task-meta { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.2rem; }
                .done-tag {
                    font-size: 0.6rem; font-weight: 600; padding: 0.08rem 0.4rem;
                    border-radius: 8px; color: #fff;
                }
                .done-meta-text { font-size: 0.72rem; color: var(--color-text-muted); }
                .done-time {
                    font-size: 0.78rem; color: var(--color-text-muted); white-space: nowrap;
                    flex-shrink: 0;
                }
            `}</style>
        </div>
    );
}
