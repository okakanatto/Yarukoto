import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedTasks } from '../__helpers__/testDb';
import { editTableTasks, undoTableEdit } from '@/lib/taskTableActions';
import { DEFAULT_TABLE_VIEW, restoreTableView, tableRows } from '@/lib/taskTable';

describe('管理一覧の階層・絞り込み', () => {
    const tasks = [
        { id: 1, title: '移行', parent_id: null, status_code: 1, sort_order: 1 },
        { id: 2, title: '検証', parent_id: 1, status_code: 2, sort_order: 1 },
        { id: 3, title: '例外を調べる', parent_id: 2, status_code: 4, sort_order: 1 },
        { id: 4, title: '別の仕事', parent_id: null, status_code: 1, sort_order: 2 },
    ];
    it('孫の検索は親を文脈として残し、件数と選択対象には孫だけを含める', () => {
        const result = tableRows(tasks, { ...DEFAULT_TABLE_VIEW, search: '例外' });
        expect([...result.matches]).toEqual([3]);
        expect(result.rows.map(row => [row.task.id, row.depth, row.contextOnly])).toEqual([[1, 0, true], [2, 1, true], [3, 2, false]]);
    });
    it('枝を閉じても別の根は残り、開けば孫まで戻る', () => {
        expect(tableRows(tasks, { ...DEFAULT_TABLE_VIEW, sort: 'manual', collapsed: [1] }).rows.map(row => row.task.id)).toEqual([1, 4]);
        expect(tableRows(tasks, { ...DEFAULT_TABLE_VIEW, sort: 'manual' }).rows.map(row => row.task.id)).toEqual([1, 2, 3, 4]);
    });
    it('状態別でも孫は本来の状態に属し、祖先を辿れる', () => {
        const result = tableRows(tasks, { ...DEFAULT_TABLE_VIEW, group: 'status', statuses: [4] });
        expect(result.rows[0]).toMatchObject({ group: 4, count: 1 });
        expect(result.rows[1].ancestors.map(task => task.id)).toEqual([1, 2]);
    });
    it('循環した旧データも無限ループや欠落を起こさない', () => {
        expect(tableRows([{ ...tasks[0], parent_id: 2 }, tasks[1]], DEFAULT_TABLE_VIEW).rows.map(row => row.task.id).sort()).toEqual([1, 2]);
    });
    it('表示設定の不正値を無害化する', () => {
        expect(restoreTableView({ sort: 'bad', columns: ['status_code', 'bad'], statuses: ['3', 4] })).toMatchObject({ sort: 'due_asc', columns: ['status_code'], statuses: [4] });
    });
});

describe('一覧からの変更・取り消し', () => {
    let db, ids, projectA, projectB;
    beforeEach(async () => {
        db = await createTestDb();
        projectA = (await db.execute("INSERT INTO projects (name) VALUES ('移行')")).lastInsertId;
        projectB = (await db.execute("INSERT INTO projects (name) VALUES ('改善')")).lastInsertId;
        ids = await seedTasks(db, [{ title: '親', project_id: projectA, due_date: '2026-10-01', estimated_hours: 80 }, { title: '子', project_id: projectA }, { title: '孫', project_id: projectA }]);
        await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [ids[0], ids[1]]);
        await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [ids[1], ids[2]]);
    });
    it('複数の実行予定だけ変更し、本当の期限・階層・工数を維持する', async () => {
        const undo = await editTableTasks(ids, 'today_date', '2026-09-20');
        expect((await db.select('SELECT * FROM tasks WHERE id = $1', [ids[0]]))[0]).toMatchObject({ today_date: '2026-09-20', due_date: '2026-10-01', estimated_hours: 80 });
        await undoTableEdit(undo);
        expect((await db.select('SELECT * FROM tasks WHERE id = $1', [ids[2]]))[0]).toMatchObject({ today_date: null, parent_id: ids[1] });
    });
    it('親のプロジェクト変更は孫まで揃い、取り消しも枝全体へ適用する', async () => {
        const undo = await editTableTasks([ids[0]], 'project_id', projectB);
        expect((await db.select('SELECT project_id FROM tasks WHERE id IN ($1,$2,$3)', ids)).every(row => row.project_id === projectB)).toBe(true);
        expect(undo).toHaveLength(3);
        await undoTableEdit(undo);
        expect((await db.select('SELECT project_id FROM tasks WHERE id IN ($1,$2,$3)', ids)).every(row => row.project_id === projectA)).toBe(true);
    });
    it('プロジェクト変更の読取後に子孫が増えたら枝を一件も変更しない', async () => {
        const execute = db.execute.bind(db);
        let added;
        db.execute = async (sql, params) => {
            if (!added && sql.includes('UPDATE tasks SET project_id')) {
                added = (await execute('INSERT INTO tasks (title, parent_id, project_id) VALUES ($1, $2, $3)', ['直前に増えた子', ids[2], projectA])).lastInsertId;
            }
            return execute(sql, params);
        };
        await expect(editTableTasks([ids[0]], 'project_id', projectB)).rejects.toThrow('階層');
        const rows = await db.select('SELECT project_id FROM tasks WHERE id IN ($1,$2,$3,$4)', [...ids, added]);
        expect(rows.every(row => row.project_id === projectA)).toBe(true);
    });
    it('プロジェクト変更後に同じ所属内で親が変わったら不整合になる取り消しを拒否する', async () => {
        const undo = await editTableTasks([ids[0]], 'project_id', projectB);
        const [otherRoot] = await seedTasks(db, [{ title: '別の親', project_id: projectB }]);
        await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [otherRoot, ids[1]]);
        await expect(undoTableEdit(undo)).rejects.toThrow('その後に編集');
        expect((await db.select('SELECT project_id FROM tasks WHERE id IN ($1,$2,$3)', ids)).every(row => row.project_id === projectB)).toBe(true);
        expect((await db.select('SELECT parent_id FROM tasks WHERE id = $1', [ids[1]]))[0].parent_id).toBe(otherRoot);
    });
    it('プロジェクト変更後に新しい子孫が増えたら枝を分断する取り消しを拒否する', async () => {
        const undo = await editTableTasks([ids[0]], 'project_id', projectB);
        const [newChild] = await seedTasks(db, [{ title: '移動後の子', parent_id: ids[2], project_id: projectB }]);
        await expect(undoTableEdit(undo)).rejects.toThrow('その後に編集');
        const rows = await db.select('SELECT project_id FROM tasks WHERE id IN ($1,$2,$3,$4)', [...ids, newChild]);
        expect(rows.every(row => row.project_id === projectB)).toBe(true);
    });
    it('子だけ別プロジェクトへ移して親子の所属を食い違わせない', async () => {
        await expect(editTableTasks([ids[1]], 'project_id', projectB)).rejects.toThrow('親タスク');
        expect((await db.select('SELECT project_id FROM tasks WHERE id = $1', [ids[2]]))[0].project_id).toBe(projectA);
    });
    it('プロジェクトの未設定化も枝全体に適用し、元へ戻せる', async () => {
        const undo = await editTableTasks([ids[0]], 'project_id', null);
        expect((await db.select('SELECT project_id FROM tasks WHERE id IN ($1,$2,$3)', ids)).every(row => row.project_id === null)).toBe(true);
        await undoTableEdit(undo);
        expect((await db.select('SELECT project_id FROM tasks WHERE id IN ($1,$2,$3)', ids)).every(row => row.project_id === projectA)).toBe(true);
    });
    it('新しい編集があると一括取り消し全体を止める', async () => {
        const undo = await editTableTasks(ids, 'due_date', '2026-10-02');
        await db.execute('UPDATE tasks SET due_date = $1 WHERE id = $2', ['2026-10-03', ids[1]]);
        await expect(undoTableEdit(undo)).rejects.toThrow('その後に編集');
        expect((await db.select('SELECT due_date FROM tasks WHERE id = $1', [ids[0]]))[0].due_date).toBe('2026-10-02');
    });
    it('変更後に一件がアーカイブされたら取り消しを全件止める', async () => {
        const undo = await editTableTasks(ids, 'due_date', '2026-10-02');
        await db.execute("UPDATE tasks SET archived_at = '2026-10-03 10:00:00' WHERE id = $1", [ids[1]]);
        await expect(undoTableEdit(undo)).rejects.toThrow('その後に編集');
        const rows = await db.select('SELECT due_date, archived_at FROM tasks WHERE id IN ($1,$2,$3) ORDER BY id', ids);
        expect(rows.map(row => row.due_date)).toEqual(['2026-10-02', '2026-10-02', '2026-10-02']);
        expect(rows[1].archived_at).toBe('2026-10-03 10:00:00');
    });
    it('対象項目以外の新しい作業記録を保ったまま取り消す', async () => {
        const undo = await editTableTasks(ids, 'due_date', '2026-10-02');
        const workLog = JSON.stringify([{ id: 'new-work', created_at: '2026-10-02 12:00:00', kind: 'step', result: '合意済み' }]);
        await db.execute("UPDATE tasks SET notes = '新しい判断', work_log = $1 WHERE id = $2", [workLog, ids[1]]);
        await undoTableEdit(undo);
        expect((await db.select('SELECT due_date, notes, work_log FROM tasks WHERE id = $1', [ids[1]]))[0]).toEqual({ due_date: null, notes: '新しい判断', work_log: workLog });
    });
    it('完了は履歴日時と次の子の参照を更新し、取り消すと元の参照も戻す', async () => {
        await db.execute('UPDATE tasks SET next_task_id = $1 WHERE id = $2', [ids[2], ids[0]]);
        const undo = await editTableTasks([ids[2]], 'status_code', 3);
        expect((await db.select('SELECT completed_at FROM tasks WHERE id = $1', [ids[2]]))[0].completed_at).toBeTruthy();
        expect((await db.select('SELECT next_task_id FROM tasks WHERE id = $1', [ids[0]]))[0].next_task_id).toBeNull();
        await undoTableEdit(undo);
        expect((await db.select('SELECT next_task_id FROM tasks WHERE id = $1', [ids[0]]))[0].next_task_id).toBe(ids[2]);
    });
    it('親自動完了の既存設定も維持し、取り消しで親の状態も戻る', async () => {
        await db.execute("UPDATE app_settings SET value = '1' WHERE key = 'auto_complete_parent'");
        const undo = await editTableTasks([ids[1], ids[2]], 'status_code', 3);
        expect((await db.select('SELECT status_code FROM tasks WHERE id = $1', [ids[0]]))[0].status_code).toBe(3);
        await undoTableEdit(undo);
        expect((await db.select('SELECT status_code FROM tasks WHERE id = $1', [ids[0]]))[0].status_code).toBe(1);
        expect((await db.select('SELECT completed_at FROM tasks WHERE id IN ($1,$2,$3)', ids)).every(row => row.completed_at == null)).toBe(true);
    });
    it('状態変更時の全体的な無効参照整理を取り消し後にも再検証する', async () => {
        const [unrelated] = await seedTasks(db, [{ title: '無関係', project_id: projectA }]);
        await db.execute('UPDATE tasks SET next_task_id = $1 WHERE id = $2', [999999, unrelated]);
        const undo = await editTableTasks([ids[2]], 'status_code', 3);
        expect((await db.select('SELECT next_task_id FROM tasks WHERE id = $1', [unrelated]))[0].next_task_id).toBeNull();
        await undoTableEdit(undo);
        expect((await db.select('SELECT next_task_id FROM tasks WHERE id = $1', [unrelated]))[0].next_task_id).toBeNull();
        expect((await db.select('SELECT status_code FROM tasks WHERE id = $1', [ids[2]]))[0].status_code).toBe(1);
    });
    it('無効な日付、状態、負の工数を保存しない', async () => {
        await expect(editTableTasks(ids, 'due_date', '2026-02-30')).rejects.toThrow();
        await expect(editTableTasks(ids, 'status_code', 999)).rejects.toThrow();
        await expect(editTableTasks(ids, 'estimated_hours', -1)).rejects.toThrow();
    });
});
