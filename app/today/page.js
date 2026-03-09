'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, closestCorners } from '@dnd-kit/core';
import TaskEditModal from '@/components/TaskEditModal';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import { ReorderGap } from '@/components/DndGaps';
import { addDays, toDateStr } from '@/lib/dateUtils';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { useTodayTasks } from '@/hooks/useTodayTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { useDbOperation } from '@/hooks/useDbOperation';
import { useTodayGrouping } from '@/hooks/useTodayGrouping';
import { Sun, CalendarDays, PartyPopper, Hand, ArrowUpDown, Pin, RefreshCw } from 'lucide-react';
import TodayCardItem from './_components/TodayCardItem';
import TodayGroupHeader from './_components/TodayGroupHeader';
import TodayStats from './_components/TodayStats';

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

export default function TodayPage() {
    const dbOp = useDbOperation();
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

    // Compute parent-child groups for today's tasks (IMP-15)
    const { rootItems, childrenByParent, rootItemsRef, childrenByParentRef } = useTodayGrouping(tasks);

    // @dnd-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Persist today_sort_order to DB after reorder (group-aware)
    const persistTodaySortOrder = useCallback(async (newRootItems) => {
        try {
            await dbOp(async (db) => {
                const currentChildren = childrenByParentRef.current;
                let orderIdx = 1;

                for (const item of newRootItems) {
                    const pid = item.is_ghost_parent ? item.real_id : item.id;

                    if (!item.is_ghost_parent) {
                        if (item.is_routine) {
                            await db.execute('UPDATE routines SET today_sort_order = $1 WHERE id = $2', [orderIdx++, item.routine_id]);
                        } else {
                            await db.execute('UPDATE tasks SET today_sort_order = $1 WHERE id = $2', [orderIdx++, item.id]);
                        }
                    }

                    const children = currentChildren[pid] || [];
                    for (const child of children) {
                        await db.execute('UPDATE tasks SET today_sort_order = $1 WHERE id = $2', [orderIdx++, child.id]);
                    }
                }
            }, { error: '並び替えの保存に失敗しました' });
        } catch {
            reloadTasks();
        }
    }, [reloadTasks, dbOp, childrenByParentRef]);

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

        const currentRoots = rootItemsRef.current;
        const currentChildren = childrenByParentRef.current;

        let targetIndex = parseInt(overIdStr.replace('reorder-today-', ''));
        const currentOrder = currentRoots.map(t => t.id);
        const oldIndex = currentOrder.indexOf(active.id);
        if (oldIndex < 0) return;

        // Remove from current position
        currentOrder.splice(oldIndex, 1);
        if (oldIndex < targetIndex) targetIndex--;

        // Insert at target position
        currentOrder.splice(targetIndex, 0, active.id);

        const reorderedRoots = currentOrder.map(id => currentRoots.find(t => t.id === id)).filter(Boolean);

        // Rebuild flat task list from reordered roots
        const newFlat = [];
        for (const item of reorderedRoots) {
            const pid = item.is_ghost_parent ? item.real_id : item.id;
            if (!item.is_ghost_parent) {
                newFlat.push(item);
            }
            const children = currentChildren[pid] || [];
            newFlat.push(...children);
        }
        setTasks(newFlat);

        await persistTodaySortOrder(reorderedRoots);
    }, [setTasks, persistTodaySortOrder, rootItemsRef, childrenByParentRef]);

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
            await dbOp(async (db) => {
                await db.execute('UPDATE tasks SET today_date = NULL WHERE id = $1', [taskId]);
            }, { error: '今日やるタスクの変更に失敗しました' });
        } catch {
            reloadTasks();
        }
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
    const activeTaskData = activeId
        ? (tasks.find(t => t.id === activeId) || rootItems.find(t => t.id === activeId))
        : null;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="today-root">
                <div className="today-header">
                    <div className="today-title-row">
                        <h2 className="page-title">{currentTab.isToday ? '今日やるタスク' : 'やるタスク'}</h2>
                        <span className="today-date">{dateStr}</span>
                    </div>
                    <p className="today-subtitle">ルーティン + ピック + 期限日のタスク</p>
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
                            {sortMode === 'manual' ? <><Hand size={14} /> 手動</> : <><ArrowUpDown size={14} /> 自動</>}
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
                <TodayStats stats={stats} />

                {/* Task List */}
                <div className="today-list">
                    {loading && tasks.length === 0 && <div className="today-placeholder"><span className="spinner" /> 読み込み中...</div>}

                    {!loading && tasks.length === 0 && (
                        <div className="today-empty">
                            <span className="today-empty-icon">{currentTab.isToday ? <Sun size={48} strokeWidth={1.2} /> : <CalendarDays size={48} strokeWidth={1.2} />}</span>
                            <span className="today-empty-title">{currentTab.isToday ? '今日やるタスクがありません' : `${currentTab.label}のタスクがありません`}</span>
                            <span className="today-empty-hint">タスク一覧の ☀ ボタンでタスクをピックしましょう</span>
                        </div>
                    )}

                    {rootItems.map((item, i) => {
                        const parentId = item.is_ghost_parent ? item.real_id : item.id;
                        const children = childrenByParent[parentId] || [];
                        const isGhost = !!item.is_ghost_parent;

                        return (
                            <React.Fragment key={item.id}>
                                {isManual && activeId && i === 0 && (
                                    <ReorderGap id="reorder-today-0" />
                                )}
                                {isGhost ? (
                                    <div className="today-parent-group">
                                        <TodayGroupHeader parentId={item.real_id} title={item.title} isManual={isManual} />
                                        <div className="today-children">
                                            {children.map((child, ci) => (
                                                <TodayCardItem key={child.id} task={child} isManual={isManual} isChild
                                                    statuses={statuses} statusMap={statusMap} selectedDate={selectedDate}
                                                    onStatusChange={handleStatusChange} onRemove={handleRemove}
                                                    onEdit={setEditingTask} justCompletedId={justCompletedId}
                                                    index={ci} isProcessing={actions.processingIds.has(child.id)} />
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className={children.length > 0 ? 'today-parent-group' : undefined}>
                                        <TodayCardItem
                                            task={item}
                                            isManual={isManual}
                                            statuses={statuses}
                                            statusMap={statusMap}
                                            selectedDate={selectedDate}
                                            onStatusChange={handleStatusChange}
                                            onRemove={handleRemove}
                                            onEdit={setEditingTask}
                                            justCompletedId={justCompletedId}
                                            index={i}
                                            isProcessing={actions.processingIds.has(item.id)}
                                        />
                                        {children.length > 0 && (
                                            <div className="today-children">
                                                {children.map((child, ci) => (
                                                    <TodayCardItem key={child.id} task={child} isManual={isManual} isChild
                                                        statuses={statuses} statusMap={statusMap} selectedDate={selectedDate}
                                                        onStatusChange={handleStatusChange} onRemove={handleRemove}
                                                        onEdit={setEditingTask} justCompletedId={justCompletedId}
                                                        index={ci} isProcessing={actions.processingIds.has(child.id)} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {isManual && activeId && (
                                    <ReorderGap id={`reorder-today-${i + 1}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
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
                        <span className="today-complete-icon"><PartyPopper size={28} strokeWidth={1.5} /></span>
                        <span className="today-complete-text">すべて完了しました！ お疲れさまでした</span>
                    </div>
                )}

                <DragOverlay>
                    {activeTaskData ? (
                        <div className={activeTaskData.is_ghost_parent ? 'today-ghost-header' : 'today-card'} style={{ opacity: 0.8, transform: 'scale(1.02)', cursor: 'grabbing', animation: 'none' }}>
                            <div className="today-drag-handle" style={{ opacity: 1 }}>⋮⋮</div>
                            {activeTaskData.is_ghost_parent ? (
                                <>
                                    <span className="today-ghost-icon"><Pin size={14} /></span>
                                    <span className="today-ghost-title">{activeTaskData.title}</span>
                                </>
                            ) : (
                                <div className="today-card-info">
                                    <div className="today-card-title-row">
                                        {activeTaskData.is_routine && <span className="today-routine-badge"><RefreshCw size={14} /></span>}
                                        <span className="today-card-title">{activeTaskData.title}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </DragOverlay>

                <style jsx global>{`
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
          background: var(--color-accent); color: #fff;
          box-shadow: 0 2px 10px color-mix(in srgb, var(--color-accent) 25%, transparent);
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

        /* Parent-child grouping (IMP-15) */
        .today-parent-group { }
        .today-children {
          margin-left: 2.25rem;
          padding: .2rem .75rem .6rem 0;
          border-left: 2px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        /* Task List */
        .today-list { display: flex; flex-direction: column; gap: 0.6rem; }
        .today-placeholder { display: flex; align-items: center; gap: 0.5rem; padding: 2rem; color: var(--color-text-muted); justify-content: center; }
        .today-empty {
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
          padding: 3rem; color: var(--color-text-muted);
        }
        .today-empty-icon { color: var(--color-text-disabled); opacity: 0.5; }
        .today-empty-title { font-size: 1rem; font-weight: 500; color: var(--color-text-secondary); }
        .today-empty-hint { font-size: 0.82rem; color: var(--color-text-disabled); }

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
          background:var(--color-accent); color:#fff; border-color:var(--color-accent);
          box-shadow:0 2px 8px color-mix(in srgb, var(--color-accent) 25%, transparent);
        }
        .today-sort-toggle.active:hover { filter:brightness(1.1); }

        .today-milestone-banner {
          margin-top: 1rem; padding: 0.85rem 1.25rem;
          border-radius: var(--radius-md);
          text-align: center; font-size: 0.88rem; font-weight: 600;
          animation: celebIn 0.4s cubic-bezier(.16,1,.3,1);
        }
        .milestone-start {
          background: var(--color-accent-subtle);
          border: 1px solid color-mix(in srgb, var(--color-accent) 15%, transparent);
          color: var(--color-accent);
        }
        .milestone-half {
          background: var(--color-warning-bg);
          border: 1px solid color-mix(in srgb, var(--color-warning) 20%, transparent);
          color: var(--color-warning);
        }
        .today-complete-banner {
          margin-top: 1.5rem; padding: 1.5rem;
          background: linear-gradient(135deg, var(--color-success-bg), var(--color-accent-subtle));
          border: 1px solid color-mix(in srgb, var(--color-success) 20%, transparent); border-radius: var(--radius-lg);
          display: flex; align-items: center; justify-content: center; gap: 0.75rem;
          font-size: 1.05rem; font-weight: 600;
          color: var(--color-success);
          animation: celebIn 0.6s cubic-bezier(.16,1,.3,1);
        }
        .today-complete-icon {
          display: flex; align-items: center;
          animation: celebBounce 0.6s 0.3s cubic-bezier(.34,1.56,.64,1) both;
        }
        .today-complete-text { animation: celebFadeIn 0.5s 0.2s ease both; }
        @keyframes celebIn { from{opacity:0;transform:scale(0.92)} to{opacity:1;transform:scale(1)} }
        @keyframes celebBounce { from{opacity:0;transform:scale(0) rotate(-15deg)} to{opacity:1;transform:scale(1) rotate(0deg)} }
        @keyframes celebFadeIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
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
