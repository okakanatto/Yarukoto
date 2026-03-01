import { useState, useCallback } from 'react';
import { fetchDb } from '@/lib/utils';

/**
 * Custom hook that manages Drag & Drop logic for TaskList.
 * Handles nesting, un-nesting, and manual reordering of tasks.
 * Extracted from TaskList.js (Phase 1-3).
 *
 * @param {object} deps
 * @param {Array} deps.tasks - Current tasks array
 * @param {Function} deps.setTasks - State setter for tasks array
 * @param {Function} deps.fetchTasks - Function to re-fetch tasks from DB
 * @param {string} deps.sortMode - Current sort mode ('auto' or 'manual')
 * @param {Function} deps.getSortedParentTasks - Returns sorted parent tasks for reorder index calculation
 * @param {Function} deps.getChildTasks - Returns child tasks for a given parent ID
 * @returns {object} DnD state and handlers
 */
export function useTaskDnD({ tasks, setTasks, fetchTasks, sortMode, getSortedParentTasks, getChildTasks }) {
    const [activeId, setActiveId] = useState(null);

    const activeTaskData = activeId ? tasks.find(t => t.id === activeId) : null;
    const isDraggingChild = activeTaskData?.parent_id != null;

    const handleDragStart = useCallback((event) => {
        setActiveId(event.active.id);
    }, []);

    // Helper to persist sort_order for a list of task IDs
    const persistSortOrder = useCallback(async (orderedIds, parentId = null) => {
        try {
            const db = await fetchDb();

            const query = parentId != null
                ? 'SELECT id FROM tasks WHERE parent_id = $1 AND archived_at IS NULL ORDER BY sort_order ASC, id ASC'
                : 'SELECT id FROM tasks WHERE parent_id IS NULL AND archived_at IS NULL ORDER BY sort_order ASC, id ASC';
            const params = parentId != null ? [parentId] : [];
            const rows = await db.select(query, params);
            let allIds = rows.map(r => r.id);

            for (const id of orderedIds) {
                if (!allIds.includes(id)) {
                    allIds.push(id);
                }
            }

            const positions = [];
            for (const id of allIds) {
                if (orderedIds.includes(id)) {
                    positions.push(allIds.indexOf(id));
                }
            }

            for (let i = 0; i < positions.length; i++) {
                allIds[positions[i]] = orderedIds[i];
            }

            for (let i = 0; i < allIds.length; i++) {
                await db.execute('UPDATE tasks SET sort_order = $1 WHERE id = $2', [i + 1, allIds[i]]);
            }
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '並び替えの保存に失敗しました', type: 'error' } }));
            fetchTasks();
        }
    }, [fetchTasks]);

    // Handle DnD reorder (manual sort mode)
    const handleReorder = useCallback(async (activeTaskId, overId) => {
        const overIdStr = String(overId);
        const activeTask = tasks.find(t => t.id === activeTaskId);
        if (!activeTask) return;

        let siblings, targetIndex, isRoot, parentId = null;

        if (overIdStr.startsWith('reorder-root-')) {
            targetIndex = parseInt(overIdStr.replace('reorder-root-', ''));
            siblings = getSortedParentTasks();
            isRoot = true;
        } else if (overIdStr.startsWith('reorder-child-')) {
            const parts = overIdStr.replace('reorder-child-', '').split('-');
            parentId = parseInt(parts[0]);
            targetIndex = parseInt(parts[1]);
            siblings = getChildTasks(parentId);
            isRoot = false;
        } else {
            return;
        }

        // Check if this is an unnest (child task dropped at root level)
        const isUnnest = activeTask.parent_id && isRoot;

        const currentOrder = siblings.map(t => t.id);
        const oldIndex = currentOrder.indexOf(activeTaskId);

        // Remove from current position if present
        if (oldIndex >= 0) {
            currentOrder.splice(oldIndex, 1);
            if (oldIndex < targetIndex) targetIndex--;
        }

        // Insert at target position
        currentOrder.splice(targetIndex, 0, activeTaskId);

        // Optimistic UI update
        setTasks(prev => {
            let updated = [...prev];
            if (isUnnest) {
                updated = updated.map(t => t.id === activeTaskId ? { ...t, parent_id: null } : t);
            }
            currentOrder.forEach((id, i) => {
                const idx = updated.findIndex(t => t.id === id);
                if (idx >= 0) updated[idx] = { ...updated[idx], sort_order: i + 1 };
            });
            return updated;
        });

        // Persist to DB
        try {
            const db = await fetchDb();
            if (isUnnest) {
                await db.execute('UPDATE tasks SET parent_id = NULL WHERE id = $1', [activeTaskId]);
            }
            await persistSortOrder(currentOrder, isRoot ? null : parentId);
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '並び替えの保存に失敗しました', type: 'error' } }));
            fetchTasks();
        }
    }, [tasks, setTasks, fetchTasks, getSortedParentTasks, getChildTasks, persistSortOrder]);

    const handleDragEnd = useCallback(async (event) => {
        const { active, over } = event;
        setActiveId(null);

        const activeTask = tasks.find(t => t.id === active.id);
        if (!activeTask) return;

        // Helper: un-nest a child task back to root
        const unnest = async () => {
            setTasks(prev => prev.map(t => t.id === active.id ? { ...t, parent_id: null } : t));
            try {
                const db = await fetchDb();
                await db.execute('UPDATE tasks SET parent_id = NULL WHERE id = $1', [active.id]);
                // In manual mode, assign sort_order at the end of root tasks
                if (sortMode === 'manual') {
                    const maxSort = await db.select('SELECT MAX(sort_order) as ms FROM tasks WHERE parent_id IS NULL AND archived_at IS NULL');
                    const newOrder = (maxSort[0]?.ms || 0) + 1;
                    await db.execute('UPDATE tasks SET sort_order = $1 WHERE id = $2', [newOrder, active.id]);
                    fetchTasks();
                }
            } catch (e) {
                console.error(e);
                window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '並び替えの処理に失敗しました', type: 'error' } }));
                fetchTasks();
            }
        };

        // REORDER: Dropped on a reorder gap (manual sort mode)
        if (over && String(over.id).startsWith('reorder-')) {
            await handleReorder(active.id, over.id);
            return;
        }

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
            const db = await fetchDb();
            await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [parentTask.id, active.id]);

            // In manual mode, assign sort_order at end of new parent's children
            if (sortMode === 'manual') {
                const maxSort = await db.select(
                    'SELECT MAX(sort_order) as ms FROM tasks WHERE parent_id = $1 AND archived_at IS NULL',
                    [parentTask.id]
                );
                const newOrder = (maxSort[0]?.ms || 0) + 1;
                await db.execute('UPDATE tasks SET sort_order = $1 WHERE id = $2', [newOrder, active.id]);
            }

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
                        fetchTasks();
                        return;
                    }
                }
            } catch (tagErr) {
                console.error('Tag inheritance error:', tagErr);
            }
            fetchTasks();
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '並び替えの保存に失敗しました', type: 'error' } }));
            fetchTasks();
        }
    }, [tasks, setTasks, fetchTasks, sortMode, handleReorder]);

    return {
        activeId,
        activeTaskData,
        isDraggingChild,
        handleDragStart,
        handleDragEnd,
    };
}
