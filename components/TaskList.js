'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, useDroppable, closestCorners } from '@dnd-kit/core';
import TaskEditModal from './TaskEditModal';
import TaskItem from './TaskItem';
import { UnnestGap, ReorderGap } from './DndGaps';
import MultiSelectFilter from './MultiSelectFilter';
import { useMasterData } from '../hooks/useMasterData';
import { useFilterOptions } from '../hooks/useFilterOptions';
import { useTaskActions } from '../hooks/useTaskActions';
import { useTaskDnD } from '../hooks/useTaskDnD';
import { fetchDb, parseTags } from '@/lib/utils';
import { SORT_OPTIONS, taskComparator } from '@/lib/taskSorter';

export default function TaskList() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatuses, setFilterStatuses] = useState([]);
    const [filterTags, setFilterTags] = useState([]);
    const [filterImportance, setFilterImportance] = useState([]);
    const [filterUrgency, setFilterUrgency] = useState([]);
    const [sortKey, setSortKey] = useState('created_desc');
    const [sortMode, setSortMode] = useState('auto'); // 'auto' or 'manual'
    const [refreshKey, setRefreshKey] = useState(0);
    const [editingTask, setEditingTask] = useState(null);
    const [showArchived, setShowArchived] = useState(false);

    const activeRequestId = useRef(0);
    const tasksRef = useRef(tasks);
    tasksRef.current = tasks;
    const sortedParentTasksRef = useRef([]);

    const { masters, tags: allTags } = useMasterData();
    const allStatuses = useMemo(() => masters.status || [], [masters.status]);
    const allImportance = useMemo(() => masters.importance || [], [masters.importance]);
    const allUrgency = useMemo(() => masters.urgency || [], [masters.urgency]);

    const { statusOptions, tagOptions, importanceOptions, urgencyOptions } = useFilterOptions(allStatuses, allTags, allImportance, allUrgency);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Drop zone for un-nesting (making a task root)
    const { setNodeRef: setRootRef } = useDroppable({ id: 'root' });

    const fetchTasks = useCallback(async () => {
        const currentReq = ++activeRequestId.current;
        setLoading(true);
        try {
            const db = await fetchDb();

            let sql = `
              SELECT t.*,
                     p.title as parent_title,
                     im.label as importance_label, im.color as importance_color,
                     um.label as urgency_label, um.color as urgency_color,
                     sm.label as status_label, sm.color as status_color,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM tasks t
              LEFT JOIN tasks p ON t.parent_id = p.id
              LEFT JOIN task_tags tt ON t.id = tt.task_id
              LEFT JOIN tags tg ON tt.tag_id = tg.id
              LEFT JOIN importance_master im ON t.importance_level = im.level
              LEFT JOIN urgency_master um ON t.urgency_level = um.level
              LEFT JOIN status_master sm ON t.status_code = sm.code
            `;

            const conditions = [];
            const params = [];
            let paramIndex = 1;

            // Filter by archive status
            if (showArchived) {
                conditions.push('t.archived_at IS NOT NULL');
            } else {
                conditions.push('t.archived_at IS NULL');
            }

            if (filterStatuses.length > 0) {
                const placeholders = filterStatuses.map(() => `$${paramIndex++}`).join(',');
                conditions.push(`t.status_code IN (${placeholders})`);
                params.push(...filterStatuses);
            }

            if (filterTags.length > 0) {
                const placeholders = filterTags.map(() => `$${paramIndex++}`).join(',');
                conditions.push(`t.id IN (SELECT task_id FROM task_tags WHERE tag_id IN (${placeholders}))`);
                params.push(...filterTags);
            }

            if (filterImportance.length > 0) {
                const placeholders = filterImportance.map(() => `$${paramIndex++}`).join(',');
                conditions.push(`t.importance_level IN (${placeholders})`);
                params.push(...filterImportance);
            }

            if (filterUrgency.length > 0) {
                const placeholders = filterUrgency.map(() => `$${paramIndex++}`).join(',');
                conditions.push(`t.urgency_level IN (${placeholders})`);
                params.push(...filterUrgency);
            }

            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }

            sql += ' GROUP BY t.id ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC';

            const rawTasks = await db.select(sql, params);

            // Parse SQLite json_group_array results back into JS arrays
            const parsedTasks = rawTasks.map(task => ({
                ...task,
                tags: parseTags(task)
            }));

            if (currentReq === activeRequestId.current) {
                setTasks(parsedTasks);
            }
        } catch (e) { console.error("Tauri DB fetch error:", e); }
        finally {
            if (currentReq === activeRequestId.current) {
                setLoading(false);
            }
        }
    }, [filterStatuses, filterTags, filterImportance, filterUrgency, showArchived]);

    useEffect(() => { fetchTasks(); }, [fetchTasks, refreshKey]);

    // Load sort mode setting on mount
    useEffect(() => {
        (async () => {
            try {
                const db = await fetchDb();
                const rows = await db.select("SELECT value FROM app_settings WHERE key = 'sort_mode_tasks'");
                if (rows.length > 0) setSortMode(rows[0].value);
            } catch (e) { console.error(e); }
        })();
    }, []);

    const toggleSortMode = async () => {
        const prevMode = sortMode;
        const newMode = prevMode === 'auto' ? 'manual' : 'auto';
        setSortMode(newMode);
        try {
            const db = await fetchDb();
            await db.execute(
                'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
                ['sort_mode_tasks', newMode]
            );
        } catch (e) {
            console.error(e);
            setSortMode(prevMode);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '設定の保存に失敗しました', type: 'error' } }));
        }
    };

    const handleTaskAdded = () => setRefreshKey(k => k + 1);
    const handleTaskEdited = () => setRefreshKey(k => k + 1);
    const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

    // Derived data
    const parentTasks = useMemo(() => tasks.filter(t => !t.parent_id || !tasks.some(p => p.id === t.parent_id)), [tasks]);
    const getChildTasks = useCallback((parentId) => {
        const children = tasks.filter(t => t.parent_id === parentId);
        if (sortMode === 'manual') {
            return children.sort((a, b) => a.sort_order - b.sort_order);
        }
        return children.sort((a, b) => {
            if (!a.due_date && !b.due_date) return new Date(a.created_at) - new Date(b.created_at);
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
        });
    }, [tasks, sortMode]);

    const sortedParentTasks = useMemo(() => {
        const sorted = [...parentTasks];
        if (sortMode === 'manual') {
            sorted.sort((a, b) => a.sort_order - b.sort_order);
            return sorted;
        }
        sorted.sort(taskComparator(sortKey, allStatuses));
        return sorted;
    }, [parentTasks, sortKey, sortMode, allStatuses]);

    sortedParentTasksRef.current = sortedParentTasks;
    const getSortedParentTasks = useCallback(() => sortedParentTasksRef.current, []);

    const statusMap = useMemo(() => {
        const m = {};
        allStatuses.forEach(s => { m[s.code] = { label: s.label, color: s.color }; });
        return m;
    }, [allStatuses]);

    // Custom hooks
    const { handleStatusChange, handleDelete, handleTodayToggle, handleArchive, handleRestore, processingIds } = useTaskActions({
        setTasks,
        fetchTasks,
        refresh,
        getTasks: useCallback(() => tasksRef.current, []),
    });

    const { activeId, activeTaskData, isDraggingChild, handleDragStart, handleDragEnd } = useTaskDnD({
        tasks,
        setTasks,
        fetchTasks,
        sortMode,
        getSortedParentTasks,
        getChildTasks,
    });

    return (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="tl-root">
                {/* Archive Toggle */}
                <div className="tl-archive-tabs">
                    <button className={`tl-archive-tab ${!showArchived ? 'active' : ''}`} onClick={() => setShowArchived(false)}>
                        📋 タスク
                    </button>
                    <button className={`tl-archive-tab ${showArchived ? 'active' : ''}`} onClick={() => setShowArchived(true)}>
                        📦 アーカイブ済み
                    </button>
                </div>

                {/* Toolbar */}
                <div className="tl-toolbar">
                    <MultiSelectFilter label="ステータス" options={statusOptions} selected={filterStatuses} onChange={setFilterStatuses} />
                    {tagOptions.length > 0 && <MultiSelectFilter label="タグ" options={tagOptions} selected={filterTags} onChange={setFilterTags} />}
                    <MultiSelectFilter label="重要度" options={importanceOptions} selected={filterImportance} onChange={setFilterImportance} />
                    <MultiSelectFilter label="緊急度" options={urgencyOptions} selected={filterUrgency} onChange={setFilterUrgency} />
                    <div className="tl-sort-group" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        {!showArchived && (
                            <button
                                className={`tl-sort-toggle ${sortMode === 'manual' ? 'active' : ''}`}
                                onClick={toggleSortMode}
                                title={sortMode === 'manual' ? '自動ソートに切替' : '手動並び替えに切替'}
                            >
                                {sortMode === 'manual' ? '✋ 手動' : '🔀 自動'}
                            </button>
                        )}
                        {sortMode === 'auto' && (
                            <div className="tl-filter">
                                <label>並び順</label>
                                <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
                                    {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* Task list - Droppable 'root' area */}
                <div className="tl-items" ref={setRootRef}>
                    {loading && tasks.length === 0 && (
                        <div className="tl-placeholder"><span className="spinner" /> 読み込み中...</div>
                    )}
                    {!loading && parentTasks.length === 0 && !showArchived && (
                        <div className="tl-placeholder tl-empty">
                            <span className="tl-empty-icon">🌱</span>
                            <span className="tl-empty-title">最初のタスクを追加して、今日をスタートしましょう！</span>
                            <span className="tl-empty-hint">上のフォームからタスクを追加できます</span>
                        </div>
                    )}
                    {!loading && parentTasks.length === 0 && showArchived && (
                        <div className="tl-placeholder tl-empty">
                            <span className="tl-empty-icon">📦</span>
                            <span className="tl-empty-title">アーカイブ済みのタスクはありません</span>
                            <span className="tl-empty-hint">完了・キャンセル済みタスクの📦ボタンでアーカイブできます</span>
                        </div>
                    )}
                    {sortedParentTasks.map((task, i) => (
                        <React.Fragment key={task.id}>
                            {/* Manual mode: ReorderGap between root tasks */}
                            {!showArchived && sortMode === 'manual' && activeId && i === 0 && (
                                <ReorderGap id="reorder-root-0" />
                            )}
                            {/* Auto mode: UnnestGap for children being dragged */}
                            {!showArchived && sortMode === 'auto' && isDraggingChild && i === 0 && (
                                <UnnestGap id={`unnest-gap-top`} />
                            )}
                            <TaskItem task={task} childTasks={getChildTasks(task.id)}
                                onStatusChange={handleStatusChange} onDelete={handleDelete}
                                onTaskAdded={handleTaskAdded} onEdit={setEditingTask}
                                onTodayToggle={handleTodayToggle}
                                onArchive={handleArchive} onRestore={handleRestore}
                                index={i} statusMap={statusMap} allStatuses={allStatuses}
                                isDraggable={!showArchived && (sortMode === 'manual' || getChildTasks(task.id).length === 0)}
                                isArchived={showArchived}
                                sortMode={sortMode}
                                activeId={activeId}
                                activeDragParentId={activeTaskData?.parent_id}
                                isProcessing={processingIds.has(task.id)}
                                processingIds={processingIds}
                            />
                            {/* Manual mode: ReorderGap after each root task */}
                            {!showArchived && sortMode === 'manual' && activeId && (
                                <ReorderGap id={`reorder-root-${i + 1}`} />
                            )}
                            {/* Auto mode: UnnestGap after each root task */}
                            {!showArchived && sortMode === 'auto' && isDraggingChild && (
                                <UnnestGap id={`unnest-gap-${task.id}`} />
                            )}
                            {/* Manual mode: UnnestGap when dragging a child */}
                            {!showArchived && sortMode === 'manual' && isDraggingChild && (
                                <UnnestGap id={`unnest-gap-${task.id}`} />
                            )}
                        </React.Fragment>
                    ))}

                    {/* Add extra space at bottom to make dropping to root easier */}
                    <div style={{ height: '50px' }} />
                </div>

                <DragOverlay>
                    {activeTaskData ? (
                        <div className="tc-card" style={{ opacity: 0.8, transform: 'scale(1.02)', cursor: 'grabbing' }}>
                            <div className="tc-body">
                                <span style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>📄</span>
                                <div className="tc-info">
                                    <div className="tc-title" style={{ fontWeight: 'bold' }}>{activeTaskData.title}</div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>

                {editingTask && <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onSaved={handleTaskEdited} />}

                <style jsx global>{`
            .tl-root { min-height: 100px; }
            .tl-toolbar {
              display:flex; align-items:center; gap:.85rem; flex-wrap:wrap;
              margin-bottom:1.25rem; padding:.65rem .85rem;
              background:var(--color-surface); border:1px solid var(--border-color);
              border-radius:var(--radius-md); box-shadow:var(--shadow-sm);
            }
            .tl-filter { display:flex; align-items:center; gap:.4rem; }
            .tl-filter label { font-size:.78rem; color:var(--color-text-muted); font-weight:500; white-space:nowrap; }
            .tl-spin { display:inline-block; animation:spin .8s linear infinite; }
            .tl-items { display:flex; flex-direction:column; gap:.6rem; }
            .tl-placeholder { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.5rem; padding:3rem; color:var(--color-text-muted); }
            .tl-empty-icon { font-size:2.5rem; opacity:.5; }
            .tl-empty-title { font-size:1rem; font-weight:500; color:var(--color-text-secondary); }
            .tl-empty-hint { font-size:.82rem; color:var(--color-text-disabled); }

            .tl-unnest-gap {
                position: relative;
                padding: 6px 0;
                transition: padding 0.15s ease;
                animation: fadeIn 0.2s ease;
            }
            .tl-unnest-gap-line {
                height: 2px;
                border-radius: 1px;
                background: var(--color-primary);
                opacity: 0.3;
                transition: all 0.15s ease;
            }
            .tl-unnest-gap.drag-over {
                padding: 14px 0;
            }
            .tl-unnest-gap.drag-over .tl-unnest-gap-line {
                height: 3px;
                opacity: 1;
                box-shadow: 0 0 8px rgba(79,110,247,0.3);
            }
            .tl-unnest-gap-label {
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                font-size: 0.72rem;
                font-weight: 600;
                color: var(--color-primary);
                background: var(--color-surface);
                padding: 0.15rem 0.6rem;
                border-radius: 8px;
                border: 1px solid var(--color-primary);
                white-space: nowrap;
                animation: fadeIn 0.15s ease;
            }

            /* ---- Task Card ---- */
            .tc-card {
              background:var(--color-surface); border:1px solid var(--border-color);
              border-radius:var(--radius-md); overflow:hidden;
              transition:all .2s; box-shadow:var(--shadow-sm);
              animation:tcIn .3s cubic-bezier(.16,1,.3,1) both;
              position: relative; touch-action: none; /* For DnD */
            }
            .tc-card.drag-over {
                box-shadow: 0 0 0 2px var(--color-primary), 0 4px 12px rgba(0,0,0,0.1);
                background: var(--color-surface-active);
                transform: scale(1.01);
                z-index: 10;
            }
            @keyframes tcIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
            .tc-card:hover { border-color:var(--border-color-hover); box-shadow:var(--shadow-card-hover); }
            .tc-card.done { opacity:.55; }
            .tc-card.done:hover { opacity:.75; }
            .tc-card.cancelled { opacity:.4; filter: grayscale(1); }
            .tc-card.cancelled:hover { opacity:.6; filter: grayscale(0.8); }

            .tc-body { display:flex; align-items:flex-start; gap:.65rem; padding:.85rem 1rem; }
            .tc-handle {
                cursor: grab; color: var(--color-text-disabled);
                display: flex; align-items: center; justify-content: center;
                width: 20px; height: 100%; align-self: stretch;
                opacity: 0.5; transition: opacity 0.2s;
                font-size: .85rem; user-select: none;
            }
            .tc-handle:hover, .tc-card:hover .tc-handle { opacity: 1; }
            .tc-handle:active { cursor: grabbing; }

            .tc-toggle {
              background:none; border:none; color:var(--color-text-muted); cursor:pointer;
              width:22px; height:22px; flex-shrink:0; display:flex; align-items:center;
              justify-content:center; font-size:1.1rem; border-radius:4px; margin-top:2px;
            }
            .tc-toggle:hover { background:var(--color-surface-hover); }
            .tc-chev { display:inline-block; transition:transform .2s; }
            .tc-chev.open { transform:rotate(90deg); }

            .tc-info { flex:1; min-width:0; cursor:pointer; padding:.1rem .3rem; border-radius:var(--radius-sm); transition:background .15s; }
            .tc-info:hover { background:var(--color-surface-hover); }
            .tc-title-row { display:flex; align-items:center; gap:.45rem; flex-wrap:wrap; margin-bottom:.3rem; }
            .tc-title { font-weight:600; font-size:.92rem; color:var(--color-text); line-height:1.4; }
            .tc-title.strike { text-decoration:line-through; color:var(--color-text-disabled); }
            .tc-tag { font-size:.63rem; font-weight:600; padding:.1rem .5rem; border-radius:10px; color:#fff; }

            .tc-meta { display:flex; gap:.7rem; flex-wrap:wrap; }
            .tc-meta-item { font-size:.75rem; color:var(--color-text-muted); display:flex; align-items:center; gap:.2rem; white-space:nowrap; }
            .tc-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
            .tc-badge { font-size:.6rem; font-weight:700; padding:.05rem .35rem; border-radius:6px; margin-left:.15rem; }
            .tc-badge-danger  { background:var(--color-danger-bg); color:var(--color-danger); }
            .tc-badge-warning { background:var(--color-warning-bg); color:var(--color-warning); }
            .tc-badge-info    { background:rgba(79,110,247,.08); color:var(--color-primary); }

            .tc-actions { display:flex; gap:.3rem; flex-shrink:0; align-items:center; margin-top:2px; }
            .tc-status-select {
              font-weight:600; font-size:.78rem;
              padding:.3rem .5rem .3rem .5rem;
              border-radius:var(--radius-sm); cursor:pointer;
            }
            .tc-act-btn {
              background:transparent; border:1px solid transparent;
              color:var(--color-text-muted); cursor:pointer; font-size:.82rem;
              width:28px; height:28px; display:flex; align-items:center;
              justify-content:center; border-radius:var(--radius-sm); transition:all .15s;
            }
            .tc-act-btn:hover { background:var(--color-surface-hover); color:var(--color-text); border-color:var(--border-color); }
            .tc-act-btn.danger:hover { background:var(--color-danger-bg); color:var(--color-danger); border-color:rgba(220,38,38,.2); }
            .tc-today-btn.active { background:rgba(251,191,36,.15); border-color:rgba(251,191,36,.4); }
            .tc-today-btn.active:hover { background:rgba(251,191,36,.25); }
            .tc-archive-btn:hover { background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.2); color:#b45309; }
            .tc-restore-btn { opacity:1 !important; }
            .tc-restore-btn:hover { background:rgba(79,110,247,.1); border-color:rgba(79,110,247,.2); color:var(--color-primary); }
            .tc-status-label { font-size:.78rem; font-weight:600; white-space:nowrap; }

            .tc-act-btn:disabled { opacity:0.5; cursor:not-allowed; }
            .tc-status-select:disabled { opacity:0.5; cursor:not-allowed; }

            /* Archive Tabs */
            .tl-archive-tabs {
              display:flex; gap:3px; margin-bottom:1rem; padding:3px;
              background:var(--color-surface); border:1px solid var(--border-color);
              border-radius:var(--radius-md); box-shadow:var(--shadow-sm);
            }
            .tl-archive-tab {
              flex:1; padding:.5rem .75rem; border:none; background:transparent;
              color:var(--color-text-muted); font-size:.85rem; font-weight:500;
              border-radius:8px; cursor:pointer; transition:all .2s; font-family:inherit;
              display:flex; align-items:center; justify-content:center; gap:.35rem;
            }
            .tl-archive-tab:hover { background:var(--color-surface-hover); color:var(--color-text); }
            .tl-archive-tab.active {
              background:var(--color-primary); color:#fff; font-weight:600;
              box-shadow:0 2px 10px rgba(79,110,247,.18);
            }

            /* Sort mode toggle */
            .tl-sort-toggle {
              padding:.35rem .7rem; border:1px solid var(--border-color);
              border-radius:var(--radius-sm); font-size:.78rem; font-weight:600;
              cursor:pointer; transition:all .2s; font-family:inherit;
              background:var(--color-surface); color:var(--color-text-muted);
              white-space:nowrap;
            }
            .tl-sort-toggle:hover { border-color:var(--border-color-hover); color:var(--color-text); }
            .tl-sort-toggle.active {
              background:var(--color-primary); color:#fff; border-color:var(--color-primary);
              box-shadow:0 2px 8px rgba(79,110,247,.2);
            }
            .tl-sort-toggle.active:hover { filter:brightness(1.1); }

            .tc-sub-input { padding:0 1rem .85rem 2.75rem; animation:fadeSlideIn .3s ease; }
            .tc-children { margin-left:2.25rem; padding:.2rem .75rem .6rem 0; border-left:2px solid var(--border-color); }
          `}</style>
            </div>
        </DndContext>
    );
}
