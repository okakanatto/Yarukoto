'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, closestCorners } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import StatusCheckbox from '@/components/StatusCheckbox';
import TaskEditModal from '@/components/TaskEditModal';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import { ReorderGap } from '@/components/DndGaps';
import { fetchDb, formatMin } from '@/lib/utils';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { useTodayTasks } from '@/hooks/useTodayTasks';
import { useTaskActions } from '@/hooks/useTaskActions';

function addDays(base, days) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
}

function toDateStr(d) {
    return d.toLocaleDateString('sv-SE');
}

function buildDateTabs() {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const tabs = [];
    const labels = ['今日', '明日', '明後日'];
    for (let i = 0; i <= 7; i++) {
        const d = addDays(base, i);
        const wd = weekdays[d.getDay()];
        tabs.push({
            date: toDateStr(d),
            label: labels[i] || `${d.getMonth() + 1}/${d.getDate()}`,
            weekday: wd,
            isToday: i === 0,
            isWeekend: d.getDay() === 0 || d.getDay() === 6,
        });
    }
    return tabs;
}

/**
 * Individual today-card with @dnd-kit draggable support.
 */
function TodayCardItem({ task, isManual, statuses, statusMap, selectedDate, onStatusChange, onRemove, onEdit, justCompletedId, index }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        disabled: !isManual,
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 'auto',
    } : undefined;

    const st = statusMap[task.status_code] || { label: task.status_label || '不明', color: task.status_color || '#94a3b8' };
    const isDone = task.status_code === 3;
    const isRoutine = !!task.is_routine;
    const isPickedForToday = task.today_date === selectedDate;

    return (
        <div
            ref={setNodeRef}
            style={{ ...style, animationDelay: `${index * 40}ms` }}
            className={`today-card ${isDone ? 'done' : ''} ${isRoutine ? 'routine' : ''} ${isPickedForToday && !isRoutine ? 'picked' : ''}`}
        >
            {isManual && (
                <div className="today-drag-handle" {...attributes} {...listeners} title="ドラッグして並び替え">⋮⋮</div>
            )}
            <StatusCheckbox
                statusCode={task.status_code}
                onChange={(newCode) => onStatusChange(task.id, newCode, isRoutine)}
                sparkle={justCompletedId === task.id}
            />
            <div className="today-card-info">
                {task.parent_title && (
                    <span className="today-parent-label">📌 {task.parent_title} ›</span>
                )}
                <div className="today-card-title-row">
                    {isRoutine && <span className="today-routine-badge">🔄</span>}
                    <span
                        className={`today-card-title ${isDone ? 'strike' : ''} ${!isRoutine ? 'clickable' : ''}`}
                        onClick={() => {
                            if (!isRoutine) onEdit(task);
                        }}
                        title={!isRoutine ? "クリックして編集" : ""}
                    >
                        {task.title}
                    </span>
                </div>
                <div className="today-card-meta">
                    {task.tags && task.tags.map(t => (
                        <span key={t.id} className="today-tag" style={{ backgroundColor: t.color }}>{t.name}</span>
                    ))}
                    {isDone && task.completed_at && <span className="today-meta-item">☑ 完了: {task.completed_at.split(' ')[0]}</span>}
                    {task.due_date && !isDone && <span className="today-meta-item">📅 {task.due_date}</span>}
                    {task.estimated_hours > 0 && (
                        <span className="today-meta-item">⏱ {formatMin(task.estimated_hours)}</span>
                    )}
                </div>
            </div>
            <div className="today-card-actions">
                {!isRoutine && (
                    <select value={task.status_code} onChange={e => onStatusChange(task.id, e.target.value, false)}
                        className="today-status" style={{ borderColor: st.color, color: st.color }}>
                        {statuses.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </select>
                )}
                {!isRoutine && isPickedForToday && (
                    <button className="today-remove" onClick={() => onRemove(task.id)} title="今日やるから外す">✕</button>
                )}
            </div>
        </div>
    );
}

export default function TodayPage() {
    const dateTabs = useMemo(() => buildDateTabs(), []);
    const [selectedDate, setSelectedDate] = useState(() => dateTabs[0].date);
    const [justCompletedId, setJustCompletedId] = useState(null);
    const [editingTask, setEditingTask] = useState(null);
    const [activeId, setActiveId] = useState(null);

    // Filter state (UI-managed)
    const [filterStatuses, setFilterStatuses] = useState([]);
    const [filterTags, setFilterTags] = useState([]);
    const [filterImportance, setFilterImportance] = useState([]);
    const [filterUrgency, setFilterUrgency] = useState([]);

    // Data hook: master data, tasks, sort, loading
    const {
        tasks, setTasks, loading, loadTasks,
        statuses, allTags, allImportance, allUrgency,
        sortMode, sortKey, setSortKey,
        toggleSortMode,
    } = useTodayTasks(selectedDate, { filterStatuses, filterTags, filterImportance, filterUrgency });

    const { statusOptions, tagOptions, importanceOptions, urgencyOptions } = useFilterOptions(statuses, allTags, allImportance, allUrgency);

    // Task actions (shared handler for regular tasks + routines)
    const reloadTasks = useCallback(() => loadTasks(selectedDate), [loadTasks, selectedDate]);
    const actions = useTaskActions({
        setTasks,
        fetchTasks: reloadTasks,
        refresh: reloadTasks,
        getTasks: () => tasks,
    });

    // @dnd-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Persist today_sort_order to DB after reorder
    const persistTodaySortOrder = useCallback(async (newTasks) => {
        try {
            const db = await fetchDb();
            for (let idx = 0; idx < newTasks.length; idx++) {
                const t = newTasks[idx];
                if (t.is_routine) {
                    await db.execute('UPDATE routines SET today_sort_order = $1 WHERE id = $2', [idx + 1, t.routine_id]);
                } else {
                    await db.execute('UPDATE tasks SET today_sort_order = $1 WHERE id = $2', [idx + 1, t.id]);
                }
            }
        } catch (err) {
            console.error(err);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '並び替えの保存に失敗しました', type: 'error' } }));
            reloadTasks();
        }
    }, [reloadTasks]);

    // @dnd-kit drag handlers
    const handleDragStart = useCallback((event) => {
        setActiveId(event.active.id);
    }, []);

    const handleDragEnd = useCallback(async (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;
        const overIdStr = String(over.id);
        if (!overIdStr.startsWith('reorder-today-')) return;

        let targetIndex = parseInt(overIdStr.replace('reorder-today-', ''));
        const currentOrder = tasks.map(t => t.id);
        const oldIndex = currentOrder.indexOf(active.id);
        if (oldIndex < 0) return;

        // Remove from current position
        currentOrder.splice(oldIndex, 1);
        if (oldIndex < targetIndex) targetIndex--;

        // Insert at target position
        currentOrder.splice(targetIndex, 0, active.id);

        // Optimistic UI update
        const reordered = currentOrder.map(id => tasks.find(t => t.id === id)).filter(Boolean);
        setTasks(reordered);

        await persistTodaySortOrder(reordered);
    }, [tasks, setTasks, persistTodaySortOrder]);

    // Status change wrapper: adds justCompleted animation + routes to routine/task handler
    const handleStatusChange = (taskId, newCode, isRoutine = false) => {
        const code = parseInt(newCode);
        if (code === 3) {
            setJustCompletedId(taskId);
            setTimeout(() => setJustCompletedId(null), 700);
        }
        if (isRoutine) {
            const item = tasks.find(t => t.id === taskId);
            if (!item) return;
            actions.handleRoutineStatusChange(taskId, newCode, { routineId: item.routine_id, completionDate: selectedDate });
        } else {
            actions.handleStatusChange(taskId, newCode);
        }
    };

    // Remove task from today
    const handleRemove = async (taskId) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        try {
            const db = await fetchDb();
            await db.execute('UPDATE tasks SET today_date = NULL WHERE id = $1', [taskId]);
        } catch (e) { console.error(e); reloadTasks(); }
    };

    // Computed values for rendering
    const stats = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.status_code === 3).length;
        const remaining = tasks.filter(t => t.status_code !== 3 && t.status_code !== 5);
        const remainingMin = remaining.reduce((s, t) => s + (t.estimated_hours || 0), 0);
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, remaining: remaining.length, remainingMin, pct };
    }, [tasks]);

    const statusMap = useMemo(() => {
        const m = {};
        statuses.forEach(s => { m[s.code] = { label: s.label, color: s.color }; });
        return m;
    }, [statuses]);

    const currentTab = dateTabs.find(t => t.date === selectedDate) || dateTabs[0];
    const selectedD = new Date(selectedDate + 'T00:00:00');
    const dateStr = `${selectedD.getFullYear()}年${selectedD.getMonth() + 1}月${selectedD.getDate()}日（${currentTab.weekday}）`;

    const isManual = sortMode === 'manual';
    const activeTaskData = activeId ? tasks.find(t => t.id === activeId) : null;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="today-root">
                <div className="today-header">
                    <div className="today-title-row">
                        <h2 className="page-title">☀️ {currentTab.isToday ? '今日やるタスク' : 'やるタスク'}</h2>
                        <span className="today-date">{dateStr}</span>
                    </div>
                    <p className="today-subtitle">ルーティン + ☀️ ピック + 📅 期限日のタスク</p>
                </div>

                {/* Date Navigation Tabs */}
                <div className="date-tabs">
                    {dateTabs.map(tab => (
                        <button key={tab.date}
                            className={`date-tab ${selectedDate === tab.date ? 'active' : ''} ${tab.isWeekend ? 'weekend' : ''}`}
                            onClick={() => setSelectedDate(tab.date)}>
                            <span className="date-tab-label">{tab.label}</span>
                            <span className="date-tab-wd">{tab.weekday}</span>
                        </button>
                    ))}
                </div>

                {/* Filter Toolbar */}
                <div className="today-toolbar">
                    <MultiSelectFilter label="ステータス" options={statusOptions} selected={filterStatuses} onChange={setFilterStatuses} />
                    {tagOptions.length > 0 && <MultiSelectFilter label="タグ" options={tagOptions} selected={filterTags} onChange={setFilterTags} />}
                    <MultiSelectFilter label="重要度" options={importanceOptions} selected={filterImportance} onChange={setFilterImportance} />
                    <MultiSelectFilter label="緊急度" options={urgencyOptions} selected={filterUrgency} onChange={setFilterUrgency} />
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        <button
                            className={`today-sort-toggle ${sortMode === 'manual' ? 'active' : ''}`}
                            onClick={toggleSortMode}
                            title={sortMode === 'manual' ? '自動ソートに切替' : '手動並び替えに切替'}
                        >
                            {sortMode === 'manual' ? '✋ 手動' : '🔀 自動'}
                        </button>
                        {sortMode === 'auto' && (
                            <div className="today-filter">
                                <label>並び順</label>
                                <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
                                    <option value="priority">優先度順（デフォルト）</option>
                                    <option value="status">ステータス順</option>
                                    <option value="tag">タグ順</option>
                                    <option value="due_asc">期限日（近い順）</option>
                                    <option value="due_desc">期限日（遠い順）</option>
                                    <option value="created_desc">作成日（新しい順）</option>
                                    <option value="created_asc">作成日（古い順）</option>
                                    <option value="importance">重要度（高い順）</option>
                                    <option value="urgency">緊急度（高い順）</option>
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mini Dashboard */}
                <div className="today-stats">
                    <div className="stat-ring-area">
                        <svg viewBox="0 0 120 120" className="stat-ring">
                            <circle cx="60" cy="60" r="50" className="ring-bg" />
                            <circle cx="60" cy="60" r="50" className="ring-fill"
                                style={{
                                    strokeDasharray: `${stats.pct * 3.14} 314`,
                                    stroke: stats.pct === 100 ? 'var(--color-success)' : 'var(--color-primary)'
                                }}
                            />
                        </svg>
                        <div className="ring-label">
                            <span className="ring-pct">{stats.pct}%</span>
                            <span className="ring-sub">完了</span>
                        </div>
                    </div>
                    <div className="stat-details">
                        <div className="stat-row">
                            <span className="stat-icon">📋</span>
                            <span className="stat-text">全 <strong>{stats.total}</strong> 件</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-icon">✅</span>
                            <span className="stat-text">完了 <strong>{stats.completed}</strong> 件</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-icon">⏳</span>
                            <span className="stat-text">残り <strong>{stats.remaining}</strong> 件</span>
                        </div>
                        {stats.remainingMin > 0 && (
                            <div className="stat-row">
                                <span className="stat-icon">⏱</span>
                                <span className="stat-text">残り想定 <strong>{formatMin(stats.remainingMin)}</strong></span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Task List */}
                <div className="today-list">
                    {loading && tasks.length === 0 && <div className="today-placeholder"><span className="spinner" /> 読み込み中...</div>}

                    {!loading && tasks.length === 0 && (
                        <div className="today-empty">
                            <span className="today-empty-icon">{currentTab.isToday ? '☀️' : '📅'}</span>
                            <span className="today-empty-title">{currentTab.isToday ? '今日やるタスクがありません' : `${currentTab.label}のタスクがありません`}</span>
                            <span className="today-empty-hint">タスク一覧の ☀️ ボタンでタスクをピックしましょう</span>
                        </div>
                    )}

                    {tasks.map((task, i) => (
                        <React.Fragment key={task.id}>
                            {isManual && activeId && i === 0 && (
                                <ReorderGap id="reorder-today-0" />
                            )}
                            <TodayCardItem
                                task={task}
                                isManual={isManual}
                                statuses={statuses}
                                statusMap={statusMap}
                                selectedDate={selectedDate}
                                onStatusChange={handleStatusChange}
                                onRemove={handleRemove}
                                onEdit={setEditingTask}
                                justCompletedId={justCompletedId}
                                index={i}
                            />
                            {isManual && activeId && (
                                <ReorderGap id={`reorder-today-${i + 1}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {currentTab.isToday && stats.total > 0 && stats.completed >= 1 && stats.pct < 50 && (
                    <div className="today-milestone-banner milestone-start">
                        いいスタート！ まず1件クリアしました
                    </div>
                )}
                {currentTab.isToday && stats.pct >= 50 && stats.pct < 100 && (
                    <div className="today-milestone-banner milestone-half">
                        半分突破！ あと {stats.remaining} 件で完了です
                    </div>
                )}
                {currentTab.isToday && stats.pct === 100 && stats.total > 0 && (
                    <div className="today-complete-banner">
                        おめでとうございます！ 今日のタスクをすべて完了しました！
                    </div>
                )}

                <DragOverlay>
                    {activeTaskData ? (
                        <div className="today-card" style={{ opacity: 0.8, transform: 'scale(1.02)', cursor: 'grabbing', animation: 'none' }}>
                            <div className="today-drag-handle" style={{ opacity: 1 }}>⋮⋮</div>
                            <div className="today-card-info">
                                <div className="today-card-title-row">
                                    {activeTaskData.is_routine && <span className="today-routine-badge">🔄</span>}
                                    <span className="today-card-title">{activeTaskData.title}</span>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>

                <style jsx>{`
        .today-root { max-width: 800px; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .today-header { margin-bottom: 1rem; }
        .today-title-row { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
        .today-date { font-size: 0.9rem; color: var(--color-text-muted); font-weight: 500; }
        .today-subtitle { color: var(--color-text-muted); font-size: 0.85rem; margin-top: -1rem; }

        /* Date Navigation Tabs */
        .date-tabs {
          display: flex; gap: 3px; margin-bottom: 1.5rem;
          padding: 4px; background: var(--color-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
          overflow-x: auto;
        }
        .date-tab {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; align-items: center;
          gap: 0.1rem; padding: 0.5rem 0.25rem;
          border: none; background: transparent;
          border-radius: 9px; cursor: pointer;
          transition: all 0.2s; font-family: inherit;
        }
        .date-tab:hover { background: var(--color-surface-hover); }
        .date-tab.active {
          background: var(--color-primary); color: #fff;
          box-shadow: 0 2px 10px rgba(79,110,247,0.18);
        }
        .date-tab.weekend:not(.active) { }
        .date-tab-label {
          font-size: 0.78rem; font-weight: 600;
          color: var(--color-text-secondary);
        }
        .date-tab.active .date-tab-label { color: #fff; }
        .date-tab-wd {
          font-size: 0.65rem; font-weight: 500;
          color: var(--color-text-muted);
        }
        .date-tab.active .date-tab-wd { color: rgba(255,255,255,0.8); }
        .date-tab.weekend .date-tab-wd { color: var(--color-danger); }
        .date-tab.weekend.active .date-tab-wd { color: rgba(255,200,200,0.9); }

        /* Toolbar */
        .today-toolbar {
          display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap;
          margin-bottom: 1.5rem; padding: 0.65rem 0.85rem;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
        }
        .today-filter { display: flex; align-items: center; gap: 0.4rem; }
        .today-filter label { font-size: 0.78rem; color: var(--color-text-muted); font-weight: 500; white-space: nowrap; }

        /* Stats */
        .today-stats {
          display: flex; align-items: center; gap: 2rem;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-lg); padding: 1.5rem 2rem;
          box-shadow: var(--shadow-md); margin-bottom: 1.5rem;
        }
        .stat-ring-area { position: relative; width: 100px; height: 100px; flex-shrink: 0; }
        .stat-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ring-bg { fill: none; stroke: var(--color-surface-hover); stroke-width: 8; }
        .ring-fill { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
        .ring-label {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .ring-pct { font-size: 1.5rem; font-weight: 800; color: var(--color-text); line-height: 1; }
        .ring-sub { font-size: 0.7rem; color: var(--color-text-muted); font-weight: 500; }

        .stat-details { display: flex; flex-direction: column; gap: 0.5rem; }
        .stat-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; color: var(--color-text-secondary); }
        .stat-icon { font-size: 0.85rem; }

        /* Task Cards */
        .today-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .today-placeholder { display: flex; align-items: center; gap: 0.5rem; padding: 2rem; color: var(--color-text-muted); justify-content: center; }
        .today-empty {
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
          padding: 3rem; color: var(--color-text-muted);
        }
        .today-empty-icon { font-size: 2.5rem; opacity: 0.5; }
        .today-empty-title { font-size: 1rem; font-weight: 500; color: var(--color-text-secondary); }
        .today-empty-hint { font-size: 0.82rem; color: var(--color-text-disabled); }

        .today-card {
          display: flex; align-items: center; gap: 0.75rem;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-md); padding: 0.75rem 1rem;
          box-shadow: var(--shadow-sm); transition: all 0.2s;
          animation: tcIn 0.3s cubic-bezier(.16,1,.3,1) both;
          touch-action: none;
        }
        @keyframes tcIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .today-card:hover { border-color: var(--border-color-hover); box-shadow: var(--shadow-card-hover); }
        .today-card.done { opacity: 0.55; }
        .today-card.done:hover { opacity: 0.75; }
        .today-card.routine { border-left: 3px solid var(--color-primary); }
        .today-card.picked { border-left: 3px solid var(--color-warning); }

        .today-card-info { flex: 1; min-width: 0; }
        .today-parent-label {
          display: block; font-size: 0.7rem; font-weight: 500;
          color: var(--color-text-muted); margin-bottom: 0.15rem;
          letter-spacing: 0.01em;
        }
        .today-card-title-row { display: flex; align-items: center; gap: 0.35rem; }
        .today-routine-badge {
          font-size: 0.8rem; flex-shrink: 0;
        }
        .today-picked-badge {
          font-size: 0.8rem; flex-shrink: 0; filter: grayscale(0.2);
        }
        .today-card-title { font-weight: 600; font-size: 0.92rem; color: var(--color-text); display: block; }
        .today-card-title.strike { text-decoration: line-through; color: var(--color-text-disabled); }
        .today-card-title.clickable { cursor: pointer; transition: color 0.15s; }
        .today-card-title.clickable:hover { color: var(--color-primary); text-decoration: underline; }
        .today-card-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.25rem; }
        .today-tag { font-size: 0.63rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 10px; color: #fff; }
        .today-meta-item { font-size: 0.75rem; color: var(--color-text-muted); }

        .today-card-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
        .today-status {
          font-weight: 600; font-size: 0.75rem; padding: 0.25rem 0.4rem;
          border-radius: var(--radius-sm); cursor: pointer; border: 1px solid;
          background: transparent; font-family: inherit;
        }
        .today-remove {
          background: transparent; border: 1px solid transparent; color: var(--color-text-disabled);
          cursor: pointer; font-size: 0.75rem; width: 24px; height: 24px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: all 0.15s;
        }
        .today-remove:hover { background: var(--color-danger-bg); color: var(--color-danger); border-color: rgba(220,38,38,.2); }

        /* Sort mode toggle */
        .today-sort-toggle {
          padding:.35rem .7rem; border:1px solid var(--border-color);
          border-radius:var(--radius-sm); font-size:.78rem; font-weight:600;
          cursor:pointer; transition:all .2s; font-family:inherit;
          background:var(--color-surface); color:var(--color-text-muted);
          white-space:nowrap;
        }
        .today-sort-toggle:hover { border-color:var(--border-color-hover); color:var(--color-text); }
        .today-sort-toggle.active {
          background:var(--color-primary); color:#fff; border-color:var(--color-primary);
          box-shadow:0 2px 8px rgba(79,110,247,.2);
        }
        .today-sort-toggle.active:hover { filter:brightness(1.1); }

        /* Drag handle */
        .today-drag-handle {
          cursor:grab; color:var(--color-text-disabled);
          display:flex; align-items:center; justify-content:center;
          width:20px; flex-shrink:0;
          opacity:0.5; transition:opacity .2s; user-select:none;
          font-size:.85rem;
        }
        .today-drag-handle:hover { opacity:1; }
        .today-drag-handle:active { cursor:grabbing; }

        .today-milestone-banner {
          margin-top: 1rem; padding: 0.85rem 1.25rem;
          border-radius: var(--radius-md);
          text-align: center; font-size: 0.88rem; font-weight: 600;
          animation: celebIn 0.4s cubic-bezier(.16,1,.3,1);
        }
        .milestone-start {
          background: rgba(79,110,247,0.06);
          border: 1px solid rgba(79,110,247,0.15);
          color: var(--color-primary);
        }
        .milestone-half {
          background: rgba(245,158,11,0.06);
          border: 1px solid rgba(245,158,11,0.2);
          color: #b45309;
        }
        .today-complete-banner {
          margin-top: 1rem; padding: 1.25rem;
          background: linear-gradient(135deg, rgba(22,163,74,0.08), rgba(79,110,247,0.08));
          border: 1px solid rgba(22,163,74,0.2); border-radius: var(--radius-lg);
          text-align: center; font-size: 1rem; font-weight: 600;
          color: var(--color-success);
          animation: celebIn 0.5s cubic-bezier(.16,1,.3,1);
        }
        @keyframes celebIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
      `}</style>

                {/* Reorder gap styles (global for ReorderGap child component) */}
                <style jsx global>{`
        .tl-reorder-gap {
          position:relative; padding:3px 0;
          transition:padding .15s ease; animation:fadeIn .2s ease;
        }
        .tl-reorder-gap-line {
          height:2px; border-radius:1px;
          background:transparent; transition:all .15s ease;
        }
        .tl-reorder-gap.drag-over { padding:8px 0; }
        .tl-reorder-gap.drag-over .tl-reorder-gap-line {
          height:3px; background:var(--color-accent);
          box-shadow:0 0 8px rgba(139,92,246,.35);
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>

                {editingTask && (
                    <TaskEditModal
                        task={editingTask}
                        onClose={() => setEditingTask(null)}
                        onSaved={() => {
                            setEditingTask(null);
                            loadTasks(selectedDate);
                        }}
                    />
                )}
            </div>
        </DndContext>
    );
}
