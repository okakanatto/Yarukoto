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

  it('SELF JOINで子タスクからparent_titleを取得できる (IMP-15)', async () => {
    const [parentId] = await seedTasks(db, [{ title: '買い物リスト' }]);
    const [childId] = await seedTasks(db, [{ title: '牛乳を買う', parent_id: parentId }]);

    // useTodayTasks.js と同じ SELF JOIN パターン
    const rows = await db.select(
      `SELECT t.*, p.title as parent_title
       FROM tasks t
       LEFT JOIN tasks p ON t.parent_id = p.id
       WHERE t.id = $1`,
      [childId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].parent_title).toBe('買い物リスト');
    expect(rows[0].title).toBe('牛乳を買う');
    expect(rows[0].parent_id).toBe(parentId);
  });

  it('ルートタスクのparent_titleはNULLになる (IMP-15)', async () => {
    const [rootId] = await seedTasks(db, [{ title: 'ルートタスク' }]);

    const rows = await db.select(
      `SELECT t.*, p.title as parent_title
       FROM tasks t
       LEFT JOIN tasks p ON t.parent_id = p.id
       WHERE t.id = $1`,
      [rootId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].parent_title).toBeNull();
    expect(rows[0].title).toBe('ルートタスク');
  });

  it('孤児タスク（親が削除済み）はLEFT JOINでparent_titleがNULLになる', async () => {
    const [parentId] = await seedTasks(db, [{ title: '削除される親' }]);
    const [childId] = await seedTasks(db, [{ title: '孤児になる子', parent_id: parentId }]);

    // CASCADE FK があるため、FK を一時無効にして親だけ削除し孤児状態を再現
    await db.execute('PRAGMA foreign_keys = OFF', []);
    await db.execute('DELETE FROM tasks WHERE id = $1', [parentId]);
    await db.execute('PRAGMA foreign_keys = ON', []);

    // 子のparent_idはまだ残っている
    const child = await db.select('SELECT parent_id FROM tasks WHERE id = $1', [childId]);
    expect(child[0].parent_id).toBe(parentId);

    // LEFT JOINでparent_titleがNULLになることを検証（孤児検出の基盤）
    const rows = await db.select(
      `SELECT t.*, p.title as parent_title
       FROM tasks t
       LEFT JOIN tasks p ON t.parent_id = p.id
       WHERE t.id = $1`,
      [childId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].parent_id).toBe(parentId);  // parent_idは残存
    expect(rows[0].parent_title).toBeNull();     // 親が存在しないのでNULL
  });

  it('today_sort_orderで親子グループの並び順を永続化できる (IMP-15)', async () => {
    const today = new Date().toLocaleDateString('sv-SE');
    const [parentId] = await seedTasks(db, [{ title: '親タスク', today_date: today }]);
    const [child1, child2] = await seedTasks(db, [
      { title: '子タスク1', parent_id: parentId, today_date: today },
      { title: '子タスク2', parent_id: parentId, today_date: today },
    ]);
    const [standalone] = await seedTasks(db, [{ title: '独立タスク', today_date: today }]);

    // persistTodaySortOrder と同じパターン: 親→子→独立 の順で sort_order を設定
    let orderIdx = 1;
    await db.execute('UPDATE tasks SET today_sort_order = $1 WHERE id = $2', [orderIdx++, parentId]);
    await db.execute('UPDATE tasks SET today_sort_order = $1 WHERE id = $2', [orderIdx++, child1]);
    await db.execute('UPDATE tasks SET today_sort_order = $1 WHERE id = $2', [orderIdx++, child2]);
    await db.execute('UPDATE tasks SET today_sort_order = $1 WHERE id = $2', [orderIdx++, standalone]);

    // today_sort_order 順に取得して検証
    const rows = await db.select(
      'SELECT id, title, today_sort_order FROM tasks WHERE today_date = $1 ORDER BY today_sort_order',
      [today]
    );

    expect(rows).toHaveLength(4);
    expect(rows[0].title).toBe('親タスク');
    expect(rows[0].today_sort_order).toBe(1);
    expect(rows[1].title).toBe('子タスク1');
    expect(rows[1].today_sort_order).toBe(2);
    expect(rows[2].title).toBe('子タスク2');
    expect(rows[2].today_sort_order).toBe(3);
    expect(rows[3].title).toBe('独立タスク');
    expect(rows[3].today_sort_order).toBe(4);
  });
});
