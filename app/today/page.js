'use client';

import './today.css';
import Link from 'next/link';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, closestCorners } from '@dnd-kit/core';
import WorkDetailPanel from '@/components/WorkDetailPanel';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import { ReorderGap } from '@/components/DndGaps';
import { addDays, toDateStr } from '@/lib/dateUtils';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { useTodayTasks } from '@/hooks/useTodayTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { useDbOperation } from '@/hooks/useDbOperation';
import { useTodayGrouping, flattenTodayGroups } from '@/hooks/useTodayGrouping';
import { notifyTasksChanged } from '@/lib/taskHierarchy';
import { Sun, CalendarDays, Hand, ArrowUpDown, Pin, RefreshCw, GripVertical, Plus } from 'lucide-react';
import TodayCardItem from './_components/TodayCardItem';
import TodayGroupHeader from './_components/TodayGroupHeader';
import TodayStats from './_components/TodayStats';

function buildDateTabs(today) {
    const now = new Date(`${today}T12:00:00`);
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
    const [calendarToday, setCalendarToday] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const dateTabs = useMemo(() => buildDateTabs(calendarToday), [calendarToday]);
    const [selectedDate, setSelectedDate] = useState(() => dateTabs[0].date);
    useEffect(() => {
        const updateDate = () => {
            const next = new Date().toLocaleDateString('sv-SE');
            if (next === calendarToday) return;
            setSelectedDate(selected => selected === calendarToday ? next : selected);
            setCalendarToday(next);
        };
        const timer = setInterval(updateDate, 60000);
        window.addEventListener('focus', updateDate);
        return () => { clearInterval(timer); window.removeEventListener('focus', updateDate); };
    }, [calendarToday]);
    const [justCompletedId, setJustCompletedId] = useState(null);
    const [editingTask, setEditingTask] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [justDroppedId, setJustDroppedId] = useState(null);

    // Filter state (UI-managed)
    const [filterStatuses, setFilterStatuses] = useState([]);
    const [filterTags, setFilterTags] = useState([]);
    const [filterImportance, setFilterImportance] = useState([]);
    const [filterUrgency, setFilterUrgency] = useState([]);

    // Data hook: master data, tasks, sort, loading
    const {
        tasks, setTasks, loading, loadTasks, error, retry,
        unfilteredStats,
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
    // childOverrides: optional map to override childrenByParentRef for a specific parent (used for child reorder)
    const persistTodaySortOrder = useCallback(async (newRootItems, childOverrides = null) => {
        try {
            await dbOp(async (db) => {
                const currentChildren = childOverrides || childrenByParentRef.current;
                let orderIdx = 1;

                for (const item of flattenTodayGroups(newRootItems, currentChildren)) {
                    if (item.is_routine) {
                        await db.execute('UPDATE routines SET today_sort_order = $1 WHERE id = $2', [orderIdx++, item.routine_id]);
                    } else {
                        await db.execute('UPDATE tasks SET today_sort_order = $1 WHERE id = $2', [orderIdx++, item.id]);
                    }
                }
                notifyTasksChanged();
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
        setJustDroppedId(active.id);
        setTimeout(() => setJustDroppedId(null), 400);

        if (!over) return;
        const overIdStr = String(over.id);

        // IMP-38: CHILD REORDER — Dropped on a child reorder gap
        if (overIdStr.startsWith('reorder-today-child-')) {
            const parts = overIdStr.replace('reorder-today-child-', '').split('-');
            const parentId = parseInt(parts[0]);
            let targetIndex = parseInt(parts[1]);

            const currentChildrenMap = childrenByParentRef.current;
            const childList = [...(currentChildrenMap[parentId] || [])];
            const childOrder = childList.map(c => c.id);
            const oldIndex = childOrder.indexOf(active.id);
            if (oldIndex < 0) return;

            childOrder.splice(oldIndex, 1);
            if (oldIndex < targetIndex) targetIndex--;
            childOrder.splice(targetIndex, 0, active.id);

            const reorderedChildren = childOrder.map(id => childList.find(c => c.id === id)).filter(Boolean);
            const newChildrenMap = { ...currentChildrenMap, [parentId]: reorderedChildren };

            // Update today_sort_order values in allTasks (preserves filtered-out items for BUG-12)
            const currentRoots = rootItemsRef.current;
            const orderMap = new Map();
            let orderIdx = 1;
            flattenTodayGroups(currentRoots, newChildrenMap).forEach(item => orderMap.set(item.id, orderIdx++));
            setTasks(prev => prev.map(t => orderMap.has(t.id) ? { ...t, today_sort_order: orderMap.get(t.id) } : t));

            await persistTodaySortOrder(currentRoots, newChildrenMap);
            return;
        }

        // ROOT REORDER — Dropped on a root reorder gap
        if (!overIdStr.startsWith('reorder-today-')) return;

        // Don't allow child tasks to be reordered at root level
        const activeTask = tasks.find(t => t.id === active.id);
        if (activeTask && !activeTask.is_routine && activeTask.parent_id) return;

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

        // Update today_sort_order values in allTasks (preserves filtered-out items for BUG-12)
        const orderMap = new Map();
        let orderIdx = 1;
        flattenTodayGroups(reorderedRoots, currentChildren).forEach(item => orderMap.set(item.id, orderIdx++));
        setTasks(prev => prev.map(t => orderMap.has(t.id) ? { ...t, today_sort_order: orderMap.get(t.id) } : t));

        await persistTodaySortOrder(reorderedRoots);
    }, [tasks, setTasks, persistTodaySortOrder, rootItemsRef, childrenByParentRef]);

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
                notifyTasksChanged();
            }, { error: '今日やるタスクの変更に失敗しました' });
        } catch {
            reloadTasks();
        }
    };

    // BUG-12 fix: Use unfilteredStats from the hook (independent of filter state)
    const stats = unfilteredStats;

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

    // IMP-38: Determine if dragging a child task (for showing appropriate ReorderGaps)
    const draggingChildInfo = useMemo(() => {
        if (!activeId) return null;
        const task = tasks.find(t => t.id === activeId);
        if (task && !task.is_routine && task.parent_id) {
            return { parentId: task.parent_id };
        }
        return null;
    }, [activeId, tasks]);

    return (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="today-root">
                <div className="today-header">
                    <div className="today-title-row">
                        <h1 className="page-heading">予定表</h1>
                        <span className="today-date">{dateStr}</span>
                    </div>
                    <button className="ui-button" onClick={() => window.dispatchEvent(new CustomEvent('yarukoto:openFab'))}><Plus size={15} />記録する</button>
                </div>

                <section className="schedule-board" aria-label="この日のタスク">
                {/* Date Navigation Tabs */}
                <div className="date-tabs">
                    {dateTabs.map(tab => (
                        <button key={tab.date}
                            className={`date-tab ${selectedDate === tab.date ? 'active' : ''} ${tab.isWeekend ? 'weekend' : ''}`}
                            aria-pressed={selectedDate === tab.date} onClick={() => setSelectedDate(tab.date)}>
                            <span className="date-tab-label">{tab.label}</span>
                            <span className="date-tab-wd">{tab.weekday}</span>
                        </button>
                    ))}
                </div>

                {/* Filter Toolbar */}
                <div className="today-toolbar">
                    <MultiSelectFilter label="状態" options={statusOptions} selected={filterStatuses} onChange={setFilterStatuses} />
                    {tagOptions.length > 0 && <MultiSelectFilter label="タグ" options={tagOptions} selected={filterTags} onChange={setFilterTags} />}
                    <MultiSelectFilter label="重要度" options={importanceOptions} selected={filterImportance} onChange={setFilterImportance} />
                    <MultiSelectFilter label="緊急度" options={urgencyOptions} selected={filterUrgency} onChange={setFilterUrgency} />
                    <div className="today-sort-tools">
                        <button
                            className={`today-sort-toggle ${sortMode === 'manual' ? 'active' : ''}`}
                            onClick={toggleSortMode}
                            title={sortMode === 'manual' ? '自動ソートに切替' : '手動並び替えに切替'}
                        >
                            {sortMode === 'manual' ? <><Hand size={14} /> 手動</> : <><ArrowUpDown size={14} /> 自動</>}
                        </button>
                        {sortMode === 'auto' && (
                            <div className="today-filter">

                                <select aria-label="並び順" value={sortKey} onChange={e => setSortKey(e.target.value)}>
                                    <option value="priority">優先度順</option>
                                    <option value="status">状態順</option>
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
                {!loading && !error && <TodayStats stats={stats} />}
                {error && <div role="alert" className="work-error">{error}<button type="button" onClick={retry} disabled={loading}>再試行</button></div>}

                <div className="today-columns" aria-hidden="true"><span /><span>タスク</span><span>状態</span><span>期限</span><span>プロジェクト</span><span>見積</span><span /></div>
                {/* Task List */}
                <div className="today-list" aria-busy={loading}>
                    {loading && tasks.length === 0 && <div className="today-placeholder"><span className="spinner" /> 読み込み中...</div>}

                    {!loading && !error && tasks.length === 0 && (
                        <div className="today-empty">
                            <span className="today-empty-icon">{currentTab.isToday ? <Sun size={48} strokeWidth={1.2} /> : <CalendarDays size={48} strokeWidth={1.2} />}</span>
                            <span className="today-empty-title">{currentTab.isToday ? '今日やるタスクがありません' : `${currentTab.label}のタスクがありません`}</span>
                            <Link className="ui-button" href="/work">仕事を選ぶ</Link>
                        </div>
                    )}

                    {rootItems.map((item, i) => {
                        const parentId = item.is_ghost_parent ? item.real_id : item.id;
                        const children = childrenByParent[parentId] || [];
                        const isGhost = !!item.is_ghost_parent;

                        // Helper: render children with optional ReorderGaps for child reorder (IMP-38)
                        const renderChildren = (childList, ownerId = parentId, path = [parentId]) => (
                            <div className="today-children">
                                {childList.filter(child => !path.includes(child.real_id || child.id)).map((child, ci) => (
                                    <React.Fragment key={child.id}>
                                        {isManual && draggingChildInfo?.parentId === ownerId && ci === 0 && (
                                            <ReorderGap id={`reorder-today-child-${ownerId}-0`} />
                                        )}
                                        {child.is_ghost_parent ? <TodayGroupHeader parentId={child.real_id} title={child.title} isManual={false} /> :
                                        <TodayCardItem task={child} isManual={isManual} isChild
                                            statuses={statuses} statusMap={statusMap} selectedDate={selectedDate}
                                            onStatusChange={handleStatusChange} onRemove={handleRemove}
                                            onEdit={setEditingTask} justCompletedId={justCompletedId}
                                            justDroppedId={justDroppedId}
                                            index={ci} isProcessing={actions.processingIds.has(child.id)} />}
                                        {(childrenByParent[child.real_id || child.id] || []).length > 0 && renderChildren(childrenByParent[child.real_id || child.id], child.real_id || child.id, [...path, child.real_id || child.id])}
                                        {isManual && draggingChildInfo?.parentId === ownerId && (
                                            <ReorderGap id={`reorder-today-child-${ownerId}-${ci + 1}`} />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        );

                        return (
                            <React.Fragment key={item.id}>
                                {isManual && activeId && !draggingChildInfo && i === 0 && (
                                    <ReorderGap id="reorder-today-0" />
                                )}
                                {isGhost ? (
                                    <div className="today-parent-group">
                                        <TodayGroupHeader parentId={item.real_id} title={item.title} isManual={isManual} />
                                        {renderChildren(children)}
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
                                            justDroppedId={justDroppedId}
                                            index={i}
                                            isProcessing={actions.processingIds.has(item.id)}
                                        />
                                        {children.length > 0 && renderChildren(children)}
                                    </div>
                                )}
                                {isManual && activeId && !draggingChildInfo && (
                                    <ReorderGap id={`reorder-today-${i + 1}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                </section>
                <DragOverlay>
                    {activeTaskData ? (
                        <div className={`${activeTaskData.is_ghost_parent ? 'today-ghost-header' : 'today-card'} dnd-overlay-today`} style={{ animation: 'none' }}>
                            <div className="today-drag-handle" style={{ opacity: 0.6 }}><GripVertical size={14} strokeWidth={2} /></div>
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

                {editingTask && (
                    <WorkDetailPanel
                        taskId={editingTask.id}
                        onClose={() => setEditingTask(null)}
                        onChanged={() => loadTasks(selectedDate)}
                        onOpenTask={id => setEditingTask({ id })}
                    />
                )}
            </div>
        </DndContext>
    );
}
