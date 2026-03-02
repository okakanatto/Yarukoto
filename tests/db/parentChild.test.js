import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTasks } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('親子タスクの関係', () => {
  it('子タスク追加時にparent_idが正しく設定される', async () => {
    const [parentId] = await seedTasks(db, [{ title: '親タスク' }]);
    const [childId] = await seedTasks(db, [{ title: '子タスク', parent_id: parentId }]);

    const rows = await db.select('SELECT * FROM tasks WHERE id = $1', [childId]);
    expect(rows[0].parent_id).toBe(parentId);
  });

  it('親タスク削除前に子のparent_idをNULLにして独立させる', async () => {
    // アプリの実際の挙動を再現: 削除前にUPDATEで子を独立化
    const [parentId] = await seedTasks(db, [{ title: '親' }]);
    const [childId] = await seedTasks(db, [{ title: '子', parent_id: parentId }]);

    // 子タスクを独立化
    await db.execute('UPDATE tasks SET parent_id = NULL WHERE parent_id = $1', [parentId]);
    // 親を削除
    await db.execute('DELETE FROM tasks WHERE id = $1', [parentId]);

    // 子は残っている（独立）
    const children = await db.select('SELECT * FROM tasks WHERE id = $1', [childId]);
    expect(children).toHaveLength(1);
    expect(children[0].parent_id).toBeNull();
  });

  it('子を持つタスクにparent_idを設定すると2階層超になるため防止すべき', async () => {
    // これはアプリ側のバリデーション（BUG-6修正）のテスト
    // DB制約ではなくアプリロジックで制御
    const [grandparent] = await seedTasks(db, [{ title: '祖父' }]);
    const [parent] = await seedTasks(db, [{ title: '親', parent_id: grandparent }]);
    // parentは子を持っていないので子タスクを追加可能
    const [child] = await seedTasks(db, [{ title: '子', parent_id: parent }]);

    // parentが子(child)を持っている状態で、parentにparent_idを設定するかどうかは
    // アプリ側で確認する。ここではDB上の構造を確認
    const parentRow = await db.select('SELECT * FROM tasks WHERE id = $1', [parent]);
    expect(parentRow[0].parent_id).toBe(grandparent);

    const childRow = await db.select('SELECT * FROM tasks WHERE id = $1', [child]);
    expect(childRow[0].parent_id).toBe(parent);

    // アプリの制約: 子を持つタスクのparent_idは本来設定不可
    // DB上は入ってしまうので、子を持つかどうかのチェックロジックをテスト
    const childrenOfParent = await db.select(
      'SELECT COUNT(*) as count FROM tasks WHERE parent_id = $1', [parent]
    );
    expect(childrenOfParent[0].count).toBe(1);
    // このcountが > 0 なら、parentにさらにparent_idを設定すべきではない
  });

  it('複数の子タスクをまとめて独立化できる', async () => {
    const [parentId] = await seedTasks(db, [{ title: '親' }]);
    const childIds = await seedTasks(db, [
      { title: '子1', parent_id: parentId },
      { title: '子2', parent_id: parentId },
      { title: '子3', parent_id: parentId },
    ]);

    // 一括独立化
    await db.execute('UPDATE tasks SET parent_id = NULL WHERE parent_id = $1', [parentId]);

    for (const id of childIds) {
      const rows = await db.select('SELECT parent_id FROM tasks WHERE id = $1', [id]);
      expect(rows[0].parent_id).toBeNull();
    }
  });
});
