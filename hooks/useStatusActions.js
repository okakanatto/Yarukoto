import { useCallback, useState } from 'react';
import { useDbOperation } from '@/hooks/useDbOperation';

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

                // ENH-5: Auto-complete parent when all children are complete
                if (code === 3) {
                    const settingRows = await db.select("SELECT value FROM app_settings WHERE key = 'auto_complete_parent'");
                    const enabled = settingRows[0]?.value === '1';
                    if (enabled) {
                        const taskRows = await db.select('SELECT parent_id FROM tasks WHERE id = $1', [taskId]);
                        const parentId = taskRows[0]?.parent_id;
                        if (parentId) {
                            const siblings = await db.select('SELECT id, status_code FROM tasks WHERE parent_id = $1', [parentId]);
                            const allComplete = siblings.every(s => s.id === taskId ? true : s.status_code === 3);
                            if (allComplete) {
                                const parentRows = await db.select('SELECT status_code FROM tasks WHERE id = $1', [parentId]);
                                if (parentRows[0] && parentRows[0].status_code !== 3 && parentRows[0].status_code !== 5) {
                                    await db.execute("UPDATE tasks SET status_code = 3, completed_at = datetime('now', 'localtime') WHERE id = $1", [parentId]);
                                    setTasks(prev => prev.map(t => t.id === parentId ? {
                                        ...t,
                                        status_code: 3,
                                        completed_at: completedNow
                                    } : t));
                                    window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '子タスクがすべて完了したため、親タスクも完了にしました', type: 'success' } }));
                                }
                            }
                        }
                    }
                }
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
