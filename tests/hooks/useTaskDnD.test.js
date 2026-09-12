/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskDnD } from '@/hooks/useTaskDnD';
import { createTestDb, seedTasks, seedProject } from '../__helpers__/testDb.js';
let db;
beforeEach(async () => { db = await createTestDb(); });
const setup = tasks => {
    const setTasks = vi.fn(), fetchTasks = vi.fn();
    const hook = renderHook(() => useTaskDnD({
        tasks, setTasks, fetchTasks, sortMode: 'manual',
        getSortedParentTasks: () => tasks.filter(t => !t.parent_id),
        getChildTasks: pid => tasks.filter(t => t.parent_id === pid),
    }));
    return { ...hook, fetchTasks };
};
describe('階層DnD', () => {
    it('子を持つ枝を別の子の下へ移動して全子孫のプロジェクトを同期する', async () => {
        const [root] = await seedTasks(db, [{ title: '元の親', project_id: 1 }]);
        const [child] = await seedTasks(db, [{ title: '子', parent_id: root, project_id: 1 }]);
        const project = await seedProject(db, { name: '別プロジェクト' });
        const [targetRoot] = await seedTasks(db, [{ title: '別の親', project_id: project }]);
        const [target] = await seedTasks(db, [{ title: '移動先の子', parent_id: targetRoot, project_id: project }]);
        const { result } = setup(await db.select('SELECT * FROM tasks'));
        await act(async () => { await result.current.handleDragEnd({ active: { id: root }, over: { id: target } }); });
        expect((await db.select('SELECT parent_id FROM tasks WHERE id = $1', [root]))[0].parent_id).toBe(target);
        expect((await db.select('SELECT project_id FROM tasks WHERE id = $1', [child]))[0].project_id).toBe(project);
    });
    it('フィルタで中間の子がないときもDB上の子孫を検証して循環を拒否する', async () => {
        const [root] = await seedTasks(db, [{ title: '親' }]);
        const [child] = await seedTasks(db, [{ title: '子', parent_id: root }]);
        const [leaf] = await seedTasks(db, [{ title: '孫', parent_id: child }]);
        const { result, fetchTasks } = setup(await db.select('SELECT * FROM tasks WHERE id != $1', [child]));
        await act(async () => { await result.current.handleDragEnd({ active: { id: root }, over: { id: leaf } }); });
        expect((await db.select('SELECT parent_id FROM tasks WHERE id = $1', [root]))[0].parent_id).toBeNull();
        expect(fetchTasks).toHaveBeenCalled();
    });
    it('移動SQLが失敗したら親だけ変更した状態を残さず一覧を再取得する', async () => {
        const [root, target] = await seedTasks(db, [{ title: '親', project_id: 1 }, { title: '移動先', project_id: 1 }]);
        const { result, fetchTasks } = setup(await db.select('SELECT * FROM tasks'));
        const execute = db.execute.bind(db);
        db.execute = async (sql, params) => {
            if (sql.includes('parent_id = CASE')) throw new Error('Simulated write failure');
            return execute(sql, params);
        };
        await act(async () => { await result.current.handleDragEnd({ active: { id: root }, over: { id: target } }); });
        expect((await db.select('SELECT parent_id FROM tasks WHERE id = $1', [root]))[0].parent_id).toBeNull();
        expect(fetchTasks).toHaveBeenCalled();
    });
    it('孫を同じ親内で手動並べ替えして階層を変えない', async () => {
        const [root] = await seedTasks(db, [{ title: '親' }]);
        const [child] = await seedTasks(db, [{ title: '子', parent_id: root }]);
        const [a, b] = await seedTasks(db, [{ title: '孫A', parent_id: child }, { title: '孫B', parent_id: child }]);
        const { result } = setup(await db.select('SELECT * FROM tasks ORDER BY id'));
        await act(async () => { await result.current.handleDragEnd({ active: { id: b }, over: { id: `reorder-child-${child}-0` } }); });
        const rows = await db.select('SELECT id, parent_id FROM tasks WHERE parent_id = $1 ORDER BY sort_order', [child]);
        expect(rows.map(t => t.id)).toEqual([b, a]);
        expect(rows.every(t => t.parent_id === child)).toBe(true);
    });
});
