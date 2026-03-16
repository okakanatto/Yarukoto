'use client';

import { useDoneData } from '@/hooks/useDoneData';
import DoneCalendarView from './_components/DoneCalendarView';
import DoneWeeklyView from './_components/DoneWeeklyView';
import DoneDayDetail from './_components/DoneDayDetail';
import { ClipboardList, RefreshCw } from 'lucide-react';

export default function DonePage() {
    const {
        today,
        viewMode,
        summaryLoading,
        periodStats,
        periodLabel,
        selectedDay,
        setSelectedDay,
        detailLoading,
        dayTasks,
        calCells,
        weekDays,
        selectedDayLabel,
        switchViewMode,
        navigatePrev,
        navigateNext,
        goToToday,
    } = useDoneData();

    const total = periodStats.tasks + periodStats.routines;

    // Heat map background for calendar cells (CSS variable-based for dark mode support)
    const heatBg = (count) => {
        if (count === 0) return 'transparent';
        if (count <= 2) return 'var(--heat-low)';
        if (count <= 5) return 'var(--heat-mid)';
        return 'var(--heat-high)';
    };

    return (
        <div className="done-root">
            <div className="done-header">
                <h2 className="page-title">やったタスク</h2>
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
                <span className="done-summary-item"><ClipboardList size={14} /> タスク <strong>{periodStats.tasks}</strong></span>
                <span className="done-summary-item"><RefreshCw size={14} /> ルーティン <strong>{periodStats.routines}</strong></span>
                <span className="done-summary-total">合計 <strong>{total}</strong> 件完了</span>
            </div>

            {summaryLoading && (
                <div className="done-loading"><span className="spinner" /> 読み込み中...</div>
            )}

            {/* Monthly Calendar */}
            {!summaryLoading && viewMode === 'monthly' && (
                <DoneCalendarView
                    calCells={calCells}
                    selectedDay={selectedDay}
                    today={today}
                    heatBg={heatBg}
                    onSelectDay={setSelectedDay}
                />
            )}

            {/* Weekly View */}
            {!summaryLoading && viewMode === 'weekly' && (
                <DoneWeeklyView
                    weekDays={weekDays}
                    selectedDay={selectedDay}
                    today={today}
                    onSelectDay={setSelectedDay}
                />
            )}

            {/* Day Detail */}
            {!summaryLoading && (
                <DoneDayDetail
                    selectedDayLabel={selectedDayLabel}
                    dayTasks={dayTasks}
                    detailLoading={detailLoading}
                />
            )}

            <style jsx global>{`
                .done-root { max-width: 800px; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .done-header { margin-bottom: 6px; }
                .done-subtitle { color: var(--color-text-muted); font-size: 0.78rem; margin-top: -1rem; }

                /* Toolbar */
                .done-toolbar {
                    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
                    margin-bottom: 14px; padding: 8px 14px;
                    background: var(--color-surface); border-radius: var(--radius-md);
                }
                .done-view-modes {
                    display: flex; gap: 4px; background: transparent;
                    padding: 0;
                }
                .done-view-btn {
                    padding: 4px 10px; border: none; background: transparent;
                    border-radius: var(--radius-md); font-size: 0.78rem; font-weight: 600;
                    color: var(--color-text-muted); cursor: pointer;
                    transition: background 100ms, color 100ms; font-family: inherit;
                }
                .done-view-btn:hover { background: var(--color-surface-hover); color: var(--color-text); }
                .done-view-btn.active {
                    background: var(--color-accent); color: #fff; font-weight: 700;
                }
                .done-nav { display: flex; align-items: center; gap: 4px; margin-left: auto; }
                .done-nav-btn {
                    background: transparent; border: 1px solid var(--border-color);
                    border-radius: 3px; width: 28px; height: 28px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.1rem; color: var(--color-text-muted);
                    cursor: pointer; transition: border-color 100ms, color 100ms, background 100ms; font-family: inherit;
                }
                .done-nav-btn:hover { border-color: var(--border-color-hover); color: var(--color-text); background: var(--color-surface-hover); }
                .done-period { font-size: 0.82rem; font-weight: 600; color: var(--color-text); min-width: 120px; text-align: center; }
                .done-today-btn {
                    padding: 4px 10px; border: 1px solid var(--border-color);
                    border-radius: 3px; font-size: 0.78rem; font-weight: 500;
                    color: var(--color-accent); background: transparent;
                    cursor: pointer; transition: background 100ms; font-family: inherit;
                }
                .done-today-btn:hover { background: var(--color-accent-subtle); }

                /* Summary */
                .done-summary {
                    display: flex; align-items: center; gap: 10px;
                    margin-bottom: 14px; padding: 8px 14px;
                    background: var(--color-surface); border-radius: var(--radius-md);
                }
                .done-summary-item { font-size: 0.78rem; color: var(--color-text-secondary); }
                .done-summary-total { margin-left: auto; font-size: 0.78rem; color: var(--color-success); font-weight: 500; }

                /* Loading */
                .done-loading {
                    display: flex; align-items: center; gap: 4px; justify-content: flex-start;
                    padding: 12px 0; color: var(--color-text-muted);
                }

                /* Monthly Calendar */
                .done-calendar {
                    background: var(--color-surface); border-radius: var(--radius-md);
                    padding: 16px; margin-bottom: 12px;
                }
                .done-cal-weekdays {
                    display: grid; grid-template-columns: repeat(7, 1fr);
                    margin-bottom: 4px;
                }
                .done-cal-wd {
                    text-align: center; font-size: 0.68rem; font-weight: 600;
                    color: var(--color-text-muted); padding: 4px 0;
                }
                .done-cal-wd.sun { color: var(--color-danger); }
                .done-cal-wd.sat { color: var(--color-saturday); }
                .done-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
                .done-cal-cell {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; gap: 1px;
                    aspect-ratio: 1; border: none; border-radius: 4px;
                    cursor: pointer; transition: box-shadow 100ms; font-family: inherit;
                }
                .done-cal-cell.empty { cursor: default; }
                .done-cal-cell:not(.empty):hover { box-shadow: 0 0 0 1px var(--border-color-hover); }
                .done-cal-cell.today { box-shadow: inset 0 0 0 2px var(--color-accent); }
                .done-cal-cell.selected {
                    background: var(--color-accent) !important; color: #fff;
                    box-shadow: none;
                }
                .done-cal-cell.weekend .done-cal-day { color: var(--color-text-muted); }
                .done-cal-day { font-size: 0.78rem; font-weight: 500; color: var(--color-text); line-height: 1; }
                .done-cal-cell.selected .done-cal-day { color: #fff; }
                .done-cal-count {
                    font-size: 0.58rem; font-weight: 700; color: var(--color-success);
                    line-height: 1;
                }
                .done-cal-cell.selected .done-cal-count { color: rgba(255,255,255,0.85); }

                /* Weekly View */
                .done-weekly {
                    display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
                    margin-bottom: 12px;
                }
                .done-week-item {
                    display: flex; flex-direction: column; align-items: center;
                    gap: 2px; padding: 6px 4px;
                    background: transparent; border: 1px solid var(--border-color);
                    border-radius: 3px; cursor: pointer;
                    transition: border-color 100ms, background 100ms; font-family: inherit;
                }
                .done-week-item:hover { border-color: var(--border-color-hover); }
                .done-week-item.selected {
                    background: var(--color-accent); border-color: var(--color-accent);
                    color: #fff;
                }
                .done-week-item.is-today:not(.selected) { box-shadow: inset 0 0 0 2px var(--color-accent); }
                .done-week-wd { font-size: 0.68rem; font-weight: 600; color: var(--color-text-muted); }
                .done-week-item.selected .done-week-wd { color: rgba(255,255,255,0.8); }
                .done-week-wd.weekend { color: var(--color-danger); }
                .done-week-item.selected .done-week-wd.weekend { color: rgba(255,200,200,0.9); }
                .done-week-date { font-size: 0.88rem; font-weight: 700; color: var(--color-text); }
                .done-week-item.selected .done-week-date { color: #fff; }
                .done-week-badge {
                    font-size: 0.65rem; font-weight: 700; color: var(--color-success);
                    background: var(--color-success-bg); padding: 1px 5px;
                    border-radius: var(--radius-sm);
                }
                .done-week-item.selected .done-week-badge { background: rgba(255,255,255,0.2); color: #fff; }
                .done-week-none { font-size: 0.72rem; color: var(--color-text-disabled); }
                .done-week-item.selected .done-week-none { color: rgba(255,255,255,0.5); }

                /* Day Detail */
                .done-detail {
                    background: transparent; border: none;
                    border-radius: 0; padding: 10px 0;
                }
                .done-detail-title {
                    font-size: 0.82rem; font-weight: 600; color: var(--color-text-secondary);
                    margin: 0 0 6px 0; display: flex; align-items: center; gap: 4px;
                }
                .done-detail-count {
                    font-size: 0.68rem; font-weight: 700; color: var(--color-success);
                    background: var(--color-success-bg); padding: 1px 6px;
                    border-radius: var(--radius-sm);
                }

                /* Empty state */
                .done-empty {
                    display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
                    padding: 12px 0; color: var(--color-text-muted); font-size: 0.82rem;
                }
                .done-empty::before {
                    content: ''; display: block; width: 32px; height: 3px;
                    background: var(--color-accent); margin-bottom: 8px;
                }
                .done-empty-icon { display: none; }

                /* Task list */
                .done-task-list { display: flex; flex-direction: column; gap: 0; }
                .done-task {
                    display: flex; align-items: center; gap: 6px;
                    padding: 6px 8px; border-radius: 0;
                    background: transparent;
                    border-left: 4px solid var(--border-color);
                    transition: background 100ms, border-left-color 100ms;
                }
                .done-task + .done-task { border-top: 1px solid var(--border-color); }
                .done-task:hover { background: var(--color-surface-hover); border-left-color: var(--color-accent); }
                .done-task.archived { opacity: 0.5; }
                .done-task.routine { border-left-color: var(--color-accent); }
                .done-check {
                    color: var(--color-success); font-weight: 700; font-size: 0.72rem;
                    width: 20px; height: 20px; display: flex; align-items: center;
                    justify-content: center; background: var(--color-success-bg);
                    border-radius: 50%; flex-shrink: 0;
                }
                .done-task-info { flex: 1; min-width: 0; }
                .done-task-title-row { display: flex; align-items: center; gap: 3px; }
                .done-badge-icon { font-size: 0.72rem; flex-shrink: 0; }
                .done-task-title {
                    font-size: 0.82rem; font-weight: 500; color: var(--color-text);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .done-parent {
                    display: block; font-size: 0.68rem; color: var(--color-text-muted);
                    margin-top: 1px;
                }
                .done-task-meta { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
                .done-tag {
                    display: inline-flex; align-items: center; gap: 4px;
                    font-size: 0.6rem; font-weight: 600; padding: 1px 5px;
                    border-radius: var(--radius-sm); background: var(--color-surface-hover); color: var(--color-text-secondary);
                }
                .done-tag-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
                .done-meta-text { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
                .done-time {
                    font-size: 0.72rem; color: var(--color-text-muted); white-space: nowrap;
                    flex-shrink: 0; opacity: 0; transition: opacity 100ms;
                }
                .done-task:hover .done-time { opacity: 1; }
            `}</style>
        </div>
    );
}
