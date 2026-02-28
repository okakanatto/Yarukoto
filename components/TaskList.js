'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, useDraggable, useDroppable, closestCorners } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import TaskInput from './TaskInput';
import TaskEditModal from './TaskEditModal';
import StatusCheckbox from './StatusCheckbox';
import { useMasterData } from '../hooks/useMasterData';
import MultiSelectFilter from './MultiSelectFilter';

const SORT_OPTIONS = [
    { key: 'created_desc', label: '作成日（新しい順）' },
    { key: 'created_asc', label: '作成日（古い順）' },
    { key: 'due_asc', label: '期限日（近い順）' },
    { key: 'due_desc', label: '期限日（遠い順）' },
    { key: 'importance', label: '重要度（高い順）' },
    { key: 'urgency', label: '緊急度（高い順）' },
    { key: 'title', label: 'タイトル（あいう順）' },
    { key: 'status', label: 'ステータス順' },
    { key: 'tag', label: 'タグ順' },
];

export default function TaskList() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatuses, setFilterStatuses] = useState([]);
    const [filterTags, setFilterTags] = useState([]);
    const [filterImportance, setFilterImportance] = useState([]);
    const [filterUrgency, setFilterUrgency] = useState([]);
    const [sortKey, setSortKey] = useState('created_desc');
    const [refreshKey, setRefreshKey] = useState(0);
    const [editingTask, setEditingTask] = useState(null);
    const [activeId, setActiveId] = useState(null); // For DragOverlay

    const activeRequestId = useRef(0);
    const { masters, tags: allTags } = useMasterData();
    const allStatuses = useMemo(() => masters.status || [], [masters.status]);
    const allImportance = useMemo(() => masters.importance || [], [masters.importance]);
    const allUrgency = useMemo(() => masters.urgency || [], [masters.urgency]);

    const statusOptions = useMemo(() => allStatuses.map(s => ({ value: s.code, label: s.label, color: s.color })), [allStatuses]);
    const tagOptions = useMemo(() => allTags.filter(t => !t.archived).map(t => ({ value: t.id, label: t.name, color: t.color })), [allTags]);
    const importanceOptions = useMemo(() => allImportance.map(i => ({ value: i.level, label: i.label, color: i.color })), [allImportance]);
    const urgencyOptions = useMemo(() => allUrgency.map(u => ({ value: u.level, label: u.label, color: u.color })), [allUrgency]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Drop zone for un-nesting (making a task root)
    const { setNodeRef: setRootRef } = useDroppable({ id: 'root' });

    const fetchTasks = useCallback(async () => {
        const currentReq = ++activeRequestId.current;
        setLoading(true);
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();

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
                tags: JSON.parse(task.tag_ids || '[]').map((id, index) => ({
                    id,
                    name: JSON.parse(task.tag_names || '[]')[index],
                    color: JSON.parse(task.tag_colors || '[]')[index]
                })).filter(t => t.id)
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
    }, [filterStatuses, filterTags, filterImportance, filterUrgency]);

    useEffect(() => { fetchTasks(); }, [fetchTasks, refreshKey]);

    const handleTaskAdded = () => setRefreshKey(k => k + 1);
    const handleTaskEdited = () => setRefreshKey(k => k + 1);

    const handleStatusChange = async (taskId, newStatusCode) => {
        const completedNow = new Date().toLocaleDateString('sv-SE') + ' ' + new Date().toLocaleTimeString('sv-SE');
        setTasks(prev => prev.map(t => t.id === taskId ? {
            ...t,
            status_code: parseInt(newStatusCode),
            completed_at: parseInt(newStatusCode) === 3 ? completedNow : null
        } : t));
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            if (parseInt(newStatusCode) === 3) {
                await db.execute("UPDATE tasks SET status_code = $1, completed_at = datetime('now', 'localtime') WHERE id = $2", [newStatusCode, taskId]);
            } else {
                await db.execute('UPDATE tasks SET status_code = $1, completed_at = NULL WHERE id = $2', [newStatusCode, taskId]);
            }
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'ステータスの変更に失敗しました', type: 'error' } }));
            fetchTasks();
        }
    };

    const handleDelete = async (taskId) => {
        if (!confirm('このタスクを削除しますか？')) return;
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            // BUG-4: 削除前に子タスクの parent_id を NULL 化して独立させる
            await db.execute('UPDATE tasks SET parent_id = NULL WHERE parent_id = $1', [taskId]);
            await db.execute('DELETE FROM tasks WHERE id = $1', [taskId]);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'タスクを削除しました', type: 'success' } }));
            setRefreshKey(k => k + 1);
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '削除に失敗しました', type: 'error' } }));
        }
    };

    const handleTodayToggle = async (taskId, currentTodayDate) => {
        const today = new Date().toLocaleDateString('sv-SE');
        const newVal = currentTodayDate === today ? null : today;
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, today_date: newVal } : t));
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            await db.execute('UPDATE tasks SET today_date = $1 WHERE id = $2', [newVal, taskId]);
        } catch (e) { console.error(e); fetchTasks(); }
    };

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);

        const activeTask = tasks.find(t => t.id === active.id);
        if (!activeTask) return;

        // Helper: un-nest a child task back to root
        const unnest = async () => {
            setTasks(prev => prev.map(t => t.id === active.id ? { ...t, parent_id: null } : t));
            try {
                const { getDb } = await import('@/lib/db');
                const db = await getDb();
                await db.execute('UPDATE tasks SET parent_id = NULL WHERE id = $1', [active.id]);
            } catch (e) { console.error(e); fetchTasks(); }
        };

        // If a child task is dropped with no target (outside any droppable), un-nest
        if (!over) {
            if (activeTask.parent_id) await unnest();
            return;
        }

        // UN-NEST: Dropped on root container, unnest gap zones
        const isUnnestZone = over.id === 'root' || String(over.id).startsWith('unnest-gap-');
        if (isUnnestZone) {
            if (!activeTask.parent_id) return; // Already root
            await unnest();
            return;
        }

        // NEST: Dropped on another task
        if (active.id === over.id) return;

        const parentTask = tasks.find(t => t.id === over.id);
        if (!parentTask) return;

        // If child is dropped on another child, ignore
        if (parentTask.parent_id) return;
        // Validation: Task with children cannot become child
        const activeChildren = tasks.filter(t => t.parent_id === active.id);
        if (activeChildren.length > 0) {
            alert('子タスクを持つタスクは、他のタスクの子タスクにできません。');
            return;
        }

        // Optimistic update
        setTasks(prev => prev.map(t => t.id === active.id ? { ...t, parent_id: parentTask.id } : t));

        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [parentTask.id, active.id]);

            // Tag inheritance: copy parent tags to child if setting enabled
            try {
                const settingRows = await db.select(
                    "SELECT value FROM app_settings WHERE key = 'inherit_parent_tags'"
                );
                if (settingRows.length > 0 && settingRows[0].value === '1') {
                    const parentTags = await db.select(
                        'SELECT tag_id FROM task_tags WHERE task_id = $1',
                        [parentTask.id]
                    );
                    let tagsAdded = false;
                    for (const row of parentTags) {
                        await db.execute(
                            'INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1, $2)',
                            [active.id, row.tag_id]
                        );
                        tagsAdded = true;
                    }
                    if (tagsAdded) {
                        fetchTasks(); // Refresh to show inherited tags
                    }
                }
            } catch (tagErr) {
                console.error('Tag inheritance error:', tagErr);
            }
        } catch (e) {
            console.error(e);
            fetchTasks(); // Revert on error
        }
    };

    const parentTasks = useMemo(() => tasks.filter(t => !t.parent_id || !tasks.some(p => p.id === t.parent_id)), [tasks]);
    const getChildTasks = (parentId) => {
        return tasks.filter(t => t.parent_id === parentId).sort((a, b) => {
            if (!a.due_date && !b.due_date) return new Date(a.created_at) - new Date(b.created_at);
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
        });
    };

    const sortedParentTasks = useMemo(() => {
        const sorted = [...parentTasks];
        switch (sortKey) {
            case 'created_desc': sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
            case 'created_asc': sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
            case 'due_asc': sorted.sort((a, b) => { if (!a.due_date) return 1; if (!b.due_date) return -1; return new Date(a.due_date) - new Date(b.due_date); }); break;
            case 'due_desc': sorted.sort((a, b) => { if (!a.due_date) return 1; if (!b.due_date) return -1; return new Date(b.due_date) - new Date(a.due_date); }); break;
            case 'importance': sorted.sort((a, b) => (b.importance_level || 0) - (a.importance_level || 0)); break;
            case 'urgency': sorted.sort((a, b) => (b.urgency_level || 0) - (a.urgency_level || 0)); break;
            case 'title': sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja')); break;
            case 'status': sorted.sort((a, b) => {
                const aOrder = allStatuses.find(s => s.code === a.status_code)?.sort_order || 0;
                const bOrder = allStatuses.find(s => s.code === b.status_code)?.sort_order || 0;
                return aOrder - bOrder;
            }); break;
            case 'tag': sorted.sort((a, b) => {
                const aTag = a.tags && a.tags.length > 0 ? a.tags[0].name : '\uFFFF'; // Push untagged to bottom
                const bTag = b.tags && b.tags.length > 0 ? b.tags[0].name : '\uFFFF';
                return aTag.localeCompare(bTag, 'ja');
            }); break;
        }
        return sorted;
    }, [parentTasks, sortKey, allStatuses]);

    const statusMap = useMemo(() => {
        const m = {};
        allStatuses.forEach(s => { m[s.code] = { label: s.label, color: s.color }; });
        return m;
    }, [allStatuses]);

    const activeTaskData = activeId ? tasks.find(t => t.id === activeId) : null;
    const isDraggingChild = activeTaskData?.parent_id != null;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="tl-root">
                {/* Toolbar */}
                <div className="tl-toolbar">
                    <MultiSelectFilter label="ステータス" options={statusOptions} selected={filterStatuses} onChange={setFilterStatuses} />
                    {tagOptions.length > 0 && <MultiSelectFilter label="タグ" options={tagOptions} selected={filterTags} onChange={setFilterTags} />}
                    <MultiSelectFilter label="重要度" options={importanceOptions} selected={filterImportance} onChange={setFilterImportance} />
                    <MultiSelectFilter label="緊急度" options={urgencyOptions} selected={filterUrgency} onChange={setFilterUrgency} />
                    <div className="tl-filter" style={{ marginLeft: 'auto' }}>
                        <label>並び順</label>
                        <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
                            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Task list - Droppable 'root' area */}
                <div className="tl-items" ref={setRootRef}>
                    {loading && tasks.length === 0 && (
                        <div className="tl-placeholder"><span className="spinner" /> 読み込み中...</div>
                    )}
                    {!loading && parentTasks.length === 0 && (
                        <div className="tl-placeholder tl-empty">
                            <span className="tl-empty-icon">🌱</span>
                            <span className="tl-empty-title">最初のタスクを追加して、今日をスタートしましょう！</span>
                            <span className="tl-empty-hint">上のフォームからタスクを追加できます</span>
                        </div>
                    )}
                    {sortedParentTasks.map((task, i) => (
                        <React.Fragment key={task.id}>
                            {isDraggingChild && i === 0 && (
                                <UnnestGap id={`unnest-gap-top`} />
                            )}
                            <TaskItem task={task} childTasks={getChildTasks(task.id)}
                                onStatusChange={handleStatusChange} onDelete={handleDelete}
                                onTaskAdded={handleTaskAdded} onEdit={setEditingTask}
                                onTodayToggle={handleTodayToggle}
                                index={i} statusMap={statusMap} allStatuses={allStatuses}
                                isDraggable={getChildTasks(task.id).length === 0}
                            />
                            {isDraggingChild && (
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
            .tc-meta-item { font-size:.76rem; color:var(--color-text-muted); display:flex; align-items:center; gap:.2rem; white-space:nowrap; }
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
    
            .tc-sub-input { padding:0 1rem .85rem 2.75rem; animation:fadeSlideIn .3s ease; }
            .tc-children { margin-left:2.25rem; padding:.2rem .75rem .6rem 0; border-left:2px solid var(--border-color); }
          `}</style>
            </div>
        </DndContext>
    );
}

function UnnestGap({ id }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`tl-unnest-gap ${isOver ? 'drag-over' : ''}`}
        >
            <div className="tl-unnest-gap-line" />
            {isOver && <span className="tl-unnest-gap-label">ここにドロップして親タスクに戻す</span>}
        </div>
    );
}

function TaskItem({ task, childTasks, onStatusChange, onDelete, onTaskAdded, onEdit, onTodayToggle, index = 0, isChild = false, statusMap = {}, allStatuses = [], isDraggable = true }) {
    const [expanded, setExpanded] = useState(true);
    const [showSub, setShowSub] = useState(false);

    // Draggable Hook
    const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
        id: task.id,
        disabled: !isDraggable // Only disabled if parent has children (isDraggable=false for parents with children)
    });

    // Droppable Hook (Target for nesting)
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: task.id,
        disabled: isChild // Cannot nest under a child (max depth 1)
    });

    // Merge refs
    const setNodeRef = (node) => {
        setDragRef(node);
        setDropRef(node);
    };

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 'auto',
    } : undefined;

    const dueMeta = (() => {
        if (!task.due_date) return {};
        const due = new Date(task.due_date + 'T00:00:00');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        if (due < today) return { color: 'var(--color-danger)', badge: '期限切れ', cls: 'tc-badge-danger' };
        if (due.getTime() === today.getTime()) return { color: 'var(--color-warning)', badge: '本日', cls: 'tc-badge-warning' };
        if (due.getTime() === tomorrow.getTime()) return { color: 'var(--color-primary)', badge: '明日', cls: 'tc-badge-info' };
        return {};
    })();

    const st = statusMap[task.status_code] || { label: task.status_label || '不明', color: '#94a3b8' };
    const isDone = task.status_code === 3;
    const isCancelled = task.status_code === 5;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`tc-card ${isDone ? 'done' : ''} ${isCancelled ? 'cancelled' : ''} ${isOver && !isDragging ? 'drag-over' : ''}`}
        >
            <div className="tc-body">
                {/* Drag Handle */}
                {isDraggable && (
                    <div className="tc-handle" {...attributes} {...listeners} title={isChild ? 'ドラッグして親から外す' : 'ドラッグして他のタスクの子にする'}>
                        ⋮⋮
                    </div>
                )}

                <StatusCheckbox
                    statusCode={task.status_code}
                    onChange={(newCode) => onStatusChange(task.id, newCode)}
                />

                {childTasks.length > 0 && (
                    <button className="tc-toggle" onClick={() => setExpanded(!expanded)}>
                        <span className={`tc-chev ${expanded ? 'open' : ''}`}>›</span>
                    </button>
                )}

                <div className="tc-info" onClick={() => onEdit(task)} title="クリックして編集">
                    {!isChild && task.parent_id && task.parent_title && (
                        <span className="tc-parent-label" style={{ display: 'block', fontSize: '0.7rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '0.15rem', letterSpacing: '0.01em' }}>📌 {task.parent_title} ›</span>
                    )}
                    <div className="tc-title-row">
                        <span className={`tc-title ${isDone || isCancelled ? 'strike' : ''}`}>{task.title}</span>
                        {task.tags && task.tags.map(t => <span key={t.id} className="tc-tag" style={{ backgroundColor: t.color }}>{t.name}</span>)}
                    </div>
                    <div className="tc-meta">
                        {isDone && task.completed_at && <span className="tc-meta-item">☑ 完了: {task.completed_at.split(' ')[0]}</span>}
                        {task.start_date && !isDone && <span className="tc-meta-item">🟢 開始: {task.start_date}</span>}
                        {task.due_date && !isDone && (
                            <span className="tc-meta-item" style={{ color: dueMeta.color || 'inherit' }}>
                                📅 期限: {task.due_date}{dueMeta.badge && <span className={`tc-badge ${dueMeta.cls}`}>{dueMeta.badge}</span>}
                            </span>
                        )}
                        {task.importance_label && (
                            <span className="tc-meta-item"><span className="tc-dot" style={{ backgroundColor: task.importance_color }} /> 重要度: {task.importance_label}</span>
                        )}
                        {task.urgency_label && (
                            <span className="tc-meta-item"><span className="tc-dot" style={{ backgroundColor: task.urgency_color }} /> 緊急度: {task.urgency_label}</span>
                        )}
                        {task.estimated_hours > 0 && <span className="tc-meta-item">⏱ {task.estimated_hours >= 60 ? `${Math.floor(task.estimated_hours / 60)}h${task.estimated_hours % 60 ? ` ${task.estimated_hours % 60}分` : ''}` : `${task.estimated_hours}分`}</span>}
                        {task.notes?.trim() && <span className="tc-meta-item" title={task.notes}>📝 メモ</span>}
                    </div>
                </div>

                <div className="tc-actions">
                    <select value={task.status_code} onChange={e => onStatusChange(task.id, e.target.value)} className="tc-status-select"
                        style={{ borderColor: st.color, color: st.color, background: `${st.color}10` }}>
                        {allStatuses.length > 0 ? allStatuses.map(s => <option key={s.code} value={s.code}>{s.label}</option>) : <option value={task.status_code}>{st.label}</option>}
                    </select>
                    {onTodayToggle && (
                        <button
                            className={`tc-act-btn tc-today-btn ${task.today_date === new Date().toLocaleDateString('sv-SE') ? 'active' : ''}`}
                            onClick={() => onTodayToggle(task.id, task.today_date)}
                            title={task.today_date === new Date().toLocaleDateString('sv-SE') ? '今日やるから外す' : '今日やるタスクに追加'}
                        >☀️</button>
                    )}
                    {!isChild && <button className="tc-act-btn" onClick={() => setShowSub(!showSub)} title="子タスク追加">＋</button>}
                    <button className="tc-act-btn danger" onClick={() => onDelete(task.id)} title="削除">🗑</button>
                </div>
            </div>

            {showSub && <div className="tc-sub-input"><TaskInput onTaskAdded={() => { onTaskAdded(); setShowSub(false); }} predefinedParentId={task.id} /></div>}

            {expanded && childTasks.length > 0 && (
                <div className="tc-children">
                    {childTasks.map((c, i) => (
                        <TaskItem key={c.id} task={c} childTasks={[]} onStatusChange={onStatusChange}
                            onDelete={onDelete} onTaskAdded={() => { }} onEdit={onEdit}
                            onTodayToggle={onTodayToggle}
                            index={i} isChild statusMap={statusMap} allStatuses={allStatuses}
                            isDraggable={true} // Children can be dragged to un-nest
                        />
                    ))}
                </div>
            )}
        </div>
    );
}


