import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from '@tauri-apps/plugin-sql';
import { getDb } from '@/lib/db';
import { createCapturedTask, finishWorkStep, loadTaskContext, loadWorkspace, saveWorkContext } from '@/lib/workspace';
import { createTestDb, seedProject, seedTasks } from '../__helpers__/testDb';

let db;
beforeEach(async () => { db = await createTestDb(); });
afterEach(() => { vi.restoreAllMocks(); });

const readTask = async id => (await db.select('SELECT * FROM tasks WHERE id = $1', [id]))[0];
const record = (id, date, result, extra = {}) => ({ id, kind: 'pause', result, consumed_step: '', created_at: `${date} 10:00:00`, ...extra });
const setEntries = (id, entries) => db.execute('UPDATE tasks SET work_log = $1 WHERE id = $2', [JSON.stringify(entries), id]);

describe('bounded work sessions preserve the larger job', () => {
  it('finishes a free-text step without completing the task, its child, or changing the deadline and notes', async () => {
    const [parent] = await seedTasks(db, [{ title: '移行方式を決める', status_code: 2, due_date: '2026-09-18', today_date: '2026-09-13', notes: '方式は未決定。\n費用は確認済み。' }]);
    const [child] = await seedTasks(db, [{ title: '関係者と合意する', parent_id: parent }]);
    await saveWorkContext(parent, { next_step: '旧部門コードを5件だけ照合する' });
    const completed = await finishWorkStep(parent, { stepCompleted: true });
    expect(completed).toMatchObject({ status_code: 2, completed_at: null, due_date: '2026-09-18', today_date: '2026-09-13', notes: '方式は未決定。\n費用は確認済み。', next_step: '', next_task_id: null });
    expect(JSON.parse(completed.work_log)).toEqual([expect.objectContaining({ kind: 'step', consumed_step: '旧部門コードを5件だけ照合する', result: '' })]);
    expect((await readTask(child)).status_code).toBe(1);
    expect(await db.select('SELECT id FROM tasks')).toHaveLength(2);
  });

  it('can pause without a written result while preserving the step, selected child, waiting state and dates', async () => {
    const [parent] = await seedTasks(db, [{ title: '回答を確認する', status_code: 4, due_date: '2026-09-18', today_date: '2026-09-13' }]);
    const [child] = await seedTasks(db, [{ title: '回答を比較する', parent_id: parent }]);
    await saveWorkContext(parent, { next_step: '差分を一つ確認する', next_task_id: child, waiting_on: '担当者の回答', review_date: '2026-09-14' });
    const paused = await finishWorkStep(parent);
    expect(paused).toMatchObject({ status_code: 4, next_step: '差分を一つ確認する', next_task_id: child, waiting_on: '担当者の回答', review_date: '2026-09-14', due_date: '2026-09-18', today_date: '2026-09-13' });
    expect(JSON.parse(paused.work_log)).toEqual([expect.objectContaining({ kind: 'pause', result: '', consumed_step: '' })]);
  });

  it('stores a result and replacement step in one statement while retaining earlier results and source context', async () => {
    const id = await createCapturedTask({ text: '移行方式の懸念\n部門コードが合わない', source_ref: 'local.csv', due_date: '2026-09-18' });
    await saveWorkContext(id, { next_step: '5件照合する', notes: '旧来の作業メモ' });
    const earlier = record('earlier', '2026-09-12', '比較する資料を揃えた');
    await setEntries(id, [earlier]);
    const execute = vi.spyOn(db, 'execute');
    const saved = await finishWorkStep(id, { result: '  5件中1件は変換表にない  ', next_step: '例外の理由を確認する', stepCompleted: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toMatch(/^UPDATE tasks SET/);
    expect(saved).toMatchObject({ next_step: '例外の理由を確認する', capture_text: '移行方式の懸念\n部門コードが合わない', source_ref: 'local.csv', notes: '旧来の作業メモ', due_date: '2026-09-18', status_code: 1 });
    expect(JSON.parse(saved.work_log)).toEqual([earlier, expect.objectContaining({ result: '5件中1件は変換表にない', consumed_step: '5件照合する', kind: 'step' })]);
  });

  it('does not partially consume a step or append a result when SQLite rejects the checkpoint', async () => {
    const [id] = await seedTasks(db, [{ title: '集計方式', notes: '既存メモ', due_date: '2026-09-18', status_code: 2 }]);
    await saveWorkContext(id, { next_step: '見出しを作る' });
    await setEntries(id, [record('earlier', '2026-09-12', '資料を開いた')]);
    const previous = await readTask(id);
    // An AFTER trigger proves the entire statement is rolled back, even after its assignments ran.
    await db.execute(`CREATE TRIGGER reject_checkpoint AFTER UPDATE OF work_log ON tasks
      BEGIN SELECT RAISE(ABORT, 'simulated disk write rejection'); END`);
    await expect(finishWorkStep(id, { result: '見出しは三つ', next_step: '数値を埋める', stepCompleted: true })).rejects.toThrow('simulated disk write rejection');
    expect(await readTask(id)).toEqual(previous);
  });

  it('reports a confirmed checkpoint as saved even if subsequent reads would fail', async () => {
    const [id] = await seedTasks(db, [{ title: '比較を続ける', status_code: 2 }]);
    await saveWorkContext(id, { next_step: '5件確認する' });
    const execute = db.execute.bind(db);
    const select = db.select.bind(db);
    let committed = false;
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
      const changed = await execute(sql, params);
      if (sql.includes('work_log = json_insert') && changed.rowsAffected) committed = true;
      return changed;
    });
    vi.spyOn(db, 'select').mockImplementation((sql, params) => {
      if (committed) throw new Error('read connection unavailable');
      return select(sql, params);
    });
    const saved = await finishWorkStep(id, { result: '1件だけ例外がある', next_step: '例外を調べる', stepCompleted: true });
    expect(saved).toMatchObject({ next_step: '例外を調べる', status_code: 2 });
    const stored = (await select('SELECT work_log FROM tasks WHERE id = $1', [id]))[0];
    expect(JSON.parse(stored.work_log)).toEqual(JSON.parse(saved.work_log));
    expect(JSON.parse(stored.work_log)).toHaveLength(1);
  });

  it('does not overwrite a step changed between reading context and saving', async () => {
    const [id] = await seedTasks(db, [{ title: '条件を整理する', status_code: 2 }]);
    await saveWorkContext(id, { next_step: '元の一歩' });
    const execute = db.execute.bind(db);
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
      if (sql.includes('work_log = json_insert')) await execute('UPDATE tasks SET next_step = $1 WHERE id = $2', ['別画面で選び直した一歩', id]);
      return execute(sql, params);
    });
    await expect(finishWorkStep(id, { result: '古い画面の結果', next_step: '古い画面の次の一歩', stepCompleted: true })).rejects.toThrow('仕事の状態が変わりました');
    expect(await readTask(id)).toMatchObject({ next_step: '別画面で選び直した一歩', work_log: '[]', status_code: 2 });
  });

  it('refuses to complete a selected unfinished child or grandchild through its parent', async () => {
    const parent = await createCapturedTask({ text: '方式を決める' });
    const child = await createCapturedTask({ text: '方式を調べる', parent_id: parent });
    const grandchild = await createCapturedTask({ text: '費用を比較する', parent_id: child });
    for (const selected of [child, grandchild]) {
      await saveWorkContext(parent, { next_task_id: selected });
      await expect(finishWorkStep(parent, { result: '親から一歩を完了', stepCompleted: true })).rejects.toThrow('子タスクを開いて完了');
      expect(await readTask(parent)).toMatchObject({ work_log: '[]', next_task_id: selected });
      expect((await readTask(selected)).status_code).toBe(1);
    }
  });

  it('keeps a completed selected child in the history and releases its next-action link', async () => {
    const parent = await createCapturedTask({ text: '方式を決める' });
    const child = await createCapturedTask({ text: '費用を比較する', parent_id: parent });
    await saveWorkContext(parent, { next_task_id: child });
    await db.execute("UPDATE tasks SET status_code = 3, completed_at = '2026-09-13 10:00:00' WHERE id = $1", [child]);
    const saved = await finishWorkStep(parent, { result: '追加費用は不要', stepCompleted: true });
    expect(saved).toMatchObject({ next_task_id: null, status_code: 1, completed_at: null });
    expect(JSON.parse(saved.work_log)[0]).toMatchObject({ consumed_step: '費用を比較する', result: '追加費用は不要' });
    expect((await readTask(child)).status_code).toBe(3);
  });

  it('does not append work to a completed, cancelled, or archived task', async () => {
    const ids = await seedTasks(db, [{ title: '完了', status_code: 3 }, { title: '取消', status_code: 5 }, { title: '保管', status_code: 2 }]);
    await db.execute("UPDATE tasks SET archived_at = '2026-09-12' WHERE id = $1", [ids[2]]);
    for (const id of ids) {
      const previous = await readTask(id);
      await expect(finishWorkStep(id, { result: '誤操作', stepCompleted: true })).rejects.toThrow('未完了の仕事が見つかりません');
      expect(await readTask(id)).toEqual(previous);
    }
  });

  it('loads the latest thirty entries newest first without truncating stored history', async () => {
    const id = await createCapturedTask({ text: '長い仕事' });
    const entries = Array.from({ length: 35 }, (_, index) => record(`entry-${index}`, '2026-09-13', `確認結果 ${index}`));
    await setEntries(id, entries);
    const context = await loadTaskContext(id);
    expect(context.entries.map(entry => entry.id)).toEqual(entries.slice(-30).reverse().map(entry => entry.id));
    expect(JSON.parse((await readTask(id)).work_log)).toEqual(entries);
  });
});

describe('project progress includes the work below its milestones', () => {
  it('surfaces archived child and grandchild results, keeps the latest six, and omits empty pauses', async () => {
    const projectId = await seedProject(db, { name: '移行' });
    const parent = await createCapturedTask({ text: '方式を決める', project_id: projectId });
    const child = await createCapturedTask({ text: '方式を比較する', parent_id: parent });
    const grandchild = await createCapturedTask({ text: '旧コードを照合する', parent_id: child });
    const older = Array.from({ length: 7 }, (_, index) => record(`older-${index}`, `2026-09-0${index + 1}`, `比較結果 ${index}`));
    await setEntries(child, older);
    await setEntries(grandchild, [record('grandchild-result', '2026-09-12', '例外コードが一つある'), record('empty-pause', '2026-09-13', '')]);
    await db.execute("UPDATE tasks SET archived_at = '2026-09-12 18:00:00', status_code = 3 WHERE id IN ($1, $2)", [child, grandchild]);
    const workspace = await loadWorkspace();
    expect(workspace.tasks.map(task => task.id)).toEqual([parent]);
    const project = workspace.projects.find(item => item.id === projectId);
    expect(project.recentEntries).toHaveLength(6);
    expect(project.recentEntries[0]).toMatchObject({ id: 'grandchild-result', result: '例外コードが一つある', task_id: grandchild, task_title: '旧コードを照合する', archived_at: '2026-09-12 18:00:00' });
    expect(project.recentEntries.map(entry => entry.id)).toEqual(['grandchild-result', 'older-6', 'older-5', 'older-4', 'older-3', 'older-2']);
    expect((await loadTaskContext(project.recentEntries[0].task_id)).task.id).toBe(grandchild);
    expect((await readTask(parent)).notes).toBe('');
  });

  it('keeps current child notes beside explicit step results with their own time', async () => {
    const projectId = await seedProject(db, { name: '既存の仕事' });
    const parent = await createCapturedTask({ text: '移行条件', project_id: projectId });
    const child = await createCapturedTask({ text: '条件の確認', parent_id: parent });
    await saveWorkContext(child, { notes: '従来の確認内容\n次回の論点' });
    let project = (await loadWorkspace()).projects.find(item => item.id === projectId);
    expect(project.recentEntries).toEqual([expect.objectContaining({ task_id: child, kind: 'memo', result: '従来の確認内容\n次回の論点', created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} /) })]);
    await setEntries(child, [record('step-done', '2026-09-13', '', { kind: 'step', consumed_step: '資料を5件確認する' })]);
    project = (await loadWorkspace()).projects.find(item => item.id === projectId);
    expect(project.recentEntries).toEqual([
      expect.objectContaining({ task_id: child, kind: 'step', consumed_step: '資料を5件確認する', created_at: '2026-09-13 10:00:00' }),
      expect.objectContaining({ task_id: child, kind: 'memo', result: '従来の確認内容\n次回の論点', created_at: '' }),
    ]);
  });

  it('counts open grandchildren beneath completed parents while excluding completed and cancelled descendants', async () => {
    const projectId = await seedProject(db, { name: '親の期限を保つ' });
    const parent = await createCapturedTask({ text: '方式を決める', project_id: projectId, due_date: '2026-09-18' });
    const child = await createCapturedTask({ text: '方式を調べる', parent_id: parent });
    const grandchild = await createCapturedTask({ text: '費用を確認する', parent_id: child });
    await createCapturedTask({ text: '関係者と合意する', parent_id: parent });
    const cancelled = await createCapturedTask({ text: '不要な比較', parent_id: parent });
    await db.execute('UPDATE tasks SET status_code = 3 WHERE id IN ($1, $2)', [parent, child]);
    await db.execute('UPDATE tasks SET status_code = 5 WHERE id = $1', [cancelled]);
    const project = (await loadWorkspace()).projects.find(item => item.id === projectId);
    expect(project.milestones).toEqual([expect.objectContaining({ id: parent, status_code: 3, due_date: '2026-09-18', openDescendants: 2 })]);
    expect(project.progress).toMatchObject({ open: 2, total: 4, completed: 2 });
    expect((await readTask(grandchild)).status_code).toBe(1);
  });
});

describe('v9 to v10 additive work-history migration', () => {
  it('preserves existing data and retries safely when version recording fails after adding the new column', async () => {
    const projectId = await seedProject(db, { name: '既存プロジェクト' });
    const parent = await createCapturedTask({ text: '残したい原文\n未整理の背景', project_id: projectId, source_ref: '資料.csv', due_date: '2026-09-18' });
    const child = await createCapturedTask({ text: '子タスク', parent_id: parent });
    await saveWorkContext(parent, { next_step: '比較する', next_task_id: child, notes: '改行のある\n既存メモ', waiting_on: '回答', review_date: '2026-09-14' });
    await db.execute('ALTER TABLE tasks DROP COLUMN work_log');
    await db.execute("UPDATE app_settings SET value = '9' WHERE key = 'db_schema_version'");
    const previousTasks = await db.select('SELECT * FROM tasks ORDER BY id');
    const previousProjects = await db.select('SELECT * FROM projects ORDER BY id');
    const execute = db.execute.bind(db);
    let failOnce = true;
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
      if (failOnce && params?.[0] === 'db_schema_version' && params?.[1] === '10') {
        failOnce = false;
        throw new Error('version write interrupted');
      }
      return execute(sql, params);
    });
    vi.spyOn(Database, 'load').mockResolvedValue(db);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.__yarukoto_db_promise = null;
    await expect(getDb()).rejects.toThrow('version write interrupted');
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('9');
    expect((await db.select('PRAGMA table_info(tasks)')).some(column => column.name === 'work_log')).toBe(true);
    await getDb();
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('10');
    const migrated = await db.select('SELECT * FROM tasks ORDER BY id');
    expect(migrated).toEqual(previousTasks.map(task => ({ ...task, work_log: '[]' })));
    expect(await db.select('SELECT * FROM projects ORDER BY id')).toEqual(previousProjects);
    globalThis.__yarukoto_db_promise = null;
    await getDb();
    expect(await db.select('SELECT * FROM tasks ORDER BY id')).toEqual(migrated);
  });
});
