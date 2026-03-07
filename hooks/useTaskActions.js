import { useMemo } from 'react';
import { useStatusActions } from '@/hooks/useStatusActions';
import { useArchiveActions } from '@/hooks/useArchiveActions';

/**
 * ファサードフック: useStatusActions + useArchiveActions を統合して返す。
 * 既存の呼び出し元（TaskList.js, today/page.js 等）は変更不要。
 *
 * @param {object} deps
 * @param {Function} deps.setTasks - State setter for tasks array (used for optimistic updates)
 * @param {Function} deps.fetchTasks - Function to re-fetch tasks from DB
 * @param {Function} deps.refresh - Function to trigger a refresh (incrementing refreshKey)
 * @param {Function} deps.getTasks - Function that returns the current tasks array
 * @returns {object} Task action handlers
 */
export function useTaskActions(deps) {
    const statusActions = useStatusActions(deps);
    const archiveActions = useArchiveActions(deps);

    // Merge processingIds from both hooks
    const processingIds = useMemo(() => {
        return new Set([...statusActions.processingIds, ...archiveActions.processingIds]);
    }, [statusActions.processingIds, archiveActions.processingIds]);

    return {
        ...statusActions,
        ...archiveActions,
        processingIds,
    };
}
