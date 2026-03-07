import { useCallback, useState } from 'react';
import { useDbOperation } from '@/hooks/useDbOperation';

/**
 * アーカイブ・復元に関するアクションを提供するフック。
 * useTaskActions.js から分離。
 *
 * @param {object} deps
 * @param {Function} deps.setTasks - State setter for tasks array (used for optimistic updates)
 * @param {Function} deps.fetchTasks - Function to re-fetch tasks from DB
 * @param {Function} deps.getTasks - Function that returns the current tasks array
 * @returns {object} Archive action handlers + processingIds
 */
export function useArchiveActions({ setTasks, fetchTasks, getTasks }) {

    const dbOp = useDbOperation();

    const [processingIds, setProcessingIds] = useState(new Set());

    const addProcessing = useCallback((id) => {
        setProcessingIds(prev => new Set([...prev, id]));
    }, []);

    const removeProcessing = useCallback((id) => {
        setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, []);

    const handleArchive = useCallback(async (taskId) => {
        const tasks = getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // Validate: only completed (3) or cancelled (5)
        if (task.status_code !== 3 && task.status_code !== 5) {
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '完了またはキャンセル済みのタスクのみアーカイブできます', type: 'error' } }));
            return;
        }

        addProcessing(taskId);

        // Optimistic update: remove task (and children if parent) from current view
        setTasks(prev => prev.filter(t => {
            if (t.id === taskId) return false;
            if (!task.parent_id && t.parent_id === taskId) return false;
            return true;
        }));

        try {
            await dbOp(async (db) => {
                // Parent check: all children must be completed or cancelled
                if (!task.parent_id) {
                    const children = await db.select('SELECT id, status_code FROM tasks WHERE parent_id = $1', [taskId]);
                    const hasInProgress = children.some(c => c.status_code !== 3 && c.status_code !== 5);
                    if (hasInProgress) {
                        window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '未完了の子タスクがあるためアーカイブできません', type: 'error' } }));
                        fetchTasks();
                        return;
                    }
                }

                // Archive parent + children in a single atomic statement (avoids manual transaction issues with connection pool)
                if (!task.parent_id) {
                    await db.execute("UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE (id = $1 OR parent_id = $1) AND archived_at IS NULL", [taskId]);
                } else {
                    await db.execute("UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE id = $1", [taskId]);
                }

                window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'アーカイブしました', type: 'success' } }));
            }, { error: 'アーカイブに失敗しました' });
        } catch {
            fetchTasks();
        } finally {
            removeProcessing(taskId);
        }
    }, [getTasks, setTasks, fetchTasks, addProcessing, removeProcessing, dbOp]);

    const handleRestore = useCallback(async (taskId) => {
        const tasks = getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        addProcessing(taskId);

        // Optimistic update: remove affected tasks from archived view
        setTasks(prev => prev.filter(t => {
            if (t.id === taskId) return false;
            // Parent: also remove children
            if (task && !task.parent_id && t.parent_id === taskId) return false;
            // Child: also remove parent
            if (task && task.parent_id && t.id === task.parent_id) return false;
            return true;
        }));

        try {
            await dbOp(async (db) => {
                // Restore parent + children or child + parent in single atomic statements
                if (task && !task.parent_id) {
                    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1 OR parent_id = $1', [taskId]);
                } else if (task && task.parent_id) {
                    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1 OR id = $2', [taskId, task.parent_id]);
                } else {
                    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1', [taskId]);
                }

                // Descriptive toast for parent-child restore
                let toastMsg = '復元しました';
                if (task && !task.parent_id && tasks.some(t => t.parent_id === taskId)) {
                    toastMsg = '親タスクと子タスクをまとめて復元しました';
                } else if (task && task.parent_id) {
                    toastMsg = '子タスクと親タスクを復元しました';
                }
                window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: toastMsg, type: 'success' } }));
            }, { error: '復元に失敗しました' });
        } catch {
            fetchTasks();
        } finally {
            removeProcessing(taskId);
        }
    }, [getTasks, setTasks, fetchTasks, addProcessing, removeProcessing, dbOp]);

    return {
        handleArchive,
        handleRestore,
        processingIds,
    };
}
