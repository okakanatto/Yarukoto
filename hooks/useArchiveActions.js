import { useCallback, useState } from 'react';
import { useDbOperation } from '@/hooks/useDbOperation';
import { archiveSubtree, restoreTaskTree, notifyTasksChanged } from '@/lib/taskHierarchy';

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

        try {
            await dbOp(async (db) => {
                const affected = new Set(await archiveSubtree(db, taskId));
                setTasks(prev => prev.filter(t => !affected.has(t.id)));
                notifyTasksChanged();
                window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'アーカイブしました', type: 'success' } }));
            }, { error: null });
        } catch (error) {
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: {
                message: error.message?.startsWith('未完了') ? error.message : 'アーカイブに失敗しました', type: 'error'
            } }));
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

        try {
            await dbOp(async (db) => {
                const affected = new Set(await restoreTaskTree(db, taskId));
                setTasks(prev => prev.filter(t => !affected.has(t.id)));
                notifyTasksChanged();

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
