import { fetchDb, parseTags } from '@/lib/utils';
import { ancestorPath, notifyTasksChanged } from '@/lib/taskHierarchy';

const TASK_SELECT = `
  SELECT t.*, parent.title AS parent_title,
         p.name AS project_name, p.color AS project_color,
         sm.label AS status_label, sm.color AS status_color,
         im.label AS importance_label, im.color AS importance_color,
         um.label AS urgency_label, um.color AS urgency_color,
         json_group_array(tag.id) AS tag_ids,
         json_group_array(tag.name) AS tag_names,
         json_group_array(tag.color) AS tag_colors
  FROM tasks t
  LEFT JOIN tasks parent ON parent.id = t.parent_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN status_master sm ON sm.code = t.status_code
  LEFT JOIN importance_master im ON im.level = t.importance_level
  LEFT JOIN urgency_master um ON um.level = t.urgency_level
  LEFT JOIN task_tags tt ON tt.task_id = t.id
  LEFT JOIN tags tag ON tag.id = tt.tag_id`;

async function selectTasks(db, where = '', params = []) {
  const rows = await db.select(`${TASK_SELECT} ${where} GROUP BY t.id ORDER BY t.sort_order, t.id`, params);
  return rows.map(row => ({ ...row, tags: parseTags(row) }));
}

function taskId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('有効なタスクを指定してください');
  return id;
}

function optionalDate(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('日付は YYYY-MM-DD で入力してください');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('存在する日付を入力してください');
  }
  return value;
}

function textValue(value) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error('文字列を入力してください');
  return value;
}

/** Complete, unfiltered active data. View filters must not drive deadline signals. */
export async function loadWorkspace() {
  const db = await fetchDb();
  const tasks = await selectTasks(db, 'WHERE t.archived_at IS NULL');
  const projects = await db.select('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY sort_order, id');
  return { tasks, projects };
}

/**
 * Read a task including archived context. Ancestors run root -> parent;
 * descendants use preorder with depth 1 for children, 2 for grandchildren.
 * Defensive visited sets also permit opening legacy malformed/cyclic data.
 */
export async function loadTaskContext(id) {
  const db = await fetchDb();
  const tasks = await selectTasks(db);
  const byId = new Map(tasks.map(task => [task.id, task]));
  const task = byId.get(taskId(id));
  if (!task) return null;

  const ancestors = ancestorPath(tasks, task.id);

  const childrenByParent = new Map();
  for (const entry of tasks) {
    if (!childrenByParent.has(entry.parent_id)) childrenByParent.set(entry.parent_id, []);
    childrenByParent.get(entry.parent_id).push(entry);
  }
  const descendants = [];
  const visitedDescendants = new Set([task.id]);
  const stack = [...(childrenByParent.get(task.id) || [])].reverse().map(child => ({ ...child, depth: 1 }));
  while (stack.length) {
    const child = stack.pop();
    if (visitedDescendants.has(child.id)) continue;
    visitedDescendants.add(child.id);
    descendants.push(child);
    const children = childrenByParent.get(child.id) || [];
    for (let i = children.length - 1; i >= 0; i--) stack.push({ ...children[i], depth: child.depth + 1 });
  }
  return { task, ancestors, descendants };
}

/** Store the original once; derive only a temporary first-line title. */
export async function createCapturedTask({ text, source_ref = '', due_date = null, parent_id = null, project_id = null }) {
  const original = textValue(text);
  const title = original.split(/\r\n|\r|\n/).find(line => line.trim())?.trim().slice(0, 100);
  if (!title) throw new Error('記録する内容を入力してください');
  const dueDate = optionalDate(due_date);
  const source = textValue(source_ref);
  const db = await fetchDb();
  const parentId = parent_id == null || parent_id === '' ? null : taskId(parent_id);
  let projectId = project_id == null || project_id === '' ? null : taskId(project_id);
  if (parentId) {
    const parents = await db.select('SELECT project_id FROM tasks WHERE id = $1 AND archived_at IS NULL', [parentId]);
    if (!parents.length) throw new Error('親タスクが見つかりません');
    projectId = parents[0].project_id;
  }
  if (!projectId) {
    const defaults = await db.select('SELECT id FROM projects WHERE is_default = 1 LIMIT 1');
    projectId = defaults[0]?.id || null;
  }
  if (projectId) {
    const projects = await db.select('SELECT id FROM projects WHERE id = $1 AND archived_at IS NULL', [projectId]);
    if (!projects.length) throw new Error('利用できるプロジェクトが見つかりません');
  }
  // Read the setting before inserting; a failed read creates no partial task.
  const inheritTags = parentId && (await db.select("SELECT value FROM app_settings WHERE key = 'inherit_parent_tags'"))[0]?.value === '1';
  const result = await db.execute(`
    INSERT INTO tasks (title, capture_text, source_ref, due_date, parent_id, project_id, notes, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, '',
      COALESCE((SELECT MIN(sort_order) FROM tasks WHERE parent_id IS $7 AND archived_at IS NULL), 1) - 1)`,
  [title, original, source, dueDate, parentId, projectId, parentId]);
  if (inheritTags) {
    try {
      // All tag links succeed or fail together in one auto-committed statement.
      await db.execute(`INSERT OR IGNORE INTO task_tags (task_id, tag_id)
        SELECT $1, tt.tag_id FROM task_tags tt JOIN tags tag ON tag.id = tt.tag_id WHERE tt.task_id = $2`,
      [result.lastInsertId, parentId]);
    } catch {
      // The task is committed. Report the optional tag failure without inviting
      // another creation; tags remain editable through the existing attributes UI.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: {
          type: 'error', message: '子タスクは保存済みです。タグの継承に失敗しました',
        } }));
      }
    }
  }
  notifyTasksChanged();
  return result.lastInsertId;
}

/** Only supplied fields change. The captured original, title and real deadline are untouched. */
export async function saveWorkContext(id, patch) {
  const context = await loadTaskContext(id);
  if (!context) throw new Error('タスクが見つかりません');
  const values = [];
  const assignments = [];
  const add = (name, value) => { values.push(value); assignments.push(`${name} = $${values.length}`); };
  for (const name of ['notes', 'source_ref', 'waiting_on']) {
    if (Object.hasOwn(patch, name) && patch[name] !== undefined) add(name, textValue(patch[name]));
  }
  if (Object.hasOwn(patch, 'review_date') && patch.review_date !== undefined) add('review_date', optionalDate(patch.review_date));
  if (Object.hasOwn(patch, 'next_task_id') && patch.next_task_id !== undefined) {
    const nextId = patch.next_task_id == null || patch.next_task_id === '' ? null : taskId(patch.next_task_id);
    if (nextId !== null && !context.descendants.some(task => task.id === nextId && !task.archived_at && ![3, 5].includes(task.status_code))) {
      throw new Error('次の行動には、この仕事の未完了の子タスクを選んでください');
    }
    // A malformed legacy hierarchy must not permit a reference back to an ancestor.
    if (nextId !== null && context.ancestors.some(task => task.id === nextId)) {
      throw new Error('循環する次の行動は設定できません');
    }
    add('next_task_id', nextId);
  }
  if (!assignments.length) return context.task;
  values.push(context.task.id);
  const db = await fetchDb();
  await db.execute(`UPDATE tasks SET ${assignments.join(', ')}, updated_at = datetime('now', 'localtime') WHERE id = $${values.length}`, values);
  notifyTasksChanged();
  return (await selectTasks(db, 'WHERE t.id = $1', [context.task.id]))[0];
}

/** Opening a task records where to resume, without rewriting its activity or dates. */
export async function rememberTask(id) {
  const db = await fetchDb();
  const resolvedId = taskId(id);
  const result = await db.execute("UPDATE tasks SET last_opened_at = strftime('%Y-%m-%d %H:%M:%f', 'now', 'localtime') WHERE id = $1", [resolvedId]);
  if (!result.rowsAffected) throw new Error('タスクが見つかりません');
  notifyTasksChanged();
  return (await selectTasks(db, 'WHERE t.id = $1', [resolvedId]))[0];
}

/** Project completion intent and true deadline remain independent from task planning. */
export async function saveProjectContext(id, patch) {
  const db = await fetchDb();
  const resolvedId = taskId(id);
  const projects = await db.select('SELECT * FROM projects WHERE id = $1', [resolvedId]);
  if (!projects.length) throw new Error('プロジェクトが見つかりません');
  const values = [];
  const assignments = [];
  if (Object.hasOwn(patch, 'outcome') && patch.outcome !== undefined) {
    values.push(textValue(patch.outcome)); assignments.push(`outcome = $${values.length}`);
  }
  if (Object.hasOwn(patch, 'due_date') && patch.due_date !== undefined) {
    values.push(optionalDate(patch.due_date)); assignments.push(`due_date = $${values.length}`);
  }
  if (!assignments.length) return projects[0];
  values.push(resolvedId);
  await db.execute(`UPDATE projects SET ${assignments.join(', ')}, updated_at = datetime('now', 'localtime') WHERE id = $${values.length}`, values);
  notifyTasksChanged();
  return (await db.select('SELECT * FROM projects WHERE id = $1', [resolvedId]))[0];
}
