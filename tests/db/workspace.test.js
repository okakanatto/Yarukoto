import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from '@tauri-apps/plugin-sql';
import { getDb } from '@/lib/db';
import { createCapturedTask, loadTaskContext, loadWorkspace, rememberTask, saveProjectContext, saveWorkContext } from '@/lib/workspace';
import { createTestDb, linkTaskTags, seedProject, seedTags, seedTasks } from '../__helpers__/testDb';

let db;
beforeEach(async () => { db = await createTestDb(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('仕事の記録と再開', () => {
  it('長文の原文を固定し、タイトル変更・再開メモ保存で上書きしない', async () => {
    const firstLine = '人事データの件を考える'.repeat(12);
    const original = `\n  ${firstLine}  \r\n会議で「数字が違う」と聞いた。\n比較ファイルを残す。\n`;
    const id = await createCapturedTask({ text: original, source_ref: 'ローカル資料.xlsx' });
    const created = (await loadTaskContext(id)).task;
    expect(created.title).toBe(firstLine.slice(0, 100));
    expect(created.capture_text).toBe(original);
    expect(created.notes).toBe('');
    expect(created.source_ref).toBe('ローカル資料.xlsx');
    expect(created.status_code).toBe(1);
    expect(created.project_name).toBe('Inbox');

    await db.execute('UPDATE tasks SET title = $1 WHERE id = $2', ['集計条件を確認する', id]);
    await saveWorkContext(id, { notes: '旧版を確認済み。次は新版の条件を見る。', capture_text: '上書き禁止', title: '変更禁止' });
    const saved = (await loadTaskContext(id)).task;
    expect(saved.capture_text).toBe(original);
    expect(saved.title).toBe('集計条件を確認する');
    expect(saved.notes).toBe('旧版を確認済み。次は新版の条件を見る。');
  });

  it('備考の部分保存は期限・実施予定日・他者待ち・確認日を変更しない', async () => {
    const id = await createCapturedTask({ text: '依頼への対応', due_date: '2026-10-20' });
    await db.execute('UPDATE tasks SET today_date = $1 WHERE id = $2', ['2026-10-15', id]);
    await saveWorkContext(id, { waiting_on: '担当者からの回答', review_date: '2026-10-18' });
    await saveWorkContext(id, { notes: '途中まで確認した', due_date: '2099-01-01' });
    const task = (await loadTaskContext(id)).task;
    expect(task).toMatchObject({ due_date: '2026-10-20', today_date: '2026-10-15', waiting_on: '担当者からの回答', review_date: '2026-10-18' });
    await expect(saveWorkContext(id, { notes: '保存されてはいけない', review_date: '2026-02-31' })).rejects.toThrow();
    expect((await loadTaskContext(id)).task.notes).toBe('途中まで確認した');
    await saveWorkContext(id, { review_date: null });
    expect((await loadTaskContext(id)).task.review_date).toBeNull();
  });

  it('次の行動は未完了の子孫だけを参照し、完了後も備考だけ保存できる', async () => {
    const parent = await createCapturedTask({ text: '親' });
    const child = await createCapturedTask({ text: '子', parent_id: parent });
    const grandchild = await createCapturedTask({ text: '孫', parent_id: child });
    const unrelated = await createCapturedTask({ text: '別の仕事' });
    await saveWorkContext(parent, { next_task_id: grandchild });
    expect((await loadTaskContext(parent)).task.next_task_id).toBe(grandchild);
    await expect(saveWorkContext(parent, { next_task_id: parent })).rejects.toThrow();
    await expect(saveWorkContext(parent, { next_task_id: unrelated })).rejects.toThrow();
    await expect(saveWorkContext(child, { next_task_id: parent })).rejects.toThrow();

    await db.execute('UPDATE tasks SET status_code = 3 WHERE id = $1', [grandchild]);
    await expect(saveWorkContext(parent, { next_task_id: grandchild })).rejects.toThrow();
    await saveWorkContext(parent, { notes: '孫の作業まで完了' });
    expect((await loadTaskContext(parent)).task.notes).toBe('孫の作業まで完了');
    await saveWorkContext(parent, { next_task_id: null });
    expect((await loadTaskContext(parent)).task.next_task_id).toBeNull();
    await db.execute("UPDATE tasks SET archived_at = '2026-09-01' WHERE id = $1", [child]);
    await expect(saveWorkContext(parent, { next_task_id: child })).rejects.toThrow();
  });

  it('開き直しは状態・原文・備考・期限・更新日時を変えず再開位置だけ記録する', async () => {
    const id = await createCapturedTask({ text: '途中の仕事', due_date: '2026-10-20' });
    await db.execute("UPDATE tasks SET status_code = 2, notes = '途中まで', updated_at = '2026-01-01 12:00:00' WHERE id = $1", [id]);
    const before = (await loadTaskContext(id)).task;
    const after = await rememberTask(id);
    expect(after.last_opened_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect({ ...after, last_opened_at: null }).toEqual(before);
  });

  it('子・孫を別プロジェクトに誤分類せず親のプロジェクトを引き継ぐ', async () => {
    const projectId = await seedProject(db, { name: '人事' });
    const otherId = await seedProject(db, { name: '別のプロジェクト' });
    const parent = await createCapturedTask({ text: '親', project_id: projectId });
    const child = await createCapturedTask({ text: '子', parent_id: parent, project_id: otherId });
    const grandchild = await createCapturedTask({ text: '孫', parent_id: child });
    const { task } = await loadTaskContext(grandchild);
    expect(task.project_id).toBe(projectId);
    await expect(createCapturedTask({ text: '不正な親', parent_id: 999999 })).rejects.toThrow();
    await expect(createCapturedTask({ text: '   \n ' })).rejects.toThrow();
  });

  it('親タグの継承設定を子・孫の記録でも守る', async () => {
    const parent = await createCapturedTask({ text: '親' });
    const tags = await seedTags(db, [{ name: '人事' }, { name: '確認' }]);
    await linkTaskTags(db, parent, tags);
    const withoutTags = await createCapturedTask({ text: '継承OFF', parent_id: parent });
    expect((await loadTaskContext(withoutTags)).task.tags).toEqual([]);

    await db.execute("UPDATE app_settings SET value = '1' WHERE key = 'inherit_parent_tags'");
    const child = await createCapturedTask({ text: '子', parent_id: parent });
    const grandchild = await createCapturedTask({ text: '孫', parent_id: child });
    for (const id of [child, grandchild]) {
      expect((await loadTaskContext(id)).task.tags.map(tag => tag.id)).toEqual(tags);
    }
  });

  it('タグ継承だけ失敗したら子の保存を成功として返し、親と既存子を保持する', async () => {
    const parent = await createCapturedTask({ text: '親' });
    const existing = await createCapturedTask({ text: '既存の子', parent_id: parent });
    const tags = await seedTags(db, [{ name: '人事' }, { name: '確認' }]);
    await linkTaskTags(db, parent, tags);
    await linkTaskTags(db, existing, tags);
    await db.execute("UPDATE app_settings SET value = '1' WHERE key = 'inherit_parent_tags'");
    const before = await db.select('SELECT * FROM tasks ORDER BY id');
    const previousLinks = await db.select('SELECT * FROM task_tags ORDER BY task_id, tag_id');
    // A real SQLite statement failure after one tag demonstrates all-or-none links.
    await db.execute(`CREATE TRIGGER fail_second_inherited_tag BEFORE INSERT ON task_tags
      WHEN NEW.tag_id = ${tags[1]} BEGIN SELECT RAISE(ABORT, 'simulated tag failure'); END`);
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    const child = await createCapturedTask({ text: '新しい子\n背景を保持', parent_id: parent });
    expect(Number.isSafeInteger(child)).toBe(true);
    expect(await db.select('SELECT * FROM tasks WHERE id != $1 ORDER BY id', [child])).toEqual(before);
    expect((await db.select('SELECT COUNT(*) AS count FROM tasks'))[0].count).toBe(before.length + 1);
    expect((await loadTaskContext(child)).task).toMatchObject({ capture_text: '新しい子\n背景を保持', parent_id: parent, tags: [] });
    expect(await db.select('SELECT * FROM task_tags ORDER BY task_id, tag_id')).toEqual(previousLinks);
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual(['yarukoto:toast', 'yarukoto:tasksChanged']);
    expect(dispatch.mock.calls[0][0].detail).toEqual({ type: 'error', message: '子タスクは保存済みです。タグの継承に失敗しました' });
  });

  it('成功した更新だけが共通の変更イベントを発火する', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const id = await createCapturedTask({ text: '記録' });
    await saveWorkContext(id, { notes: '再開メモ' });
    await rememberTask(id);
    expect(dispatch.mock.calls.filter(([event]) => event.type === 'yarukoto:tasksChanged')).toHaveLength(3);
    await expect(saveWorkContext(id, { next_task_id: id })).rejects.toThrow();
    expect(dispatch.mock.calls.filter(([event]) => event.type === 'yarukoto:tasksChanged')).toHaveLength(3);
  });
});

describe('全体の信頼性と文脈', () => {
  it('未絞り込みデータは完了・保留・期限超過も保持し、アーカイブだけ除外する', async () => {
    const projectId = await seedProject(db, { name: '人事' });
    const ids = await seedTasks(db, [
      { title: '期限超過', status_code: 4, due_date: '2020-01-01', project_id: projectId },
      { title: '完了', status_code: 3 }, { title: 'アーカイブ', status_code: 3 },
    ]);
    const tags = await seedTags(db, [{ name: '確認', color: '#123456' }]);
    await linkTaskTags(db, ids[0], tags);
    await db.execute("UPDATE tasks SET archived_at = '2026-01-01' WHERE id = $1", [ids[2]]);
    const { tasks, projects } = await loadWorkspace();
    expect(tasks.map(task => task.id)).toEqual(ids.slice(0, 2));
    expect(tasks[0]).toMatchObject({ project_name: '人事', status_label: '保留', tags: [{ id: tags[0], name: '確認', color: '#123456' }] });
    expect(projects.some(project => project.id === projectId)).toBe(true);
  });

  it('階層の背景はroot順、子孫はdepth付きのpreorderでアーカイブも読める', async () => {
    const root = await createCapturedTask({ text: '親' });
    const child = await createCapturedTask({ text: '子', parent_id: root });
    const grandchild = await createCapturedTask({ text: '孫', parent_id: child });
    await db.execute("UPDATE tasks SET archived_at = '2026-01-01' WHERE id = $1", [root]);
    const deep = await loadTaskContext(grandchild);
    expect(deep.ancestors.map(task => task.id)).toEqual([root, child]);
    expect((await loadTaskContext(root)).descendants.map(({ id, depth }) => ({ id, depth })))
      .toEqual([{ id: child, depth: 1 }, { id: grandchild, depth: 2 }]);
    expect(await loadTaskContext(999999)).toBeNull();

    // Imported malformed data must remain readable without allowing circular next links.
    await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [grandchild, root]);
    expect((await loadTaskContext(root)).descendants).toHaveLength(2);
    await expect(saveWorkContext(root, { next_task_id: child })).rejects.toThrow();
  });

  it('プロジェクト成果・本当の期限の部分保存はタスクの日付を変更しない', async () => {
    const projectId = await seedProject(db, { name: '集計' });
    const id = await createCapturedTask({ text: '資料作成', project_id: projectId, due_date: '2026-10-18' });
    await saveProjectContext(projectId, { outcome: '集計条件に合意する', due_date: '2026-10-20' });
    const project = await saveProjectContext(projectId, { outcome: '集計条件の合意と資料共有' });
    expect(project.due_date).toBe('2026-10-20');
    expect((await loadTaskContext(id)).task.due_date).toBe('2026-10-18');
    await expect(saveProjectContext(projectId, { due_date: '2026-13-01' })).rejects.toThrow();
  });
});

describe('v7からv8への追加移行', () => {
  it('追加途中の失敗を成功扱いせず、既存データとversionを保って再試行できる', async () => {
    const [id] = await seedTasks(db, [{ title: '失ってはいけない仕事', notes: '移行前のメモ' }]);
    await db.execute('ALTER TABLE tasks DROP COLUMN capture_text');
    await db.execute('ALTER TABLE tasks DROP COLUMN source_ref');
    await db.execute("UPDATE app_settings SET value = '7' WHERE key = 'db_schema_version'");
    const execute = db.execute.bind(db);
    let failOnce = true;
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
      if (failOnce && sql.startsWith('ALTER TABLE tasks ADD COLUMN source_ref')) {
        failOnce = false;
        throw new Error('simulated migration write failure');
      }
      return execute(sql, params);
    });
    vi.spyOn(Database, 'load').mockResolvedValue(db);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.__yarukoto_db_promise = null;

    await expect(getDb()).rejects.toThrow('simulated migration write failure');
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('7');
    expect((await db.select('SELECT title, notes FROM tasks WHERE id = $1', [id]))[0])
      .toEqual({ title: '失ってはいけない仕事', notes: '移行前のメモ' });
    await getDb();
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('8');
    expect((await loadTaskContext(id)).task).toMatchObject({ title: '失ってはいけない仕事', notes: '移行前のメモ', capture_text: '', source_ref: '' });
  });

  it('既存タイトル・複数行備考・期限・親子・タグ・設定を一切変えず追加する', async () => {
    const [parent] = await seedTasks(db, [{ title: '既存の親', notes: '元の備考\n二行目', due_date: '2026-12-01' }]);
    const [child] = await seedTasks(db, [{ title: '既存の子', parent_id: parent, status_code: 2 }]);
    const tags = await seedTags(db, [{ name: '既存タグ' }]);
    await linkTaskTags(db, child, tags);
    await db.execute("UPDATE app_settings SET value = '0' WHERE key = 'show_overdue_in_today'");
    const addedTaskFields = ['capture_text', 'source_ref', 'next_task_id', 'waiting_on', 'review_date', 'last_opened_at'];
    const taskColumns = await db.select('PRAGMA table_info(tasks)');
    for (const name of addedTaskFields) {
      if (taskColumns.some(column => column.name === name)) await db.execute(`ALTER TABLE tasks DROP COLUMN ${name}`);
    }
    const projectColumns = await db.select('PRAGMA table_info(projects)');
    for (const name of ['outcome', 'due_date']) {
      if (projectColumns.some(column => column.name === name)) await db.execute(`ALTER TABLE projects DROP COLUMN ${name}`);
    }
    await db.execute("UPDATE app_settings SET value = '7' WHERE key = 'db_schema_version'");
    const previous = await db.select('SELECT * FROM tasks ORDER BY id');
    const previousLinks = await db.select('SELECT * FROM task_tags');
    vi.spyOn(Database, 'load').mockResolvedValue(db);
    globalThis.__yarukoto_db_promise = null;
    await getDb();
    const migrated = await db.select('SELECT * FROM tasks ORDER BY id');
    for (let i = 0; i < previous.length; i++) {
      expect(migrated[i]).toMatchObject(previous[i]);
      expect(migrated[i]).toMatchObject({ capture_text: '', source_ref: '', waiting_on: '', next_task_id: null, review_date: null, last_opened_at: null });
    }
    expect(await db.select('SELECT * FROM task_tags')).toEqual(previousLinks);
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'show_overdue_in_today'"))[0].value).toBe('0');
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('8');
    expect((await db.select('SELECT outcome, due_date FROM projects'))[0]).toEqual({ outcome: '', due_date: null });
    // Reinitialization is idempotent, including a DB copied back from a backup.
    globalThis.__yarukoto_db_promise = null;
    await getDb();
    expect(await db.select('SELECT * FROM tasks ORDER BY id')).toEqual(migrated);
  });
});
