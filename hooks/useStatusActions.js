import { useCallback, useState } from 'react';
import { useDbOperation } from '@/hooks/useDbOperation';
import { autoCompleteAncestors, clearInvalidNextTasks, notifyTasksChanged } from '@/lib/taskHierarchy';

/**
 * ステータス変更・削除・today切替・ルーティン完了に関するアクションを提供するフック。
 * useTaskActions.js から分離。
 *
 * @param {object} deps
 * @param {Function} deps.setTasks - State setter for tasks array (used for optimistic updates)
 * @param {Function} deps.fetchTasks - Function to re-fetch tasks from DB
 * @param {Function} deps.refresh - Function to trigger a refresh (incrementing refreshKey)
 * @returns {object} Status action handlers + processingIds
 */
export function useStatusActions({ setTasks, fetchTasks, refresh }) {

    const dbOp = useDbOperation();

    const [processingIds, setProcessingIds] = useState(new Set());

    const addProcessing = useCallback((id) => {
        setProcessingIds(prev => new Set([...prev, id]));
    }, []);

    const removeProcessing = useCallback((id) => {
        setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, []);

    const handleStatusChange = useCallback(async (taskId, newStatusCode) => {
        addProcessing(taskId);
        const code = parseInt(newStatusCode);
        const completedNow = new Date().toLocaleDateString('sv-SE') + ' ' + new Date().toLocaleTimeString('sv-SE');
        setTasks(prev => prev.map(t => t.id === taskId ? {
            ...t,
            status_code: code,
            completed_at: code === 3 ? completedNow : null
        } : t));
        try {
            await dbOp(async (db) => {
                if (code === 3) {
                    await db.execute("UPDATE tasks SET status_code = $1, completed_at = datetime('now', 'localtime') WHERE id = $2", [newStatusCode, taskId]);
                } else {
                    await db.execute('UPDATE tasks SET status_code = $1, completed_at = NULL WHERE id = $2', [newStatusCode, taskId]);
                }

                // Preserve the opt-in setting; every descendant must be complete.
                if (code === 3) {
                    const completed = new Set(await autoCompleteAncestors(db, taskId));
                    if (completed.size) {
                        setTasks(prev => prev.map(t => completed.has(t.id) ? { ...t, status_code: 3, completed_at: completedNow } : t));
                        window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '子孫タスクがすべて完了したため、親タスクも完了にしました', type: 'success' } }));
                    }
                }
                await clearInvalidNextTasks(db);
                notifyTasksChanged();
            }, { error: 'ステータスの変更に失敗しました' });
        } catch {
            fetchTasks();
        } finally {
            removeProcessing(taskId);
        }
    }, [setTasks, fetchTasks, addProcessing, removeProcessing, dbOp]);

    const handleDelete = useCallback(async (taskId) => {
        if (!confirm('このタスクを削除しますか？')) return;
        try {
            await dbOp(async (db) => {
                await db.execute('UPDATE tasks SET parent_id = NULL WHERE parent_id = $1', [taskId]);
                await db.execute('DELETE FROM tasks WHERE id = $1', [taskId]);
                await clearInvalidNextTasks(db);
                notifyTasksChanged();
            }, { success: 'タスクを削除しました', error: '削除に失敗しました' });
            refresh();
        } catch { /* handled by dbOp */ }
    }, [refresh, dbOp]);

    const handleTodayToggle = useCallback(async (taskId, currentTodayDate) => {
        const today = new Date().toLocaleDateString('sv-SE');
        const newVal = currentTodayDate === today ? null : today;
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, today_date: newVal } : t));
        try {
            await dbOp(async (db) => {
                await db.execute('UPDATE tasks SET today_date = $1 WHERE id = $2', [newVal, taskId]);
                notifyTasksChanged();
            }, { error: '今日やるタスクの変更に失敗しました' });
        } catch {
            fetchTasks();
        }
    }, [setTasks, fetchTasks, dbOp]);

    /**
     * Handles routine completion toggling (for today page).
     * Code 2 (着手中) is UI-only, no DB operation.
     * Code 3 inserts into routine_completions, others delete.
     *
     * @param {string|number} taskId - The unified task id (e.g. "routine_5_2026-03-01")
     * @param {number|string} newStatusCode - The new status code
     * @param {object} params
     * @param {number} params.routineId - The routine's actual DB id
     * @param {string} params.completionDate - The date string (YYYY-MM-DD)
     */
    const handleRoutineStatusChange = useCallback(async (taskId, newStatusCode, { routineId, completionDate }) => {
        const code = parseInt(newStatusCode);
        const completedNow = new Date().toLocaleDateString('sv-SE') + ' ' + new Date().toLocaleTimeString('sv-SE');
        setTasks(prev => prev.map(t => t.id === taskId ? {
            ...t,
            status_code: code,
            completed_at: code === 3 ? completedNow : null
        } : t));
        // 着手中(2)はUI表示のみ、DB操作不要
        if (code === 2) return;
        try {
            await dbOp(async (db) => {
                if (code === 3) {
                    await db.execute('INSERT OR IGNORE INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [routineId, completionDate]);
                } else {
                    await db.execute('DELETE FROM routine_completions WHERE routine_id = $1 AND completion_date = $2', [routineId, completionDate]);
                }
                notifyTasksChanged();
            }, { error: 'ステータスの変更に失敗しました' });
        } catch {
            fetchTasks();
        }
    }, [setTasks, fetchTasks, dbOp]);

    return {
        handleStatusChange,
        handleRoutineStatusChange,
        handleDelete,
        handleTodayToggle,
        processingIds,
    };
}
