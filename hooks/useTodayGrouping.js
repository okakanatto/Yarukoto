import { useMemo, useEffect, useRef } from 'react';

export function buildTodayGrouping(tasks) {
    const nodes = new Map(tasks.filter(t => !t.is_routine).map(t => [t.id, t]));
    for (const task of tasks) {
        if (task.is_routine) continue;
        const ancestors = task.ancestors?.length ? task.ancestors :
            (task.parent_id && task.parent_title ? [{ id: task.parent_id, title: task.parent_title }] : []);
        for (const ancestor of ancestors) {
            if (!nodes.has(ancestor.id)) nodes.set(ancestor.id, {
                ...ancestor, id: `ghost_${ancestor.id}`, real_id: ancestor.id, is_ghost_parent: true,
            });
        }
    }
    const rootItems = [];
    const childrenByParent = {};
    const inserted = new Set();
    const insert = (task, path = new Set()) => {
        const id = task.is_ghost_parent ? task.real_id : task.id;
        if (inserted.has(id) || path.has(id)) return;
        const visited = new Set([...path, id]);
        const parent = !task.is_routine && nodes.get(task.parent_id);
        if (parent && !visited.has(parent.real_id || parent.id)) {
            insert(parent, visited);
            (childrenByParent[task.parent_id] ||= []).push(task);
        } else rootItems.push(task);
        inserted.add(id);
    };
    tasks.forEach(task => insert(task));
    return { rootItems, childrenByParent };
}

export function flattenTodayGroups(rootItems, childrenByParent) {
    const result = [];
    const visited = new Set();
    const visit = item => {
        const id = item.is_ghost_parent ? item.real_id : item.id;
        if (visited.has(id)) return;
        visited.add(id);
        if (!item.is_ghost_parent) result.push(item);
        (childrenByParent[id] || []).forEach(visit);
    };
    rootItems.forEach(visit);
    return result;
}

/**
 * Compute parent-child groups for today's tasks (IMP-15).
 * Returns rootItems (top-level items including ghost parent headers)
 * and childrenByParent (map of parent_id → child tasks).
 * Also returns stable refs for use in DnD handlers.
 */
export function useTodayGrouping(tasks) {
    const { rootItems, childrenByParent } = useMemo(() => buildTodayGrouping(tasks), [tasks]);

    const rootItemsRef = useRef([]);
    const childrenByParentRef = useRef({});
    useEffect(() => {
        rootItemsRef.current = rootItems;
        childrenByParentRef.current = childrenByParent;
    }, [rootItems, childrenByParent]);

    return { rootItems, childrenByParent, rootItemsRef, childrenByParentRef };
}
