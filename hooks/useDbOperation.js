import { useCallback } from 'react';

/**
 * Custom hook that wraps DB operations with try-catch-toast pattern.
 * Reduces boilerplate for the common pattern of:
 *   try { const db = await fetchDb(); ... toast success } catch { console.error; toast error }
 *
 * @param {Function} [notify] - Optional notification function (e.g., settings flash).
 *   Signature: notify(type: 'ok'|'err', message: string)
 *   If not provided, dispatches 'yarukoto:toast' custom events.
 * @returns {Function} dbOp(fn, messages) - Async function to execute DB operations
 */
export function useDbOperation(notify) {
    /**
     * @param {Function} fn - Async function receiving db instance: async (db) => result
     * @param {Object} [messages] - Toast messages
     * @param {string} [messages.success] - Success toast message (omit for no success toast)
     * @param {string|null} [messages.error] - Error toast message (null = silent fail)
     * @returns {*} Return value from fn
     * @throws Re-throws the error after logging and toasting
     */
    const dbOp = useCallback(async (fn, messages = {}) => {
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            const result = await fn(db);
            if (messages.success) {
                if (notify) {
                    notify('ok', messages.success);
                } else {
                    window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                        detail: { message: messages.success, type: 'success' }
                    }));
                }
            }
            return result;
        } catch (e) {
            console.error(e);
            if (messages.error !== undefined && messages.error !== null) {
                if (notify) {
                    notify('err', messages.error);
                } else {
                    window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                        detail: { message: messages.error, type: 'error' }
                    }));
                }
            }
            throw e;
        }
    }, [notify]);

    return dbOp;
}
