import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedTasks, seedProject } from '../__helpers__/testDb';
import { reparentTask, archiveSubtree, restoreTaskTree, autoCompleteAncestors, clearInvalidNextTasks } from '@/lib/taskHierarchy';
let db;
beforeEach(async () => { db = await createTestDb(); });
async function tree() {
    const [root] = await seedTasks(db, [{ title: '決める', project_id: 1 }]);
    const [child] = await seedTasks(db, [{ title: '調べる', parent_id: root, project_id: 1 }]);
    const [leaf] = await seedTasks(db, [{ title: '照合', parent_id: child, project_id: 1 }]);
    return { root, child, leaf };
}
describe('階層操作の実DB整合性', () => {
    it('三階層の枝全体のプロジェクトを移動し、孫への循環を拒否する', async () => {
        const { root, child, leaf } = await tree();
        const project = await seedProject(db, { name: '別の仕事' });
        const [target] = await seedTasks(db, [{ title: '別の親', project_id: project }]);
        await reparentTask(db, root, target);
        expect((await db.select('SELECT project_id FROM tasks WHERE id IN ($1,$2,$3)', [root, child, leaf])).map(t => t.project_id)).toEqual([project, project, project]);
        await expect(reparentTask(db, root, leaf)).rejects.toThrow('子孫');
        expect((await db.select('SELECT parent_id FROM tasks WHERE id = $1', [root]))[0].parent_id).toBe(target);
    });
    it('未完了孫がある親は拒否し、全完了後は枝を保存し、孫から全祖先を復元する', async () => {
        const { root, child, leaf } = await tree();
        await db.execute('UPDATE tasks SET status_code = 3 WHERE id != $1', [leaf]);
        await expect(archiveSubtree(db, root)).rejects.toThrow('未完了');
        expect(await db.select('SELECT id FROM tasks WHERE archived_at IS NOT NULL')).toEqual([]);
        await db.execute('UPDATE tasks SET status_code = 3 WHERE id = $1', [leaf]);
        expect(new Set(await archiveSubtree(db, root))).toEqual(new Set([root, child, leaf]));
        await restoreTaskTree(db, leaf);
        expect(await db.select('SELECT id FROM tasks WHERE archived_at IS NOT NULL')).toEqual([]);
    });
    it('親自動完了は設定OFFでは動かず、ONでは孫完了から祖先へ伝わる', async () => {
        const { root, child, leaf } = await tree();
        await db.execute('UPDATE tasks SET status_code = 3 WHERE id = $1', [leaf]);
        expect(await autoCompleteAncestors(db, leaf)).toEqual([]);
        await db.execute("UPDATE app_settings SET value = '1' WHERE key = 'auto_complete_parent'");
        expect(await autoCompleteAncestors(db, leaf)).toEqual([child, root]);
    });
    it('途中の子が完了でも別枝の未完了孫があれば祖先を自動完了しない', async () => {
        const { root, child, leaf } = await tree();
        const [other] = await seedTasks(db, [{ title: 'もう一枝', parent_id: root, status_code: 3 }]);
        await db.execute('UPDATE tasks SET status_code = 3 WHERE id = $1', [child]);
        await db.execute("UPDATE app_settings SET value = '1' WHERE key = 'auto_complete_parent'");
        expect(await autoCompleteAncestors(db, other)).toEqual([]);
        expect((await db.select('SELECT status_code FROM tasks WHERE id = $1', [leaf]))[0].status_code).toBe(1);
    });
    it('枝を外したとき移動元の次の一手を解除する', async () => {
        const { root, child, leaf } = await tree();
        await db.execute('UPDATE tasks SET next_task_id = $1 WHERE id = $2', [leaf, root]);
        await reparentTask(db, child, null, 1);
        expect((await db.select('SELECT next_task_id FROM tasks WHERE id = $1', [root]))[0].next_task_id).toBeNull();
        await db.execute('UPDATE tasks SET next_task_id = $1 WHERE id = $2', [leaf, child]);
        await db.execute('UPDATE tasks SET status_code = 3 WHERE id = $1', [leaf]);
        await clearInvalidNextTasks(db);
        expect((await db.select('SELECT next_task_id FROM tasks WHERE id = $1', [child]))[0].next_task_id).toBeNull();
    });
});
