/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTodayGrouping } from '../../hooks/useTodayGrouping';

describe('useTodayGrouping', () => {
    it('returns empty when no tasks given', () => {
        const { result } = renderHook(() => useTodayGrouping([]));
        expect(result.current.rootItems).toEqual([]);
        expect(result.current.childrenByParent).toEqual({});
    });

    it('groups child tasks under ghost parent if parent is not in today', () => {
        const tasks = [
            { id: 2, parent_id: 1, parent_title: 'Parent 1', title: 'Child 1' },
            { id: 3, title: 'No Parent' }
        ];
        const { result } = renderHook(() => useTodayGrouping(tasks));

        expect(result.current.rootItems).toHaveLength(2);
        // ghost parent
        expect(result.current.rootItems[0].id).toBe('ghost_1');
        expect(result.current.rootItems[0].real_id).toBe(1);
        expect(result.current.rootItems[0].is_ghost_parent).toBe(true);
        // regular task
        expect(result.current.rootItems[1].id).toBe(3);

        expect(result.current.childrenByParent[1]).toHaveLength(1);
        expect(result.current.childrenByParent[1][0].id).toBe(2);
    });

    it('does not create ghost parent if parent is in today', () => {
        const tasks = [
            { id: 1, title: 'Parent 1' },
            { id: 2, parent_id: 1, parent_title: 'Parent 1', title: 'Child 1' }
        ];
        const { result } = renderHook(() => useTodayGrouping(tasks));

        expect(result.current.rootItems).toHaveLength(1);
        expect(result.current.rootItems[0].id).toBe(1); // the real parent

        expect(result.current.childrenByParent[1]).toHaveLength(1);
        expect(result.current.childrenByParent[1][0].id).toBe(2);
    });

    it('ignores child tasks whose parent_title is falsy (orphaned children)', () => {
        const tasks = [
            { id: 2, parent_id: 1, parent_title: null, title: 'Orphaned Child' }
        ];
        const { result } = renderHook(() => useTodayGrouping(tasks));

        // Orphaned children should fall through as root items
        expect(result.current.rootItems).toHaveLength(1);
        expect(result.current.rootItems[0].id).toBe(2);
        expect(result.current.childrenByParent).toEqual({});
    });

    it('returns stable refs', () => {
        const tasks = [{ id: 1, title: 'Task 1' }];
        const { result, rerender } = renderHook(({ t }) => useTodayGrouping(t), {
            initialProps: { t: tasks }
        });

        // Current refs
        expect(result.current.rootItemsRef.current).toHaveLength(1);
        expect(result.current.rootItemsRef.current[0].id).toBe(1);

        // Rerender with new array ref but same content
        rerender({ t: [...tasks] });
        expect(result.current.rootItemsRef.current).toHaveLength(1);
    });
});
