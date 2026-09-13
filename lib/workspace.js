import { fetchDb, parseTags } from '@/lib/utils';
import { ancestorPath, notifyTasksChanged } from '@/lib/taskHierarchy';
import { readWorkEntries } from '@/lib/workEntries';

const TASK_SELECT = `
  SELECT t.*, parent.title AS parent_title, next.title AS next_task_title,
         p.name AS project_name, p.color AS project_color,
         sm.label AS status_label, sm.color AS status_color,
         im.label AS importance_label, im.color AS importance_color,
         um.label AS urgency_label, um.color AS urgency_color,
         json_group_array(tag.id) AS tag_ids,
         json_group_array(tag.name) AS tag_names,
         json_group_array(tag.color) AS tag_colors
  FROM tasks t
  LEFT JOIN tasks parent ON parent.id = t.parent_id
  LEFT JOIN tasks next ON next.id = t.next_task_id AND next.archived_at IS NULL AND next.status_code NOT IN (3, 5)
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN status_master sm ON sm.code = t.status_code
  LEFT JOIN importance_master im ON im.level = t.importance_level
  LEFT JOIN urgency_master um ON um.level = t.urgency_level
  LEFT JOIN task_tags tt ON tt.task_id = t.id
  LEFT JOIN tags tag ON tag.id = tt.tag_id`;

async function selectTasks(db, where = '', params = [], prefix = '') {
  const rows = await db.select(`${prefix} ${TASK_SELECT} ${where} GROUP BY t.id ORDER BY t.sort_order, t.id`, params);
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
  const rows = await db.select('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY sort_order, id');
  // Storage is independent from accomplishment: archived completed work still counts.
  const totals = await db.select(`SELECT project_id,
    SUM(CASE WHEN status_code != 5 THEN 1 ELSE 0 END) AS total,
    SUM(CASE WHEN status_code = 3 THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN parent_id IS NULL AND status_code != 5 THEN 1 ELSE 0 END) AS rootTotal,
    SUM(CASE WHEN parent_id IS NULL AND status_code = 3 THEN 1 ELSE 0 END) AS rootCompleted,
    SUM(CASE WHEN status_code NOT IN (3, 5) THEN 1 ELSE 0 END) AS open,
    SUM(CASE WHEN status_code = 2 THEN 1 ELSE 0 END) AS inProgress,
    SUM(CASE WHEN status_code NOT IN (3, 5) AND (status_code = 4 OR trim(waiting_on) != '') THEN 1 ELSE 0 END) AS waiting
    FROM tasks GROUP BY project_id`);
  const historyTasks = await db.select(`SELECT t.id, t.parent_id, t.project_id, t.title, t.notes, t.work_log, t.status_code,
    t.completed_at, t.archived_at, t.due_date, t.updated_at, sm.label AS status_label
    FROM tasks t LEFT JOIN status_master sm ON sm.code = t.status_code
    JOIN projects p ON p.id = t.project_id AND p.archived_at IS NULL
    ORDER BY t.sort_order, t.id`);
  const historyById = new Map(historyTasks.map(task => [task.id, task]));
  const openDescendants = new Map();
  for (const task of historyTasks) {
    if ([3, 5].includes(Number(task.status_code))) continue;
    const seen = new Set([task.id]);
    let parent = historyById.get(task.parent_id);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      openDescendants.set(parent.id, (openDescendants.get(parent.id) || 0) + 1);
      parent = historyById.get(parent.parent_id);
    }
  }
  const milestones = historyTasks.filter(task => task.parent_id == null)
    .map(task => ({ ...task, openDescendants: openDescendants.get(task.id) || 0 }));
  const entriesByProject = new Map();
  for (const task of historyTasks) {
    const entries = readWorkEntries(task).filter(entry => entry.result?.trim() || entry.consumed_step?.trim());
    // Existing notes remain useful even when a task predates work sessions.
    if (task.notes?.trim() && !entries.length) entries.push({ id: `note-${task.id}`, kind: 'note', result: task.notes,
      created_at: task.updated_at || task.completed_at || '', consumed_step: '' });
    const previous = entriesByProject.get(task.project_id) || [];
    previous.push(...entries.map(entry => ({ ...entry, task_id: task.id, task_title: task.title, archived_at: task.archived_at })));
    entriesByProject.set(task.project_id, previous);
  }
  const progressByProject = new Map(totals.map(({ project_id, ...progress }) => [project_id, progress]));
  const milestonesByProject = new Map();
  for (const milestone of milestones) {
    if (!milestonesByProject.has(milestone.project_id)) milestonesByProject.set(milestone.project_id, []);
    milestonesByProject.get(milestone.project_id).push(milestone);
  }
  const projects = rows.map(project => ({ ...project,
    progress: progressByProject.get(project.id) || { total: 0, completed: 0, rootTotal: 0, rootCompleted: 0, open: 0, inProgress: 0, waiting: 0 },
    milestones: milestonesByProject.get(project.id) || [],
    recentEntries: (entriesByProject.get(project.id) || []).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
  }));
  return { tasks, projects };
}

/**
 * Read a task including archived context. Ancestors run root -> parent;
 * descendants use preorder with depth 1 for children, 2 for grandchildren.
 * Defensive visited sets also permit opening legacy malformed/cyclic data.
 */
export async function loadTaskContext(id) {
  const db = await fetchDb();
  const resolvedId = taskId(id);
  // Retrieve related work only: years of unrelated archived notes do not cross IPC.
  // UNION terminates even when imported historical data contains a cycle.
  const related = `WITH RECURSIVE ancestors(id, parent_id) AS (
    SELECT id, parent_id FROM tasks WHERE id = $1
    UNION SELECT t.id, t.parent_id FROM tasks t JOIN ancestors a ON t.id = a.parent_id
  ), descendants(id) AS (
    SELECT id FROM tasks WHERE id = $2
    UNION SELECT t.id FROM tasks t JOIN descendants d ON t.parent_id = d.id
  )`;
  const tasks = await selectTasks(db, 'WHERE t.id IN (SELECT id FROM ancestors UNION SELECT id FROM descendants)', [resolvedId, resolvedId], related);
  const byId = new Map(tasks.map(task => [task.id, task]));
  const task = byId.get(resolvedId);
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
  return { task, ancestors, descendants, entries: readWorkEntries(task).slice(-30).reverse() };
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

/** Only supplied fields change. The captured original and real deadline are untouched. */
export async function saveWorkContext(id, patch) {
  const context = await loadTaskContext(id);
  if (!context) throw new Error('タスクが見つかりません');
  const values = [];
  const assignments = [];
  const add = (name, value) => { values.push(value); assignments.push(`${name} = $${values.length}`); };
  if (Object.hasOwn(patch, 'title') && patch.title !== undefined) {
    const title = textValue(patch.title).trim();
    if (!title) throw new Error('仕事の名前を入力してください');
    add('title', title);
  }
  for (const name of ['notes', 'source_ref', 'waiting_on', 'next_step']) {
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

async function updateActiveTask(id, assignments, params = []) {
  const db = await fetchDb();
  const resolvedId = taskId(id);
  const result = await db.execute(`UPDATE tasks SET ${assignments}, updated_at = datetime('now', 'localtime')
    WHERE id = $${params.length + 1} AND archived_at IS NULL AND status_code NOT IN (3, 5)`, [...params, resolvedId]);
  if (!result.rowsAffected) throw new Error('未完了の仕事が見つかりません');
  notifyTasksChanged();
  return (await selectTasks(db, 'WHERE t.id = $1', [resolvedId]))[0];
}

/** Explicit work action; browsing never calls this. State changes use the established hook. */
export async function stampWorkStarted(id) {
  return updateActiveTask(id, "work_started_at = strftime('%Y-%m-%d %H:%M:%f', 'now', 'localtime')");
}

/** End a bounded piece of work without claiming the whole task is complete. */
export async function finishWorkStep(id, { result = '', next_step, stepCompleted = false } = {}) {
  const context = await loadTaskContext(id);
  const task = context?.task;
  if (!task || task.archived_at || [3, 5].includes(Number(task.status_code))) throw new Error('未完了の仕事が見つかりません');
  if (typeof stepCompleted !== 'boolean') throw new Error('一歩の完了を指定してください');
  const selectedChild = context.descendants.find(child => child.id === task.next_task_id);
  if (stepCompleted && selectedChild && !selectedChild.archived_at && ![3, 5].includes(Number(selectedChild.status_code))) {
    throw new Error('子タスクを開いて完了を確認してください');
  }
  const next = next_step === undefined ? (stepCompleted ? '' : task.next_step || '') : textValue(next_step).trim();
  const entry = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toLocaleString('sv-SE'),
    kind: stepCompleted ? 'step' : 'pause',
    consumed_step: stepCompleted ? task.next_step || selectedChild?.title || '' : '',
    result: textValue(result).trim(),
  };
  const db = await fetchDb();
  // Append and advance the step in one auto-committed statement. A concurrent
  // next-step edit must be reviewed, not overwritten by an older open panel.
  const changed = await db.execute(`UPDATE tasks SET
    work_log = json_insert(work_log, '$[#]', json($1)), next_step = $2,
    next_task_id = CASE WHEN $3 = 1 THEN NULL ELSE next_task_id END,
    updated_at = datetime('now', 'localtime')
    WHERE id = $4 AND archived_at IS NULL AND status_code NOT IN (3, 5)
    AND COALESCE(next_step, '') = $5 AND next_task_id IS $6`,
  [JSON.stringify(entry), next, stepCompleted ? 1 : 0, task.id, task.next_step || '', task.next_task_id]);
  if (!changed.rowsAffected) throw new Error('仕事の状態が変わりました。内容を確認してもう一度区切ってください');
  notifyTasksChanged();
  // The write is confirmed. A refresh failure must not invite a second append.
  return { ...task, next_step: next, next_task_id: stepCompleted ? null : task.next_task_id,
    work_log: JSON.stringify([...readWorkEntries(task), entry]), updated_at: entry.created_at };
}

/** Resolve a dependency without inventing a new deadline or starting the work. */
export async function resolveWaiting(id) {
  return updateActiveTask(id, "waiting_on = '', review_date = NULL, status_code = CASE WHEN status_code = 4 THEN 1 ELSE status_code END");
}

/** Replan explicitly. An execution plan is never substituted for the true deadline. */
export async function setTaskPlan(id, dateOrNull) {
  return updateActiveTask(id, 'today_date = $1', [optionalDate(dateOrNull)]);
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

/** Completing a project expresses the person's decision, never a task-count inference. */
export async function setProjectCompletion(id, completed = true) {
  if (typeof completed !== 'boolean') throw new Error('完了または再開を指定してください');
  const db = await fetchDb();
  const resolvedId = taskId(id);
  const project = (await db.select('SELECT * FROM projects WHERE id = $1', [resolvedId]))[0];
  if (!project || project.archived_at || project.is_default) throw new Error('このプロジェクトは完了・再開の対象ではありません');
  if (completed) {
    const open = await db.select('SELECT id FROM tasks WHERE project_id = $1 AND status_code NOT IN (3, 5) LIMIT 1', [resolvedId]);
    if (open.length) throw new Error('未完了の仕事があります。完了・移動・取消を確認してください');
    const routines = await db.select("SELECT id FROM routines WHERE project_id = $1 AND enabled = 1 AND (end_date IS NULL OR end_date >= date('now', 'localtime')) LIMIT 1", [resolvedId]);
    if (routines.length) throw new Error('実施中のルーティンがあります。終了・移動を確認してください');
  }
  // Repeat blockers inside the single write so concurrent changes cannot be hidden.
  const result = await db.execute(`UPDATE projects SET completed_at = ${completed ? "COALESCE(completed_at, datetime('now', 'localtime'))" : 'NULL'},
    updated_at = datetime('now', 'localtime') WHERE id = $1 AND archived_at IS NULL AND is_default = 0
    ${completed ? `AND NOT EXISTS (SELECT 1 FROM tasks WHERE project_id = $2 AND status_code NOT IN (3, 5))
      AND NOT EXISTS (SELECT 1 FROM routines WHERE project_id = $3 AND enabled = 1 AND (end_date IS NULL OR end_date >= date('now', 'localtime')))` : ''}`, completed ? [resolvedId, resolvedId, resolvedId] : [resolvedId]);
  if (!result.rowsAffected) throw new Error('仕事の状態が変わりました。確認して再度操作してください');
  notifyTasksChanged();
  return (await db.select('SELECT * FROM projects WHERE id = $1', [resolvedId]))[0];
}
