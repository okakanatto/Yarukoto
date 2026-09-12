// UNION (not UNION ALL) also terminates safely if an older/imported DB has a cycle.
export const subtreeCte = `WITH RECURSIVE subtree(id) AS (
    SELECT id FROM tasks WHERE id = $1
    UNION SELECT t.id FROM tasks t JOIN subtree s ON t.parent_id = s.id
)`;

export function descendantIds(tasks, taskId) {
    const found = new Set([Number(taskId)]);
    const queue = [Number(taskId)];
    while (queue.length) {
        const parent = queue.shift();
        for (const task of tasks) {
            if (Number(task.parent_id) === parent && !found.has(Number(task.id))) {
                found.add(Number(task.id)); queue.push(Number(task.id));
            }
        }
    }
    return found;
}

export function ancestorPath(tasks, taskId) {
    const byId = new Map(tasks.map(t => [Number(t.id), t]));
    const path = [];
    const visited = new Set([Number(taskId)]);
    let parent = byId.get(Number(taskId))?.parent_id;
    while (parent != null && byId.has(Number(parent)) && !visited.has(Number(parent))) {
        const task = byId.get(Number(parent));
        visited.add(Number(parent)); path.unshift(task); parent = task.parent_id;
    }
    return path;
}

export async function getSubtree(db, taskId) {
    return db.select(`${subtreeCte} SELECT t.* FROM tasks t JOIN subtree s ON t.id = s.id`, [taskId]);
}

export async function validateParent(db, taskId, parentId) {
    if (parentId == null || parentId === '') return null;
    const parent = (await db.select('SELECT * FROM tasks WHERE id = $1', [Number(parentId)]))[0];
    if (!parent || parent.archived_at) throw new Error('移動先の親タスクが見つからないか、アーカイブ済みです');
    const descendants = await getSubtree(db, taskId);
    if (descendants.some(t => t.id === Number(parentId))) throw new Error('自分自身や子孫を親タスクにはできません');
    return parent;
}

// A single statement updates parent + every descendant's project together.
export async function reparentTask(db, taskId, parentId, rootProjectId) {
    const parent = await validateParent(db, taskId, parentId);
    const projectId = parent ? parent.project_id : rootProjectId;
    await db.execute(`${subtreeCte}
        UPDATE tasks SET parent_id = CASE WHEN id = $2 THEN $3 ELSE parent_id END,
            project_id = $4, updated_at = datetime('now', 'localtime')
        WHERE id IN (SELECT id FROM subtree)`, [taskId, taskId, parent ? parent.id : null, projectId ?? null]);
    await clearInvalidNextTasks(db);
}

export async function clearInvalidNextTasks(db) {
    await db.execute(`WITH RECURSIVE descendants(owner, id) AS (
        SELECT p.id, c.id FROM tasks p JOIN tasks c ON c.parent_id = p.id WHERE p.next_task_id IS NOT NULL
        UNION SELECT d.owner, c.id FROM descendants d JOIN tasks c ON c.parent_id = d.id
    ) UPDATE tasks SET next_task_id = NULL WHERE next_task_id IS NOT NULL AND (
        next_task_id = id OR NOT EXISTS (
            SELECT 1 FROM descendants d JOIN tasks target ON target.id = d.id
            WHERE d.owner = tasks.id AND target.id = tasks.next_task_id
              AND target.archived_at IS NULL AND target.status_code NOT IN (3, 5)
        )
    )`);
}

export async function cascadeProject(db, taskId, projectId) {
    await db.execute(`${subtreeCte} UPDATE tasks SET project_id = $2, updated_at = datetime('now', 'localtime')
        WHERE id IN (SELECT id FROM subtree)`, [taskId, projectId]);
}

export async function archiveSubtree(db, taskId) {
    const rows = await getSubtree(db, taskId);
    if (!rows.length || rows.some(t => ![3, 5].includes(t.status_code))) {
        throw new Error('未完了のタスク・子孫タスクがあるためアーカイブできません');
    }
    // Repeat the status condition inside the atomic write, so stale UI cannot hide work.
    await db.execute(`${subtreeCte} UPDATE tasks SET archived_at = datetime('now', 'localtime')
        WHERE id IN (SELECT id FROM subtree) AND archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM tasks unfinished JOIN subtree s ON unfinished.id = s.id
            WHERE unfinished.status_code NOT IN (3, 5))`, [taskId]);
    await clearInvalidNextTasks(db);
    return rows.map(t => t.id);
}

export async function restoreTaskTree(db, taskId) {
    const cte = `${subtreeCte}, ancestors(id, parent_id) AS (
        SELECT id, parent_id FROM tasks WHERE id = $2
        UNION SELECT t.id, t.parent_id FROM tasks t JOIN ancestors a ON t.id = a.parent_id
    ), restored(id) AS (SELECT id FROM subtree UNION SELECT id FROM ancestors)`;
    const rows = await db.select(`${cte} SELECT id FROM restored`, [taskId, taskId]);
    await db.execute(`${cte} UPDATE tasks SET archived_at = NULL WHERE id IN (SELECT id FROM restored)`, [taskId, taskId]);
    return rows.map(t => t.id);
}

export async function autoCompleteAncestors(db, taskId) {
    const settings = await db.select("SELECT value FROM app_settings WHERE key = 'auto_complete_parent'");
    if (settings[0]?.value !== '1') return [];
    const completed = [];
    const visited = new Set([taskId]);
    let currentId = taskId;
    while (currentId != null) {
        const current = (await db.select('SELECT parent_id FROM tasks WHERE id = $1', [currentId]))[0];
        const parentId = current?.parent_id;
        if (!parentId || visited.has(parentId)) break;
        visited.add(parentId);
        const subtree = await getSubtree(db, parentId);
        const parent = subtree.find(t => t.id === parentId);
        if (!parent || parent.status_code === 5 || subtree.some(t => t.id !== parentId && t.status_code !== 3)) break;
        if (parent.status_code !== 3) {
            await db.execute(`${subtreeCte} UPDATE tasks SET status_code = 3,
                completed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
                WHERE id = $2 AND status_code NOT IN (3, 5)
                AND NOT EXISTS (SELECT 1 FROM tasks t JOIN subtree s ON s.id = t.id WHERE t.id != $3 AND t.status_code != 3)`, [parentId, parentId, parentId]);
            completed.push(parentId);
        }
        currentId = parentId;
    }
    return completed;
}

export function notifyTasksChanged() {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('yarukoto:tasksChanged'));
}
