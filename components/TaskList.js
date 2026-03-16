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
import { useDbOperation } from '@/hooks/useDbOperation';
import { ClipboardList, Archive, Hand, ArrowUpDown, Search, GripVertical } from 'lucide-react';
import { buildTaskListQuery } from '@/lib/taskListQueries';
import ArchiveView from './ArchiveView';

export default function TaskList({ projectId = null }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatuses, setFilterStatuses] = useState([]);
    const [filterTags, setFilterTags] = useState([]);
    const [filterImportance, setFilterImportance] = useState([]);
    const [filterUrgency, setFilterUrgency] = useState([]);
    const [filterProjects, setFilterProjects] = useState([]);
    const [sortKey, setSortKey] = useState('created_desc');
    const [sortMode, setSortMode] = useState('auto'); // 'auto' or 'manual'
    const [refreshKey, setRefreshKey] = useState(0);
    const [editingTask, setEditingTask] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [justCompletedId, setJustCompletedId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const activeRequestId = useRef(0);
    const tasksRef = useRef(tasks);
    tasksRef.current = tasks;
    const sortedParentTasksRef = useRef([]);
    const searchTimerRef = useRef(null);

    const { masters, tags: allTags, projects: allProjects } = useMasterData();
    const allStatuses = useMemo(() => masters.status || [], [masters.status]);
    const allImportance = useMemo(() => masters.importance || [], [masters.importance]);
    const allUrgency = useMemo(() => masters.urgency || [], [masters.urgency]);

    const { statusOptions, tagOptions, importanceOptions, urgencyOptions, projectOptions } = useFilterOptions(allStatuses, allTags, allImportance, allUrgency, allProjects);

    const dbOp = useDbOperation();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Drop zone for un-nesting (making a task root)
    const { setNodeRef: setRootRef } = useDroppable({ id: 'root' });

    const fetchTasks = useCallback(async () => {
        // Archive mode: ArchiveView manages its own data fetching
        if (showArchived) {
            setTasks([]);
            setLoading(false);
            return;
        }

        const currentReq = ++activeRequestId.current;
        setLoading(true);
        try {
            const db = await fetchDb();

            const { sql, params } = buildTaskListQuery({
                showArchived,
                filterStatuses,
                filterTags,
                filterImportance,
                filterUrgency,
                filterProjects,
                projectId,
                searchTerm: debouncedSearch,
            });

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
    }, [filterStatuses, filterTags, filterImportance, filterUrgency, filterProjects, showArchived, projectId, debouncedSearch]);

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
            await dbOp(async (db) => {
                await db.execute(
                    'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
                    ['sort_mode_tasks', newMode]
                );
            }, { error: '設定の保存に失敗しました' });
        } catch {
            setSortMode(prevMode);
        }
    };

    const onSearchChange = useCallback((e) => {
        const val = e.target.value;
        setSearchTerm(val);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => setDebouncedSearch(val.trim()), 300);
    }, []);

    const clearSearch = useCallback(() => {
        setSearchTerm('');
        setDebouncedSearch('');
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    }, []);

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
    const { handleStatusChange: rawHandleStatusChange, handleDelete, handleTodayToggle, handleArchive, handleRestore, processingIds } = useTaskActions({
        setTasks,
        fetchTasks,
        refresh,
        getTasks: useCallback(() => tasksRef.current, []),
    });

    // Wrap status change to trigger sparkle animation on completion
    const handleStatusChange = useCallback((taskId, newCode) => {
        const code = parseInt(newCode);
        if (code === 3) {
            setJustCompletedId(taskId);
            setTimeout(() => setJustCompletedId(null), 700);
        }
        rawHandleStatusChange(taskId, newCode);
    }, [rawHandleStatusChange]);

    const { activeId, activeTaskData, isDraggingChild, justDroppedId, handleDragStart, handleDragEnd } = useTaskDnD({
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
                        <ClipboardList size={14} /> タスク
                    </button>
                    <button className={`tl-archive-tab ${showArchived ? 'active' : ''}`} onClick={() => setShowArchived(true)}>
                        <Archive size={14} /> アーカイブ済み
                    </button>
                </div>

                {/* Search bar (active tasks only) */}
                {!showArchived && (
                    <div className="tl-search">
                        <Search size={15} className="tl-search-icon" />
                        <input
                            type="text"
                            className="tl-search-input"
                            placeholder="タスクを検索..."
                            value={searchTerm}
                            onChange={onSearchChange}
                        />
                        {searchTerm && (
                            <button className="tl-search-clear" onClick={clearSearch} title="検索をクリア">✕</button>
                        )}
                    </div>
                )}

                {/* Toolbar */}
                <div className="tl-toolbar">
                    <MultiSelectFilter label="ステータス" options={statusOptions} selected={filterStatuses} onChange={setFilterStatuses} />
                    {tagOptions.length > 0 && <MultiSelectFilter label="タグ" options={tagOptions} selected={filterTags} onChange={setFilterTags} />}
                    <MultiSelectFilter label="重要度" options={importanceOptions} selected={filterImportance} onChange={setFilterImportance} />
                    <MultiSelectFilter label="緊急度" options={urgencyOptions} selected={filterUrgency} onChange={setFilterUrgency} />
                    {projectOptions.length > 1 && <MultiSelectFilter label="プロジェクト" options={projectOptions} selected={filterProjects} onChange={setFilterProjects} />}
                    <div className="tl-sort-group" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                        {!showArchived && (
                            <button
                                className={`tl-sort-toggle ${sortMode === 'manual' ? 'active' : ''}`}
                                onClick={toggleSortMode}
                                title={sortMode === 'manual' ? '自動ソートに切替' : '手動並び替えに切替'}
                            >
                                {sortMode === 'manual' ? <><Hand size={14} /> 手動</> : <><ArrowUpDown size={14} /> 自動</>}
                            </button>
                        )}
                        {!showArchived && sortMode === 'auto' && (
                            <div className="tl-filter">
                                <label>並び順</label>
                                <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
                                    {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content: Archive view or regular task list */}
                {showArchived ? (
                    <ArchiveView
                        filterStatuses={filterStatuses}
                        filterTags={filterTags}
                        filterImportance={filterImportance}
                        filterUrgency={filterUrgency}
                        filterProjects={filterProjects}
                        projectId={projectId}
                        statusMap={statusMap}
                        allStatuses={allStatuses}
                        onEdit={setEditingTask}
                    />
                ) : (
                    <>
                        {/* Task list - Droppable 'root' area */}
                        <div className="tl-items" ref={setRootRef}>
                            {loading && tasks.length === 0 && (
                                <div className="tl-placeholder"><span className="spinner" /> 読み込み中...</div>
                            )}
                            {!loading && parentTasks.length === 0 && debouncedSearch && (
                                <div className="tl-placeholder tl-empty">
                                    <span className="tl-empty-icon"><Search size={48} strokeWidth={1.2} /></span>
                                    <span className="tl-empty-title">「{debouncedSearch}」に一致するタスクはありません</span>
                                </div>
                            )}
                            {!loading && parentTasks.length === 0 && !debouncedSearch && (
                                <div className="tl-placeholder tl-empty">
                                    <span className="tl-empty-icon"><ClipboardList size={48} strokeWidth={1.2} /></span>
                                    <span className="tl-empty-title">タスクはまだありません</span>
                                    <span className="tl-empty-hint">上のフォームからタスクを追加できます</span>
                                </div>
                            )}
                            {!loading && debouncedSearch && tasks.length > 0 && (
                                <div className="tl-search-count">{tasks.length}件の検索結果</div>
                            )}
                            {sortedParentTasks.map((task, i) => (
                                <React.Fragment key={task.id}>
                                    {sortMode === 'manual' && activeId && i === 0 && (
                                        <ReorderGap id="reorder-root-0" />
                                    )}
                                    {sortMode === 'auto' && isDraggingChild && i === 0 && (
                                        <UnnestGap id={`unnest-gap-top`} />
                                    )}
                                    <TaskItem task={task} childTasks={getChildTasks(task.id)}
                                        onStatusChange={handleStatusChange} onDelete={handleDelete}
                                        onTaskAdded={handleTaskAdded} onEdit={setEditingTask}
                                        onTodayToggle={handleTodayToggle}
                                        onArchive={handleArchive} onRestore={handleRestore}
                                        index={i} statusMap={statusMap} allStatuses={allStatuses}
                                        isDraggable={sortMode === 'manual' || getChildTasks(task.id).length === 0}
                                        sortMode={sortMode}
                                        activeId={activeId}
                                        activeDragParentId={activeTaskData?.parent_id}
                                        isProcessing={processingIds.has(task.id)}
                                        processingIds={processingIds}
                                        justCompletedId={justCompletedId}
                                        justDroppedId={justDroppedId}
                                    />
                                    {sortMode === 'manual' && activeId && (
                                        <ReorderGap id={`reorder-root-${i + 1}`} />
                                    )}
                                    {sortMode === 'auto' && isDraggingChild && (
                                        <UnnestGap id={`unnest-gap-${task.id}`} />
                                    )}
                                    {sortMode === 'manual' && isDraggingChild && (
                                        <UnnestGap id={`unnest-gap-${task.id}`} />
                                    )}
                                </React.Fragment>
                            ))}
                            <div style={{ height: '50px' }} />
                        </div>

                        <DragOverlay>
                            {activeTaskData ? (
                                <div className="tc-card dnd-overlay">
                                    <div className="tc-body">
                                        <div className="tc-handle" style={{ opacity: 0.6 }}>
                                            <GripVertical size={14} strokeWidth={2} />
                                        </div>
                                        <div className="tc-info">
                                            <div className="tc-title" style={{ fontWeight: 'bold' }}>{activeTaskData.title}</div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </DragOverlay>
                    </>
                )}

                {editingTask && <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onSaved={handleTaskEdited} />}

                <style jsx global>{`
            .tl-root { min-height: 100px; }

            .tl-search {
              display: flex; align-items: center; gap: 8px;
              padding: 8px 14px; margin-bottom: 10px;
              background: var(--color-surface); border-radius: var(--radius-pill);
              border: 1px solid var(--border-color);
              transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
            }
            .tl-search:focus-within { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-subtle); }
            .tl-search-icon { color: var(--color-text-disabled); flex-shrink: 0; }
            .tl-search-input {
              flex: 1; border: none; outline: none; background: transparent;
              font-size: .86rem; font-family: inherit; color: var(--color-text);
            }
            .tl-search-input::placeholder { color: var(--color-text-disabled); }
            .tl-search-clear {
              background: none; border: none; cursor: pointer;
              color: var(--color-text-muted); font-size: .72rem;
              width: 20px; height: 20px; display: flex; align-items: center;
              justify-content: center; border-radius: var(--radius-pill);
              transition: color var(--duration-fast) var(--ease-out);
            }
            .tl-search-clear:hover { color: var(--color-text); }
            .tl-search-count {
              font-size: 0.72rem; color: var(--color-text-secondary);
              padding: 2px 0; font-weight: 500;
            }
            .tl-toolbar {
              display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
              margin-bottom: 14px; padding: 8px 14px;
              background: var(--color-surface); border-radius: var(--radius-md);
              box-shadow: var(--shadow-card);
            }
            .tl-filter { display: flex; align-items: center; gap: 4px; }
            .tl-filter label {
              font-size: 0.72rem; color: var(--color-text-secondary); font-weight: 500;
              white-space: nowrap;
            }
            .tl-spin { display: inline-block; animation: spin .8s linear infinite; }
            .tl-items { display: flex; flex-direction: column; gap: 6px; }
            .tl-placeholder {
              display: flex; flex-direction: column; align-items: center;
              gap: 8px; padding: 3rem 0 2rem; color: var(--color-text-muted);
            }
            .tl-placeholder.tl-empty::before { display: none; }
            .tl-empty-icon { display: none; }
            .tl-empty-title { font-size: 0.875rem; color: var(--color-text-muted); }
            .tl-empty-hint { font-size: 0.875rem; color: var(--color-text-muted); }

            .tl-unnest-gap {
                position: relative;
                padding: 4px 0;
                transition: padding var(--duration-fast) var(--ease-out);
            }
            .tl-unnest-gap-line {
                height: 2px;
                background: var(--color-accent);
                opacity: 0.2;
                border-radius: var(--radius-pill);
                transition: opacity var(--duration-fast) var(--ease-out);
            }
            .tl-unnest-gap.drag-over {
                padding: 6px 0;
            }
            .tl-unnest-gap.drag-over .tl-unnest-gap-line {
                height: 2px;
                opacity: 1;
            }
            .tl-unnest-gap-label {
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                font-size: 0.65rem;
                font-weight: 500;
                color: var(--color-accent);
                background: var(--color-background);
                padding: 1px 8px;
                border-radius: var(--radius-pill);
                border: 1px solid var(--color-accent);
                white-space: nowrap;
            }

            /* ---- Task Card ---- */
            .tc-card {
              background: var(--color-surface);
              border: none;
              border-radius: var(--radius-md);
              box-shadow: var(--shadow-card);
              overflow: hidden;
              transition: box-shadow var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
              position: relative; touch-action: none;
              padding: 0;
            }
            .tc-card + .tc-card { border-top: none; }
            .tc-card.drag-over {
                box-shadow: 0 0 0 2px var(--color-accent), var(--shadow-card);
                z-index: 10;
            }

            .tc-card.dragging-source {
                opacity: 0.15;
                box-shadow: none;
            }
            .tc-card.dragging-source > * { visibility: hidden; }

            .tc-card.dnd-overlay {
                cursor: grabbing;
                background: var(--color-surface);
                border: none;
                border-radius: var(--radius-md);
                opacity: 0.95;
                box-shadow: var(--shadow-lg);
            }

            @keyframes dropSettle {
                0% { box-shadow: 0 0 0 2px var(--color-accent), var(--shadow-card); }
                100% { box-shadow: var(--shadow-card); }
            }
            .tc-card.drop-settle { animation: dropSettle 0.4s ease; }

            .tc-card:hover { box-shadow: var(--shadow-card-hover); transform: translateY(-1px); }
            .tc-card.done { opacity: 0.35; }
            .tc-card.done:hover { opacity: 0.55; }
            .tc-card.cancelled { opacity: 0.2; filter: grayscale(1); }
            .tc-card.cancelled:hover { opacity: 0.4; filter: grayscale(0.7); }

            .tc-body { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; }
            .tc-handle {
                cursor: grab; color: var(--color-text-disabled);
                display: flex; align-items: center; justify-content: center;
                width: 16px; align-self: stretch;
                opacity: 0; transition: opacity var(--duration-fast) var(--ease-out);
                user-select: none; flex-shrink: 0;
            }
            .tc-card:hover .tc-handle { opacity: 0.4; }
            .tc-handle:hover { opacity: 1 !important; color: var(--color-text-muted); }
            .tc-handle:active { cursor: grabbing; }

            .tc-toggle {
              background: none; border: none; color: var(--color-text-muted); cursor: pointer;
              width: 20px; height: 20px; flex-shrink: 0; display: flex; align-items: center;
              justify-content: center; border-radius: var(--radius-sm); margin-top: 1px;
              transition: color var(--duration-fast) var(--ease-out);
            }
            .tc-toggle:hover { color: var(--color-text); }
            .tc-chev-icon { transition: transform var(--duration-fast) var(--ease-out); }
            .tc-chev-icon.open { transform: rotate(90deg); }

            .tc-info { flex: 1; min-width: 0; cursor: pointer; padding: 1px 4px; border-radius: var(--radius-sm); transition: background var(--duration-fast) var(--ease-out); }
            .tc-info:hover { background: transparent; }
            .tc-parent-label {
              display: block; font-size: 0.72rem; font-weight: 500;
              color: var(--color-text-secondary); margin-bottom: 1px;
            }
            .tc-title-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 3px; }
            .tc-title { font-weight: 500; font-size: 0.875rem; color: var(--color-text); line-height: 1.4; }
            .tc-title.strike { text-decoration: line-through; color: var(--color-text-disabled); }
            .tc-project-badge {
              display: inline-flex; align-items: center; gap: 4px;
              font-size: 0.68rem; font-weight: 500; padding: 2px 8px;
              border-radius: var(--radius-pill);
              background: var(--color-surface-hover); color: var(--color-text-secondary);
              border: none; white-space: nowrap;
            }
            .tc-project-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
            .tc-tag {
              font-size: 0.68rem; font-weight: 500; padding: 2px 8px;
              border-radius: var(--radius-pill);
              background: var(--color-surface-hover); color: var(--color-text-secondary);
              display: inline-flex; align-items: center; gap: 4px;
            }
            .tc-tag-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

            .tc-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 1px; }
            .tc-meta-item {
              font-size: 0.72rem; color: var(--color-text-secondary); display: flex;
              align-items: center; gap: 3px; white-space: nowrap; font-weight: 500;
            }
            .tc-meta-item svg { flex-shrink: 0; }
            .tc-badge { font-size: 0.6rem; font-weight: 500; padding: 0 5px; border-radius: var(--radius-pill); margin-left: 2px; }
            .tc-badge-danger  { background: var(--color-danger-bg); color: var(--color-danger); }
            .tc-badge-warning { background: var(--color-warning-bg); color: var(--color-warning); }
            .tc-badge-info    { background: var(--color-accent-subtle); color: var(--color-accent); }

            .tc-actions { display: flex; gap: 2px; flex-shrink: 0; align-items: center; margin-top: 1px; opacity: 0; transition: opacity var(--duration-fast) var(--ease-out); }
            .tc-card:hover .tc-actions { opacity: 1; }
            .tc-status-select {
              font-weight: 500; font-size: 0.72rem;
              padding: 3px 6px;
              border-radius: var(--radius-pill); cursor: pointer;
              opacity: 1 !important;
            }
            .tc-act-btn {
              background: transparent; border: none;
              color: var(--color-text-disabled); cursor: pointer;
              width: 26px; height: 26px; display: flex; align-items: center;
              justify-content: center; border-radius: var(--radius-pill); transition: color var(--duration-fast) var(--ease-out);
            }
            .tc-act-btn:hover { color: var(--color-text); }
            .tc-act-btn.danger:hover { color: var(--color-danger); }
            .tc-today-btn.active { color: var(--color-accent); }
            .tc-today-btn.active:hover { color: var(--color-accent-hover); }
            .tc-archive-btn:hover { color: #b45309; }
            .tc-restore-btn { opacity: 1 !important; }
            .tc-restore-btn:hover { color: var(--color-accent); }
            .tc-status-label { font-size: 0.72rem; font-weight: 500; white-space: nowrap; }

            .tc-act-btn:disabled { opacity: 0.3; cursor: not-allowed; }
            .tc-status-select:disabled { opacity: 0.3; cursor: not-allowed; }

            /* Archive Tabs */
            .tl-archive-tabs {
              display: inline-flex; gap: 0; margin-bottom: 12px;
              padding: 3px; background: var(--color-surface-hover);
              border-radius: var(--radius-pill);
            }
            .tl-archive-tab {
              padding: 6px 14px; border: none;
              background: transparent; color: var(--color-text-muted);
              font-size: 0.82rem; font-weight: 500;
              cursor: pointer; transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
              font-family: inherit;
              display: flex; align-items: center; gap: 5px;
              border-radius: var(--radius-pill);
            }
            .tl-archive-tab:hover { color: var(--color-text); }
            .tl-archive-tab.active {
              background: var(--color-surface); color: var(--color-text); font-weight: 500;
              box-shadow: var(--shadow-sm);
              border-radius: var(--radius-pill);
            }

            /* Sort mode toggle */
            .tl-sort-toggle {
              padding: 4px 10px; border: 1px solid var(--border-color);
              border-radius: var(--radius-pill); font-size: 0.72rem; font-weight: 500;
              cursor: pointer; transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
              font-family: inherit;
              background: transparent; color: var(--color-text-muted);
              white-space: nowrap;
            }
            .tl-sort-toggle:hover { border-color: var(--border-color-hover); color: var(--color-text); }
            .tl-sort-toggle.active {
              background: var(--color-accent); color: #fff; border-color: var(--color-accent);
            }
            .tl-sort-toggle.active:hover { background: var(--color-accent-hover); }

            .tc-sub-input { padding: 0 16px 12px 36px; }
            .tc-children { margin-left: 28px; padding: 2px 0 6px 0; border-left: 2px solid var(--border-color); }
          `}</style>
            </div>
        </DndContext>
    );
}
