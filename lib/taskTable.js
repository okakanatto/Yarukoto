import { taskComparator, SORT_OPTIONS } from './taskSorter';
import { ancestorPath } from './taskHierarchy';

export const TABLE_COLUMNS = [
    ['status_code', '状態'], ['due_date', '期限'], ['project_id', 'プロジェクト'],
    ['estimated_hours', '見積'], ['today_date', '実行予定'], ['importance_level', '重要度'],
    ['urgency_level', '緊急度'], ['tags', 'タグ'],
];
export const DEFAULT_COLUMNS = ['status_code', 'due_date', 'project_id', 'estimated_hours'];
export const DEFAULT_TABLE_VIEW = { search: '', statuses: [], tags: [], importance: [], urgency: [], projects: [], sort: 'due_asc', group: 'tree', collapsed: [], columns: DEFAULT_COLUMNS };

export function restoreTableView(value) {
    const result = { ...DEFAULT_TABLE_VIEW };
    if (!value || typeof value !== 'object') return result;
    for (const name of ['statuses', 'tags', 'importance', 'urgency', 'projects', 'collapsed']) {
        if (Array.isArray(value[name])) result[name] = value[name].filter(Number.isInteger);
    }
    if (typeof value.search === 'string') result.search = value.search;
    if (['tree', 'project', 'status'].includes(value.group)) result.group = value.group;
    if (value.sort === 'manual' || SORT_OPTIONS.some(option => option.key === value.sort)) result.sort = value.sort;
    if (Array.isArray(value.columns)) result.columns = [...new Set(value.columns.filter(key => TABLE_COLUMNS.some(([column]) => column === key)))];
    return result;
}

export function taskMatches(task, view) {
    const filters = [['statuses', 'status_code'], ['importance', 'importance_level'], ['urgency', 'urgency_level'], ['projects', 'project_id']];
    if (filters.some(([key, field]) => view[key]?.length && !view[key].includes(Number(task[field])))) return false;
    if (view.tags?.length && !task.tags?.some(tag => view.tags.includes(Number(tag.id)))) return false;
    const search = view.search?.trim().toLocaleLowerCase();
    return !search || [task.title, task.notes, task.capture_text, task.source_ref, task.next_step, task.waiting_on, task.work_log, task.project_name, ...(task.tags || []).map(tag => tag.name)]
        .some(text => text?.toLocaleLowerCase().includes(search));
}

/** Filter matches retain their ancestors as non-selectable context, never as extra matches. */
export function tableRows(tasks, view, statuses = []) {
    const byId = new Map(tasks.map(task => [task.id, task]));
    const matches = new Set(tasks.filter(task => taskMatches(task, view)).map(task => task.id));
    const compare = view.sort === 'manual' ? (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id : taskComparator(view.sort, statuses);
    if (view.group !== 'tree') {
        const groups = new Map();
        for (const task of tasks.filter(task => matches.has(task.id)).sort(compare)) {
            const key = view.group === 'project' ? task.project_id : task.status_code;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ task, depth: 0, contextOnly: false, hasChildren: false, ancestors: ancestorPath(tasks, task.id) });
        }
        return { matches, rows: [...groups].flatMap(([key, rows]) => [{ group: key ?? 'none', label: view.group === 'project' ? rows[0].task.project_name || '未分類' : statuses.find(status => status.code === key)?.label || rows[0].task.status_label || '未設定', count: rows.length }, ...rows]) };
    }
    const included = new Set(matches);
    for (const id of matches) for (const parent of ancestorPath(tasks, id)) included.add(parent.id);
    const children = new Map();
    for (const task of tasks) {
        if (!included.has(task.id)) continue;
        const parent = byId.has(task.parent_id) && included.has(task.parent_id) ? task.parent_id : null;
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(task);
    }
    for (const siblings of children.values()) siblings.sort(compare);
    const rows = [], visited = new Set(), collapsed = new Set(view.collapsed);
    const visit = (task, depth, index) => {
        if (visited.has(task.id)) return;
        visited.add(task.id);
        const kids = children.get(task.id) || [];
        const expanded = !collapsed.has(task.id);
        rows.push({ task, depth, index, contextOnly: !matches.has(task.id), hasChildren: !!kids.length, expanded, ancestors: ancestorPath(tasks, task.id) });
        if (expanded) kids.forEach((child, i) => visit(child, depth + 1, i));
        else {
            const mark = id => { if (visited.has(id)) return; visited.add(id); (children.get(id) || []).forEach(child => mark(child.id)); };
            kids.forEach(child => mark(child.id));
        }
    };
    (children.get(null) || []).forEach((task, i) => visit(task, 0, i));
    // Imported cycles must not make work vanish or recurse forever.
    tasks.filter(task => included.has(task.id) && !visited.has(task.id)).sort(compare).forEach((task, i) => visit(task, 0, i));
    return { matches, rows };
}
