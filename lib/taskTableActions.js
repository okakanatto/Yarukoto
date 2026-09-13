import { fetchDb } from './utils';
import { autoCompleteAncestors, clearInvalidNextTasks, notifyTasksChanged, ancestorPath, descendantIds } from './taskHierarchy';

const FIELDS = new Set(['status_code', 'due_date', 'today_date', 'project_id', 'estimated_hours', 'importance_level', 'urgency_level']);
const placeholders = values => values.map((_, index) => `$${index + 1}`).join(',');

export async function editTableTasks(ids, field, rawValue) {
    if (!FIELDS.has(field)) throw new Error('変更できない項目です');
    const selected = [...new Set(ids.map(Number))];
    if (!selected.length || selected.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('タスクを選んでください');
    const db = await fetchDb();
    const all = await db.select('SELECT * FROM tasks');
    const byId = new Map(all.map(task => [task.id, task]));
    if (selected.some(id => !byId.has(id) || byId.get(id).archived_at)) throw new Error('タスクの状態が変わりました。再読み込みしてください');
    let value = rawValue === '' || rawValue == null ? null : rawValue;
    if (['due_date', 'today_date'].includes(field)) {
        if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00`).toLocaleDateString('sv-SE') !== value)) throw new Error('日付を確認してください');
    } else if (value !== null) {
        value = Number(value);
        if (!Number.isFinite(value) || value < 0 || (field !== 'estimated_hours' && !Number.isInteger(value))) throw new Error('値を確認してください');
    }
    const master = { status_code: ['status_master', 'code'], importance_level: ['importance_master', 'level'], urgency_level: ['urgency_master', 'level'], project_id: ['projects', 'id'] }[field];
    if (field === 'status_code' && value === null) throw new Error('状態を選んでください');
    if (master && value !== null && !(await db.select(`SELECT ${master[1]} FROM ${master[0]} WHERE ${master[1]} = $1${field === 'project_id' ? ' AND archived_at IS NULL' : ''}`, [value])).length) throw new Error('選択した項目が見つかりません');
    const affected = new Set(selected);
    let projectScope = null;
    if (field === 'project_id') {
        for (const id of selected) {
            if (byId.get(id).parent_id && !ancestorPath(all, id).some(parent => selected.includes(parent.id))) throw new Error('プロジェクトは親タスクから変更してください（子孫も一緒に移動します）');
            for (const child of descendantIds(all, id)) affected.add(child);
        }
        const roots = selected.filter(id => !ancestorPath(all, id).some(parent => selected.includes(parent.id)));
        projectScope = {
            roots,
            afterProjectId: value,
            tasks: [...affected].map(id => {
                const task = byId.get(id);
                return { id, parent_id: task.parent_id ?? null, project_id: task.project_id ?? null, archived_at: task.archived_at ?? null };
            }),
        };
    }
    const snapshotIds = new Set(affected);
    // Auto-completion and global invalid-link cleanup can update tasks outside the
    // selected branch. Snapshot every existing task so all actual side effects undo.
    if (field === 'status_code') for (const task of all) snapshotIds.add(task.id);
    const fields = field === 'status_code' ? ['status_code', 'completed_at', 'work_started_at', 'next_task_id'] : [field];
    const idsToWrite = [...affected].filter(id => (byId.get(id)[field] ?? null) !== value);
    if (!idsToWrite.length) return [];
    const params = [];
    const bind = item => { params.push(item); return `$${params.length}`; };
    let prefix = '';
    if (projectScope) {
        prefix = `WITH RECURSIVE current_scope(id) AS (
            SELECT id FROM tasks WHERE id IN (${projectScope.roots.map(bind).join(',')})
            UNION SELECT t.id FROM tasks t JOIN current_scope s ON t.parent_id = s.id
        )`;
    }
    const valueParam = bind(value);
    const extra = field === 'status_code' ? `, completed_at = CASE WHEN ${bind(value)} = 3 THEN datetime('now', 'localtime') ELSE NULL END, work_started_at = CASE WHEN ${bind(value)} = 2 THEN strftime('%Y-%m-%d %H:%M:%f', 'now', 'localtime') ELSE work_started_at END` : '';
    const where = idsToWrite.map(bind).join(',');
    const desired = bind(value);
    const stateRows = projectScope?.tasks || idsToWrite.map(id => byId.get(id));
    const stateClauses = stateRows.map(task => `(id = ${bind(task.id)} AND parent_id IS ${bind(task.parent_id ?? null)}
        AND archived_at IS ${bind(task.archived_at ?? null)} AND ${field} IS ${bind(field === 'project_id' ? task.project_id : (task[field] ?? null))})`);
    const stateGuard = `(SELECT COUNT(*) FROM tasks WHERE ${stateClauses.join(' OR ')}) = ${stateRows.length}`;
    let scopeGuard = '';
    if (projectScope) {
        scopeGuard = ` AND (SELECT COUNT(*) FROM current_scope) = ${projectScope.tasks.length}
            AND NOT EXISTS (SELECT 1 FROM current_scope WHERE id NOT IN (${projectScope.tasks.map(task => bind(task.id)).join(',')}))
            ${value === null ? '' : `AND EXISTS (SELECT 1 FROM projects WHERE id = ${bind(value)} AND archived_at IS NULL)`}`;
    }
    const result = await db.execute(`${prefix} UPDATE tasks SET ${field} = ${valueParam}${extra}, updated_at = datetime('now', 'localtime')
        WHERE id IN (${where}) AND ${field} IS NOT ${desired} AND ${stateGuard}${scopeGuard}`, params);
    if (result.rowsAffected !== idsToWrite.length) throw new Error('タスクの状態または階層が変わりました。再読み込みしてください');
    if (field === 'status_code') {
        if (value === 3) for (const id of selected) await autoCompleteAncestors(db, id);
        await clearInvalidNextTasks(db);
    }
    notifyTasksChanged();
    const after = await db.select(`SELECT * FROM tasks WHERE id IN (${placeholders([...snapshotIds])})`, [...snapshotIds]);
    return after.map(task => ({ id: task.id, before: Object.fromEntries(fields.map(key => [key, byId.get(task.id)[key] ?? null])), after: Object.fromEntries(fields.map(key => [key, task[key] ?? null])),
        guard: { parent_id: task.parent_id ?? null, archived_at: task.archived_at ?? null }, ...(projectScope ? { projectScope } : {}) }))
        .filter(row => fields.some(key => row.before[key] !== row.after[key]));
}

/** One conditional statement: never undo over a newer edit, including descendants. */
export async function undoTableEdit(changes) {
    if (!changes?.length) return;
    const params = [];
    const bind = value => { params.push(value); return `$${params.length}`; };
    const fields = Object.keys(changes[0].before);
    if (fields.some(key => !FIELDS.has(key) && !['completed_at', 'work_started_at', 'next_task_id'].includes(key))) throw new Error('復元できない項目です');
    if (changes.some(row => !row?.before || !row?.after || fields.some(field => !(field in row.before) || !(field in row.after)))) throw new Error('復元データが壊れています');
    const projectScope = changes[0].projectScope || null;
    if (projectScope) {
        const beforeById = new Map(projectScope.tasks.map(task => [task.id, task]));
        if (projectScope.tasks.some(task => task.parent_id != null && beforeById.has(task.parent_id)
            && beforeById.get(task.parent_id).project_id !== task.project_id)) throw new Error('元のプロジェクト階層が一致しないため戻せません');
    }
    let prefix = '';
    if (projectScope) {
        prefix = `WITH RECURSIVE current_scope(id) AS (
            SELECT id FROM tasks WHERE id IN (${projectScope.roots.map(bind).join(',')})
            UNION SELECT t.id FROM tasks t JOIN current_scope s ON t.parent_id = s.id
        )`;
    }
    const assignments = fields.map(field => `${field} = CASE id ${changes.map(row => `WHEN ${bind(row.id)} THEN ${bind(row.before[field])}`).join(' ')} ELSE ${field} END`);
    const ids = changes.map(row => bind(row.id));
    const clauses = changes.map(row => `(id = ${bind(row.id)} AND ${fields.map(field => `${field} IS ${bind(row.after[field])}`).join(' AND ')}${row.guard
        ? ` AND parent_id IS ${bind(row.guard.parent_id ?? null)} AND archived_at IS ${bind(row.guard.archived_at ?? null)}` : ''})`);
    const guard = `(SELECT COUNT(*) FROM tasks WHERE ${clauses.join(' OR ')}) = ${changes.length}`;
    let scopeGuard = '';
    if (projectScope) {
        const expectedScopeIds = projectScope.tasks.map(task => bind(task.id));
        const stateClauses = projectScope.tasks.map(task => `(id = ${bind(task.id)} AND parent_id IS ${bind(task.parent_id)}
            AND archived_at IS ${bind(task.archived_at)} AND project_id IS ${bind(projectScope.afterProjectId)})`);
        scopeGuard = ` AND (SELECT COUNT(*) FROM current_scope) = ${projectScope.tasks.length}
            AND NOT EXISTS (SELECT 1 FROM current_scope WHERE id NOT IN (${expectedScopeIds.join(',')}))
            AND (SELECT COUNT(*) FROM tasks WHERE ${stateClauses.join(' OR ')}) = ${projectScope.tasks.length}`;
    }
    const db = await fetchDb();
    const result = await db.execute(`${prefix} UPDATE tasks SET ${assignments.join(', ')}, updated_at = datetime('now', 'localtime')
        WHERE id IN (${ids.join(',')}) AND ${guard}${scopeGuard}`, params);
    if (result.rowsAffected !== changes.length) throw new Error('その後に編集されているため、元に戻せません。現在の内容を確認してください');
    if (fields.includes('status_code') || fields.includes('next_task_id')) await clearInvalidNextTasks(db);
    notifyTasksChanged();
}
