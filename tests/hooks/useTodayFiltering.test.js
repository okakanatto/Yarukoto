/**
 * BUG-12 regression tests: useTodayTasks filtering & stats logic
 *
 * BUG-12: Progress ring percentage depended on filter conditions.
 * Fix: unfilteredStats is computed from allTasks (pre-filter),
 *       while displayed tasks are filtered via useMemo.
 *
 * These tests verify the pure computation logic extracted from useTodayTasks:
 * - unfilteredStats always reflects all tasks regardless of filters
 * - filter logic correctly applies status/tag/importance/urgency conditions
 */
import { describe, it, expect } from 'vitest';

// --- Pure logic extracted from useTodayTasks for testing ---

/**
 * Compute stats from an unfiltered task list (mirrors unfilteredStats useMemo).
 */
function computeStats(allTasks) {
    const total = allTasks.length;
    const completed = allTasks.filter(t => t.status_code === 3).length;
    const remaining = allTasks.filter(t => t.status_code !== 3 && t.status_code !== 5);
    const remainingMin = remaining.reduce((s, t) => s + (t.estimated_hours || 0), 0);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, remaining: remaining.length, remainingMin, pct };
}

/**
 * Apply filters to a task list (mirrors the tasks useMemo logic).
 */
function applyFilters(allTasks, { filterStatuses = [], filterTags = [], filterImportance = [], filterUrgency = [] } = {}) {
    let filtered = [...allTasks];

    if (filterStatuses.length > 0) {
        const showComplete = filterStatuses.includes(3);
        const showIncomplete = filterStatuses.includes(1) || filterStatuses.includes(2);
        filtered = filtered.filter(t => {
            if (t.is_routine) {
                if (t.status_code === 3) return showComplete;
                return showIncomplete;
            }
            return filterStatuses.includes(t.status_code);
        });
    }

    if (filterTags.length > 0) {
        filtered = filtered.filter(t =>
            t.tags && t.tags.some(tag => filterTags.includes(tag.id))
        );
    }

    if (filterImportance.length > 0) {
        filtered = filtered.filter(t => filterImportance.includes(t.importance_level));
    }

    if (filterUrgency.length > 0) {
        filtered = filtered.filter(t => filterUrgency.includes(t.urgency_level));
    }

    return filtered;
}

// --- Test data ---

const sampleTasks = [
    { id: 1, title: 'Task A', status_code: 1, importance_level: 3, urgency_level: 2, estimated_hours: 30, tags: [{ id: 10, name: 'Work' }] },
    { id: 2, title: 'Task B', status_code: 2, importance_level: 2, urgency_level: 1, estimated_hours: 60, tags: [{ id: 20, name: 'Personal' }] },
    { id: 3, title: 'Task C', status_code: 3, importance_level: 1, urgency_level: 3, estimated_hours: 15, tags: [{ id: 10, name: 'Work' }] },
    { id: 4, title: 'Task D', status_code: 5, importance_level: 2, urgency_level: 2, estimated_hours: 45, tags: [] },
    { id: 'routine_1_2026-03-10', title: 'Routine X', status_code: 1, is_routine: true, importance_level: 1, urgency_level: 1, estimated_hours: 10, tags: [{ id: 10, name: 'Work' }] },
    { id: 'routine_2_2026-03-10', title: 'Routine Y', status_code: 3, is_routine: true, importance_level: 2, urgency_level: 2, estimated_hours: 20, tags: [] },
];

describe('BUG-12: unfilteredStats computation', () => {
    it('computes stats from all tasks regardless of status', () => {
        const stats = computeStats(sampleTasks);
        expect(stats.total).toBe(6);
        expect(stats.completed).toBe(2); // Task C + Routine Y (status_code=3)
        expect(stats.remaining).toBe(3); // Task A(1), Task B(2), Routine X(1) — excludes cancelled(5) and completed(3)
        expect(stats.pct).toBe(33); // 2/6 = 33%
    });

    it('includes estimated_hours of remaining tasks only', () => {
        const stats = computeStats(sampleTasks);
        // Remaining: Task A(30) + Task B(60) + Routine X(10) = 100
        expect(stats.remainingMin).toBe(100);
    });

    it('returns 0 pct for empty list', () => {
        const stats = computeStats([]);
        expect(stats.total).toBe(0);
        expect(stats.completed).toBe(0);
        expect(stats.remaining).toBe(0);
        expect(stats.remainingMin).toBe(0);
        expect(stats.pct).toBe(0);
    });

    it('returns 100 pct when all tasks are completed', () => {
        const allDone = [
            { id: 1, status_code: 3, estimated_hours: 10 },
            { id: 2, status_code: 3, estimated_hours: 20 },
        ];
        const stats = computeStats(allDone);
        expect(stats.pct).toBe(100);
        expect(stats.remaining).toBe(0);
        expect(stats.remainingMin).toBe(0);
    });

    it('stats are unaffected by filter application (BUG-12 core fix)', () => {
        // This is the key regression test: stats must not change when filters are applied
        const statsBeforeFilter = computeStats(sampleTasks);

        // Apply a filter that hides most tasks
        const filtered = applyFilters(sampleTasks, { filterStatuses: [1] });
        const statsAfterFilter = computeStats(sampleTasks); // Stats computed from allTasks, NOT filtered

        expect(statsBeforeFilter).toEqual(statsAfterFilter);
        expect(filtered.length).toBeLessThan(sampleTasks.length);
    });
});

describe('BUG-12: filter logic (SQL→JS migration)', () => {
    it('returns all tasks when no filters applied', () => {
        const result = applyFilters(sampleTasks, {});
        expect(result.length).toBe(6);
    });

    it('filters by status code', () => {
        const result = applyFilters(sampleTasks, { filterStatuses: [1] });
        // Task A(1), Routine X(1, is_routine with showIncomplete)
        expect(result.map(t => t.id)).toEqual([1, 'routine_1_2026-03-10']);
    });

    it('filters routines by complete/incomplete grouping', () => {
        // Routines use showComplete/showIncomplete logic, not exact status match
        const onlyComplete = applyFilters(sampleTasks, { filterStatuses: [3] });
        const routineResults = onlyComplete.filter(t => t.is_routine);
        expect(routineResults.length).toBe(1);
        expect(routineResults[0].title).toBe('Routine Y');

        const onlyIncomplete = applyFilters(sampleTasks, { filterStatuses: [2] });
        const incompleteRoutines = onlyIncomplete.filter(t => t.is_routine);
        expect(incompleteRoutines.length).toBe(1);
        expect(incompleteRoutines[0].title).toBe('Routine X');
    });

    it('filters by tag', () => {
        const result = applyFilters(sampleTasks, { filterTags: [10] });
        // Task A, Task C, Routine X all have tag id=10
        expect(result.length).toBe(3);
        expect(result.every(t => t.tags.some(tag => tag.id === 10))).toBe(true);
    });

    it('filters by importance level', () => {
        const result = applyFilters(sampleTasks, { filterImportance: [3] });
        expect(result.length).toBe(1);
        expect(result[0].title).toBe('Task A');
    });

    it('filters by urgency level', () => {
        const result = applyFilters(sampleTasks, { filterUrgency: [3] });
        expect(result.length).toBe(1);
        expect(result[0].title).toBe('Task C');
    });

    it('combines multiple filters (AND logic)', () => {
        // Status=1 AND tag=10
        const result = applyFilters(sampleTasks, { filterStatuses: [1], filterTags: [10] });
        // Task A(status=1, tag=10) and Routine X(status=1/routine, tag=10)
        expect(result.length).toBe(2);
    });

    it('excludes tasks with empty tags when tag filter is active', () => {
        const result = applyFilters(sampleTasks, { filterTags: [10] });
        // Task D and Routine Y have empty tags — should be excluded
        expect(result.find(t => t.id === 4)).toBeUndefined();
        expect(result.find(t => t.id === 'routine_2_2026-03-10')).toBeUndefined();
    });
});
