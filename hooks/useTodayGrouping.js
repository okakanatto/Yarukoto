import { useMemo, useEffect, useRef } from 'react';

/**
 * Compute parent-child groups for today's tasks (IMP-15).
 * Returns rootItems (top-level items including ghost parent headers)
 * and childrenByParent (map of parent_id → child tasks).
 * Also returns stable refs for use in DnD handlers.
 */
export function useTodayGrouping(tasks) {
    const { rootItems, childrenByParent } = useMemo(() => {
        const todayTaskIds = new Set(tasks.filter(t => !t.is_routine).map(t => t.id));
        const cMap = {};
        const asChild = new Set();

        // Pass 1: identify children
        // Skip orphaned children whose parent was deleted (parent_title is null from LEFT JOIN)
        for (const task of tasks) {
            if (task.is_routine || !task.parent_id || !task.parent_title) continue;
            if (!cMap[task.parent_id]) cMap[task.parent_id] = [];
            cMap[task.parent_id].push(task);
            asChild.add(task.id);
        }

        // Pass 2: build root items (preserving sort order)
        const roots = [];
        const ghostInserted = new Set();

        for (const task of tasks) {
            if (asChild.has(task.id)) {
                // Insert ghost parent header at first child's position
                if (!todayTaskIds.has(task.parent_id) && !ghostInserted.has(task.parent_id)) {
                    roots.push({
                        id: `ghost_${task.parent_id}`,
                        real_id: task.parent_id,
                        title: task.parent_title || '親タスク',
                        is_ghost_parent: true,
                    });
                    ghostInserted.add(task.parent_id);
                }
                continue;
            }
            roots.push(task);
        }

        return { rootItems: roots, childrenByParent: cMap };
    }, [tasks]);

    const rootItemsRef = useRef([]);
    const childrenByParentRef = useRef({});
    useEffect(() => {
        rootItemsRef.current = rootItems;
        childrenByParentRef.current = childrenByParent;
    }, [rootItems, childrenByParent]);

    return { rootItems, childrenByParent, rootItemsRef, childrenByParentRef };
}
