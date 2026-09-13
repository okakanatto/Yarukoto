import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from '@tauri-apps/plugin-sql';
import { getDb } from '@/lib/db';
import { createCapturedTask, finishWorkStep, loadTaskContext, loadWorkspace, rememberTask, saveProjectContext, saveWorkContext, stampWorkStarted, resolveWaiting, setTaskPlan, setProjectCompletion } from '@/lib/workspace';
import { createTestDb, linkTaskTags, seedProject, seedRoutine, seedTags, seedTasks } from '../__helpers__/testDb';

let db;
beforeEach(async () => { db = await createTestDb(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('仕事の記録と再開', () => {
  it('子タスクを増やさず次の一歩を保持し、閲覧と実作業開始を分ける', async () => {
    const id = await createCapturedTask({ text: '移行の懸念', due_date: '2026-10-20' });
    await saveWorkContext(id, { next_step: '比較表の見出しだけ書く' });
    await rememberTask(id);
    expect((await loadTaskContext(id)).task).toMatchObject({ next_step: '比較表の見出しだけ書く', work_started_at: null, status_code: 1 });
    await db.execute('UPDATE tasks SET status_code = 2 WHERE id = $1', [id]);
    const started = await stampWorkStarted(id);
    expect(started.work_started_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect(started).toMatchObject({ capture_text: '移行の懸念', due_date: '2026-10-20', status_code: 2 });
    expect(await db.select('SELECT id FROM tasks')).toHaveLength(1);
  });

  it('待ちの解消は相手・確認日だけを消し、保留だけ未着手へ戻す', async () => {
    for (const status of [1, 2, 4]) {
      const [id] = await seedTasks(db, [{ title: '回答待ち', status_code: status, due_date: '2026-10-20', today_date: '2026-10-18', notes: '検討内容' }]);
      await saveWorkContext(id, { waiting_on: '担当者', review_date: '2026-10-17', next_step: '届いた条件を比較' });
      const result = await resolveWaiting(id);
      expect(result).toMatchObject({ waiting_on: '', review_date: null, status_code: status === 4 ? 1 : status, due_date: '2026-10-20', today_date: '2026-10-18', notes: '検討内容', next_step: '届いた条件を比較' });
    }
  });

  it('実行予定の見直しで真の期限や状態を変更せず、無効な日付は拒否する', async () => {
    const id = await createCapturedTask({ text: '予定を見直す', due_date: '2026-10-20' });
    await setTaskPlan(id, '2026-10-18');
    expect((await loadTaskContext(id)).task).toMatchObject({ today_date: '2026-10-18', due_date: '2026-10-20', status_code: 1 });
    await expect(setTaskPlan(id, '2026-02-31')).rejects.toThrow();
    expect((await loadTaskContext(id)).task.today_date).toBe('2026-10-18');
    await setTaskPlan(id, null);
    expect((await loadTaskContext(id)).task).toMatchObject({ today_date: null, due_date: '2026-10-20' });
  });

  it('完了・アーカイブ後の仕事を操作で無断復活させない', async () => {
    const [id] = await seedTasks(db, [{ title: '完了', status_code: 3 }]);
    await expect(stampWorkStarted(id)).rejects.toThrow();
    await expect(resolveWaiting(id)).rejects.toThrow();
    await expect(setTaskPlan(id, '2026-10-18')).rejects.toThrow();
    expect((await loadTaskContext(id)).task.status_code).toBe(3);
    await db.execute("UPDATE tasks SET status_code = 1, archived_at = '2026-09-01' WHERE id = $1", [id]);
    await expect(stampWorkStarted(id)).rejects.toThrow();
    await expect(resolveWaiting(id)).rejects.toThrow();
  });
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

    await saveWorkContext(id, { title: '集計条件を確認する' });
    await saveWorkContext(id, { notes: '旧版を確認済み。次は新版の条件を見る。', capture_text: '上書き禁止' });
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

  it('備考変更を実時刻つきで記録し、区切りまでの連続保存は一つのスナップショットへまとめる', async () => {
    const id = await createCapturedTask({ text: '判断を更新する' });
    await saveWorkContext(id, { notes: '未決定' });
    await saveWorkContext(id, { notes: '方式Aを軸にする' });
    await saveWorkContext(id, { notes: '方式Aを軸にする' });
    let entries = JSON.parse((await loadTaskContext(id)).task.work_log);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'memo', memo: '方式Aを軸にする', result: '', consumed_step: '' });
    expect(entries[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2} /);

    await finishWorkStep(id, { result: '方式Aで合意済み' });
    await saveWorkContext(id, { notes: '展開条件を確認する' });
    entries = JSON.parse((await loadTaskContext(id)).task.work_log);
    expect(entries.map(entry => entry.kind)).toEqual(['memo', 'pause', 'memo']);
    expect(entries[2].memo).toBe('展開条件を確認する');
  });

  it('備考とその変更イベントを同じSQLite更新でロールバックする', async () => {
    const id = await createCapturedTask({ text: '原子的に保存する' });
    await db.execute(`CREATE TRIGGER reject_memo AFTER UPDATE OF work_log ON tasks
      BEGIN SELECT RAISE(ABORT, 'memo rejected'); END`);
    await expect(saveWorkContext(id, { notes: '保存されない変更' })).rejects.toThrow('memo rejected');
    expect((await loadTaskContext(id)).task).toMatchObject({ notes: '', work_log: '[]' });
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
  it('プロジェクト進捗は完了タスクを保管しても後退しない', async () => {
    const projectId = await seedProject(db, { name: '成果確認' });
    const [done, open, cancelled] = await seedTasks(db, [
      { title: '完了した判断', status_code: 3, project_id: projectId },
      { title: '残る判断', status_code: 2, project_id: projectId },
      { title: '不要になった仕事', status_code: 5, project_id: projectId },
    ]);
    await seedTasks(db, [{ title: '未完了の孫ではなく子', parent_id: open, status_code: 4, project_id: projectId }]);
    const before = (await loadWorkspace()).projects.find(p => p.id === projectId).progress;
    expect(before).toMatchObject({ total: 3, completed: 1, rootTotal: 2, rootCompleted: 1, open: 2, inProgress: 1, waiting: 1 });
    await db.execute("UPDATE tasks SET archived_at = '2026-09-01' WHERE id IN ($1, $2)", [done, cancelled]);
    expect((await loadWorkspace()).projects.find(p => p.id === projectId).progress).toEqual(before);
    const milestones = (await loadWorkspace()).projects.find(p => p.id === projectId).milestones;
    expect(milestones.map(t => t.id)).toEqual([done, open, cancelled]);
    expect(milestones[0]).toMatchObject({ status_code: 3, archived_at: '2026-09-01', status_label: '完了' });
  });

  it('現在のメモを過去の結果と分け、枝ごとの成果・待ち・次の一歩を主な仕事へ接続する', async () => {
    const projectId = await seedProject(db, { name: '移行' });
    const [root, decision, delivery] = await seedTasks(db, [
      { title: '移行を完了する', notes: '親の手書き要約', status_code: 2, project_id: projectId },
      { title: '方式を決める', parent_id: null, status_code: 3, project_id: projectId },
      { title: '展開する', parent_id: null, status_code: 2, project_id: projectId },
    ]);
    await db.execute('UPDATE tasks SET parent_id = $1 WHERE id IN ($2, $3)', [root, decision, delivery]);
    await db.execute("UPDATE tasks SET status_code = 4, next_step = '全体方針を確認する', work_log = $1 WHERE id = $2", [JSON.stringify([
      { id: 'root-result', created_at: '2026-09-04 10:00:00', kind: 'step', result: '移行日を確定した' },
    ]), root]);
    const [archivedResult, waiting] = await seedTasks(db, [
      { title: '比較を終える', parent_id: decision, status_code: 3, project_id: projectId },
      { title: '承認を待つ', parent_id: delivery, status_code: 4, project_id: projectId },
    ]);
    await db.execute("UPDATE tasks SET notes = '変更後の現在メモ', work_log = $1, updated_at = '2099-01-01 00:00:00' WHERE id = $2", [JSON.stringify([
      { id: 'old-result', created_at: '2026-09-01 10:00:00', kind: 'pause', result: '古い検討結果' },
    ]), delivery]);
    await db.execute("UPDATE tasks SET work_log = $1, archived_at = '2026-09-03 00:00:00' WHERE id = $2", [JSON.stringify([
      { id: 'done', created_at: '2026-09-02 10:00:00', kind: 'step', result: '方式Aで合意した' },
    ]), archivedResult]);
    await db.execute("UPDATE tasks SET waiting_on = '責任者の承認', review_date = '2026-09-20', next_step = '承認後に全社展開する' WHERE id = $1", [waiting]);

    const project = (await loadWorkspace()).projects.find(item => item.id === projectId);
    const memo = project.recentEntries.find(entry => entry.id === `memo-${delivery}`);
    expect(memo).toMatchObject({ kind: 'memo', result: '変更後の現在メモ', created_at: '' });
    expect(project.recentEntries.find(entry => entry.id === 'old-result')).toMatchObject({ result: '古い検討結果', created_at: '2026-09-01 10:00:00' });
    const milestone = project.milestones.find(item => item.id === root);
    expect(milestone.branchSummaries).toHaveLength(3);
    expect(milestone.branchSummaries[0]).toMatchObject({
      task_id: root,
      latestResult: { result: '移行日を確定した', task_id: root },
      waiting: [{ task_id: root, status_code: 4, waiting_on: '' }],
      nextSteps: [{ task_id: root, next_step: '全体方針を確認する' }],
    });
    expect(milestone.branchSummaries[1].latestResult).toMatchObject({ result: '方式Aで合意した', task_id: archivedResult, archived_at: '2026-09-03 00:00:00' });
    expect(milestone.branchSummaries[2]).toMatchObject({
      latestResult: { result: '古い検討結果', task_id: delivery },
      waiting: [{ task_id: waiting, waiting_on: '責任者の承認', review_date: '2026-09-20' }],
      nextSteps: [{ task_id: waiting, next_step: '承認後に全社展開する' }],
    });
    expect(milestone.branchSummaries.flatMap(branch => branch.latestResult ? [branch.latestResult.result] : [])).not.toContain('親の手書き要約');
  });

  it('アーカイブされた未完了の枝を待ち・次の一歩・未完了数へ戻さない', async () => {
    const projectId = await seedProject(db, { name: '保管済みの枝' });
    const root = await createCapturedTask({ text: '主な仕事', project_id: projectId });
    const child = await createCapturedTask({ text: '保管した作業', parent_id: root });
    await db.execute("UPDATE tasks SET status_code = 4, waiting_on = '旧担当者', next_step = '旧計画を再開', archived_at = '2026-09-01' WHERE id = $1", [child]);
    const project = (await loadWorkspace()).projects.find(item => item.id === projectId);
    const milestone = project.milestones.find(item => item.id === root);
    expect(project.progress).toMatchObject({ open: 1, waiting: 0 });
    expect(milestone.openDescendants).toBe(0);
    expect(milestone.branchSummaries[1]).toMatchObject({ waiting: [], nextSteps: [] });
  });

  it('多数のメモがあっても直近の結果と同じ仕事の現在メモを表示する', async () => {
    const projectId = await seedProject(db, { name: '多数の記録' });
    const ids = await seedTasks(db, Array.from({ length: 20 }, (_, i) => ({ title: `仕事${i}`, notes: `現在の背景${i}`, project_id: projectId })));
    await db.execute('UPDATE tasks SET work_log = $1 WHERE id = $2', [JSON.stringify([{ id: 'recent', created_at: '2026-09-13 10:00:00', kind: 'step', result: '方式に合意した' }]), ids.at(-1)]);
    const entries = (await loadWorkspace()).projects.find(item => item.id === projectId).recentEntries;
    expect(entries.slice(0, 2)).toMatchObject([{ id: 'recent', result: '方式に合意した' }, { kind: 'memo', result: '現在の背景19', created_at: '' }]);
    expect(entries).toHaveLength(6);
  });

  it('同じ仕事の同文メモと結果は最近の表示だけ重複を除く', async () => {
    const projectId = await seedProject(db, { name: '重複しない記録' });
    const [id] = await seedTasks(db, [{ title: '方式を決める', notes: '方式Aで合意した', project_id: projectId }]);
    await db.execute('UPDATE tasks SET work_log = $1 WHERE id = $2', [JSON.stringify([
      { id: 'agreed', created_at: '2026-09-13 10:00:00', kind: 'step', result: '方式Aで合意した' },
    ]), id]);
    const entries = (await loadWorkspace()).projects.find(item => item.id === projectId).recentEntries;
    expect(entries.filter(entry => entry.task_id === id && entry.result === '方式Aで合意した')).toEqual([
      expect.objectContaining({ id: 'agreed', kind: 'step', created_at: '2026-09-13 10:00:00' }),
    ]);
    expect(JSON.parse((await loadTaskContext(id)).task.work_log)).toHaveLength(1);
  });

  it('成果達成は未完了・実施中ルーティンを隠さず、明示的に完了・再開する', async () => {
    const projectId = await seedProject(db, { name: '成果の合意' });
    const [taskId] = await seedTasks(db, [{ title: '合意する', project_id: projectId }]);
    await saveProjectContext(projectId, { outcome: '集計条件に合意', due_date: '2026-10-20' });
    await expect(setProjectCompletion(projectId, true)).rejects.toThrow('未完了');
    expect((await loadTaskContext(taskId)).task.status_code).toBe(1);
    await db.execute('UPDATE tasks SET status_code = 3 WHERE id = $1', [taskId]);
    const routineId = await seedRoutine(db, { title: '定期確認', project_id: projectId });
    await expect(setProjectCompletion(projectId, true)).rejects.toThrow('ルーティン');
    await db.execute('UPDATE routines SET enabled = 0 WHERE id = $1', [routineId]);
    const completed = await setProjectCompletion(projectId, true);
    expect(completed.completed_at).toBeTruthy();
    expect(completed).toMatchObject({ outcome: '集計条件に合意', due_date: '2026-10-20', archived_at: null });
    expect((await setProjectCompletion(projectId, true)).completed_at).toBe(completed.completed_at);
    expect((await setProjectCompletion(projectId, false)).completed_at).toBeNull();
  });
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
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('10');
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
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('10');
    expect((await db.select('SELECT outcome, due_date FROM projects'))[0]).toEqual({ outcome: '', due_date: null });
    // Reinitialization is idempotent, including a DB copied back from a backup.
    globalThis.__yarukoto_db_promise = null;
    await getDb();
    expect(await db.select('SELECT * FROM tasks ORDER BY id')).toEqual(migrated);
  });
});

describe('v8からv9への非破壊移行', () => {
  it('原文・次の子参照・閲覧時刻・待ち・予定・成果を保ち、失敗後に再試行できる', async () => {
    const projectId = await seedProject(db, { name: '移行前のプロジェクト' });
    const parent = await createCapturedTask({ text: '原文\n背景も保存', project_id: projectId, due_date: '2026-10-20' });
    const child = await createCapturedTask({ text: '子の調査', parent_id: parent });
    await saveWorkContext(parent, { notes: '元のメモ\n二行目', source_ref: '資料.xlsx', next_task_id: child, waiting_on: '担当者', review_date: '2026-10-01' });
    await rememberTask(parent);
    await setTaskPlan(parent, '2026-09-20');
    await saveProjectContext(projectId, { outcome: '条件に合意', due_date: '2026-10-22' });
    await db.execute('ALTER TABLE tasks DROP COLUMN next_step');
    await db.execute('ALTER TABLE tasks DROP COLUMN work_started_at');
    await db.execute('ALTER TABLE projects DROP COLUMN completed_at');
    await db.execute("UPDATE app_settings SET value = '8' WHERE key = 'db_schema_version'");
    const previousTasks = await db.select('SELECT * FROM tasks ORDER BY id');
    const previousProjects = await db.select('SELECT * FROM projects ORDER BY id');
    const execute = db.execute.bind(db);
    let failOnce = true;
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
      if (failOnce && sql.startsWith('ALTER TABLE tasks ADD COLUMN work_started_at')) { failOnce = false; throw new Error('migration interrupted'); }
      return execute(sql, params);
    });
    vi.spyOn(Database, 'load').mockResolvedValue(db);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.__yarukoto_db_promise = null;
    await expect(getDb()).rejects.toThrow('migration interrupted');
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('8');
    await getDb();
    expect((await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'"))[0].value).toBe('10');
    const migratedTasks = await db.select('SELECT * FROM tasks ORDER BY id');
    expect(migratedTasks).toEqual(previousTasks.map(t => ({ ...t, next_step: '', work_started_at: null })));
    expect(await db.select('SELECT * FROM projects ORDER BY id')).toEqual(previousProjects.map(p => ({ ...p, completed_at: null })));
    globalThis.__yarukoto_db_promise = null;
    await getDb();
    expect(await db.select('SELECT * FROM tasks ORDER BY id')).toEqual(migratedTasks);
  });
});
