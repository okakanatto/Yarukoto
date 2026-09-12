/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createTestDb, seedTasks } from '../__helpers__/testDb';
import { useArchiveActions } from '@/hooks/useArchiveActions';
import { useStatusActions } from '@/hooks/useStatusActions';

let db;
beforeEach(async () => { db = await createTestDb(); });
async function tree() {
    const [root] = await seedTasks(db, [{ title: '判断を終える', status_code: 3 }]);
    const [child] = await seedTasks(db, [{ title: '調べる', status_code: 3, parent_id: root }]);
    const [grandchild] = await seedTasks(db, [{ title: '元データ確認', parent_id: child }]);
    return { root, child, grandchild };
}
describe('三階層の既存操作の安全性', () => {
    it('完了済みの子の下に未完了の孫があれば親をアーカイブしない', async () => {
        const { child } = await tree();
        const tasks = await db.select('SELECT * FROM tasks');
        const { result } = renderHook(() => useArchiveActions({ getTasks: () => tasks, setTasks: vi.fn(), fetchTasks: vi.fn() }));
        await act(async () => { await result.current.handleArchive(child); });
        expect((await db.select('SELECT id FROM tasks WHERE archived_at IS NOT NULL'))).toEqual([]);
    });
    it('中間タスクを削除しても孫とその下のタスクを消さない', async () => {
        const { child, grandchild } = await tree();
        const [leaf] = await seedTasks(db, [{ title: '照合', parent_id: grandchild }]);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const { result } = renderHook(() => useStatusActions({ setTasks: vi.fn(), fetchTasks: vi.fn(), refresh: vi.fn() }));
        await act(async () => { await result.current.handleDelete(child); });
        expect((await db.select('SELECT parent_id FROM tasks WHERE id = $1', [grandchild]))[0].parent_id).toBeNull();
        expect((await db.select('SELECT parent_id FROM tasks WHERE id = $1', [leaf]))[0].parent_id).toBe(grandchild);
    });
});
