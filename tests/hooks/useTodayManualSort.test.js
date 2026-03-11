/**
 * BUG-13 regression tests: useTodayTasks manual sort logic
 *
 * BUG-13: In manual sort mode, completing a task caused it to jump to the
 * end because the secondary sort used status_code (completed tasks sorted last).
 * Fix: Secondary sort uses task ID (stable value) instead of status_code.
 *
 * These tests verify the manual sort comparator extracted from useTodayTasks.
 */
import { describe, it, expect } from 'vitest';

/**
 * Manual sort comparator (mirrors the sortMode === 'manual' branch in useTodayTasks).
 */
function manualSortComparator(a, b) {
    const orderDiff = (a.today_sort_order || 0) - (b.today_sort_order || 0);
    if (orderDiff !== 0) return orderDiff;
    if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

function manualSort(tasks) {
    return [...tasks].sort(manualSortComparator);
}

describe('BUG-13: manual sort stability', () => {
    it('sorts by today_sort_order as primary key', () => {
        const tasks = [
            { id: 3, today_sort_order: 2, status_code: 1 },
            { id: 1, today_sort_order: 0, status_code: 1 },
            { id: 2, today_sort_order: 1, status_code: 1 },
        ];
        const sorted = manualSort(tasks);
        expect(sorted.map(t => t.id)).toEqual([1, 2, 3]);
    });

    it('uses ID as tie-breaker when today_sort_order is equal', () => {
        const tasks = [
            { id: 5, today_sort_order: 0, status_code: 1 },
            { id: 2, today_sort_order: 0, status_code: 1 },
            { id: 8, today_sort_order: 0, status_code: 2 },
        ];
        const sorted = manualSort(tasks);
        expect(sorted.map(t => t.id)).toEqual([2, 5, 8]);
    });

    it('completing a task does NOT change its position (BUG-13 core fix)', () => {
        const tasksBefore = [
            { id: 1, today_sort_order: 0, status_code: 1 },
            { id: 2, today_sort_order: 0, status_code: 1 },
            { id: 3, today_sort_order: 0, status_code: 2 },
        ];
        const orderBefore = manualSort(tasksBefore).map(t => t.id);

        // Simulate completing task id=1 (status_code 1 → 3)
        const tasksAfter = tasksBefore.map(t =>
            t.id === 1 ? { ...t, status_code: 3 } : t
        );
        const orderAfter = manualSort(tasksAfter).map(t => t.id);

        expect(orderAfter).toEqual(orderBefore);
    });

    it('completing multiple tasks does NOT rearrange order (BUG-13 regression)', () => {
        const tasks = [
            { id: 4, today_sort_order: 0, status_code: 1 },
            { id: 1, today_sort_order: 0, status_code: 1 },
            { id: 3, today_sort_order: 0, status_code: 1 },
            { id: 2, today_sort_order: 0, status_code: 1 },
        ];
        const orderBefore = manualSort(tasks).map(t => t.id);

        // Complete tasks 1 and 3
        const tasksAfter = tasks.map(t =>
            [1, 3].includes(t.id) ? { ...t, status_code: 3 } : t
        );
        const orderAfter = manualSort(tasksAfter).map(t => t.id);

        expect(orderAfter).toEqual(orderBefore);
    });

    it('treats null/undefined today_sort_order as 0', () => {
        const tasks = [
            { id: 2, today_sort_order: null, status_code: 1 },
            { id: 1, today_sort_order: undefined, status_code: 1 },
            { id: 3, today_sort_order: 1, status_code: 1 },
        ];
        const sorted = manualSort(tasks);
        // null/undefined → 0, then ID tie-break; sort_order=1 goes last
        expect(sorted.map(t => t.id)).toEqual([1, 2, 3]);
    });

    it('handles mixed numeric and string IDs (routines)', () => {
        const tasks = [
            { id: 'routine_2_2026-03-10', today_sort_order: 0, status_code: 1 },
            { id: 5, today_sort_order: 0, status_code: 1 },
            { id: 'routine_1_2026-03-10', today_sort_order: 0, status_code: 1 },
            { id: 2, today_sort_order: 0, status_code: 1 },
        ];
        const sorted = manualSort(tasks);
        // Numeric IDs compare as numbers: 2, 5
        // String IDs compare as strings: 'routine_1...', 'routine_2...'
        // Mixed: numeric and string IDs use String() comparison for tie-breaking
        // When one is number and one is string, they fall to String comparison
        // "2" < "5" < "routine_1..." < "routine_2..."
        expect(sorted.map(t => t.id)).toEqual([2, 5, 'routine_1_2026-03-10', 'routine_2_2026-03-10']);
    });

    it('sort_order takes precedence over ID', () => {
        const tasks = [
            { id: 1, today_sort_order: 3, status_code: 1 },
            { id: 100, today_sort_order: 1, status_code: 1 },
            { id: 50, today_sort_order: 2, status_code: 1 },
        ];
        const sorted = manualSort(tasks);
        expect(sorted.map(t => t.id)).toEqual([100, 50, 1]);
    });
});
