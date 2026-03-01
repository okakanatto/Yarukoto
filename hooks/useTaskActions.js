import { useCallback } from 'react';
import { fetchDb } from '@/lib/utils';

/**
 * Custom hook that provides task CRUD operation handlers.
 * Extracted from TaskList.js (Phase 1-2).
 *
 * @param {object} deps
 * @param {Function} deps.setTasks - State setter for tasks array (used for optimistic updates)
 * @param {Function} deps.fetchTasks - Function to re-fetch tasks from DB
 * @param {Function} deps.refresh - Function to trigger a refresh (incrementing refreshKey)
 * @param {Function} deps.getTasks - Function that returns the current tasks array
 * @returns {object} Task action handlers
 */
export function useTaskActions({ setTasks, fetchTasks, refresh, getTasks }) {

    const handleStatusChange = useCallback(async (taskId, newStatusCode) => {
        const completedNow = new Date().toLocaleDateString('sv-SE') + ' ' + new Date().toLocaleTimeString('sv-SE');
        setTasks(prev => prev.map(t => t.id === taskId ? {
            ...t,
            status_code: parseInt(newStatusCode),
            completed_at: parseInt(newStatusCode) === 3 ? completedNow : null
        } : t));
        try {
            const db = await fetchDb();
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
    }, [setTasks, fetchTasks]);

    const handleDelete = useCallback(async (taskId) => {
        if (!confirm('このタスクを削除しますか？')) return;
        try {
            const db = await fetchDb();
            await db.execute('UPDATE tasks SET parent_id = NULL WHERE parent_id = $1', [taskId]);
            await db.execute('DELETE FROM tasks WHERE id = $1', [taskId]);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'タスクを削除しました', type: 'success' } }));
            refresh();
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '削除に失敗しました', type: 'error' } }));
        }
    }, [refresh]);

    const handleTodayToggle = useCallback(async (taskId, currentTodayDate) => {
        const today = new Date().toLocaleDateString('sv-SE');
        const newVal = currentTodayDate === today ? null : today;
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, today_date: newVal } : t));
        try {
            const db = await fetchDb();
            await db.execute('UPDATE tasks SET today_date = $1 WHERE id = $2', [newVal, taskId]);
        } catch (e) { console.error(e); fetchTasks(); }
    }, [setTasks, fetchTasks]);

    const handleArchive = useCallback(async (taskId) => {
        try {
            const db = await fetchDb();
            const tasks = getTasks();
            const task = tasks.find(t => t.id === taskId);
            if (!task) return;

            // Validate: only completed (3) or cancelled (5)
            if (task.status_code !== 3 && task.status_code !== 5) {
                window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '完了またはキャンセル済みのタスクのみアーカイブできます', type: 'error' } }));
                return;
            }

            // Parent check: all children must be completed or cancelled
            if (!task.parent_id) {
                const children = await db.select('SELECT id, status_code FROM tasks WHERE parent_id = $1', [taskId]);
                const hasInProgress = children.some(c => c.status_code !== 3 && c.status_code !== 5);
                if (hasInProgress) {
                    window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '未完了の子タスクがあるためアーカイブできません', type: 'error' } }));
                    return;
                }
            }

            // Use transaction for all-or-nothing parent+children archive
            await db.execute('BEGIN');
            try {
                if (!task.parent_id) {
                    await db.execute("UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE parent_id = $1 AND archived_at IS NULL", [taskId]);
                }
                await db.execute("UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE id = $1", [taskId]);
                await db.execute('COMMIT');
            } catch (txErr) {
                await db.execute('ROLLBACK');
                throw txErr;
            }

            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'アーカイブしました', type: 'success' } }));
            refresh();
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'アーカイブに失敗しました', type: 'error' } }));
        }
    }, [getTasks, refresh]);

    const handleRestore = useCallback(async (taskId) => {
        try {
            const db = await fetchDb();
            const tasks = getTasks();
            const task = tasks.find(t => t.id === taskId);

            // Use transaction for all-or-nothing parent+children restore
            await db.execute('BEGIN');
            try {
                if (task && !task.parent_id) {
                    await db.execute('UPDATE tasks SET archived_at = NULL WHERE parent_id = $1', [taskId]);
                }
                if (task && task.parent_id) {
                    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1', [task.parent_id]);
                }
                await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1', [taskId]);
                await db.execute('COMMIT');
            } catch (txErr) {
                await db.execute('ROLLBACK');
                throw txErr;
            }

            // Descriptive toast for parent-child restore
            let toastMsg = '復元しました';
            if (task && !task.parent_id && tasks.some(t => t.parent_id === taskId)) {
                toastMsg = '親タスクと子タスクをまとめて復元しました';
            } else if (task && task.parent_id) {
                toastMsg = '子タスクと親タスクを復元しました';
            }
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: toastMsg, type: 'success' } }));
            refresh();
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '復元に失敗しました', type: 'error' } }));
        }
    }, [getTasks, refresh]);

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
            const db = await fetchDb();
            if (code === 3) {
                await db.execute('INSERT OR IGNORE INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [routineId, completionDate]);
            } else {
                await db.execute('DELETE FROM routine_completions WHERE routine_id = $1 AND completion_date = $2', [routineId, completionDate]);
            }
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'ステータスの変更に失敗しました', type: 'error' } }));
            fetchTasks();
        }
    }, [setTasks, fetchTasks]);

    return {
        handleStatusChange,
        handleRoutineStatusChange,
        handleDelete,
        handleTodayToggle,
        handleArchive,
        handleRestore,
    };
}
