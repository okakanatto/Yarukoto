import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTasks, seedTags, linkTaskTags } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('タスクのCRUD', () => {
  it('タスクを追加するとDBに保存される', async () => {
    const [id] = await seedTasks(db, [{ title: '買い物に行く' }]);
    const rows = await db.select('SELECT * FROM tasks WHERE id = $1', [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('買い物に行く');
    expect(rows[0].status_code).toBe(1); // デフォルト: 未着手
  });

  it('titleのみ（最低限）でタスク追加できる', async () => {
    const result = await db.execute(
      'INSERT INTO tasks (title) VALUES ($1)',
      ['最小タスク']
    );
    expect(result.lastInsertId).toBeGreaterThan(0);
    const rows = await db.select('SELECT * FROM tasks WHERE id = $1', [result.lastInsertId]);
    expect(rows[0].title).toBe('最小タスク');
    expect(rows[0].status_code).toBe(1);
    expect(rows[0].parent_id).toBeNull();
    expect(rows[0].importance_level).toBeNull();
  });

  it('タスクのフィールドを更新できる', async () => {
    const [id] = await seedTasks(db, [{ title: '元のタイトル', status_code: 1 }]);
    await db.execute(
      'UPDATE tasks SET title = $1, status_code = $2, due_date = $3 WHERE id = $4',
      ['更新後', 2, '2026-03-15', id]
    );
    const rows = await db.select('SELECT * FROM tasks WHERE id = $1', [id]);
    expect(rows[0].title).toBe('更新後');
    expect(rows[0].status_code).toBe(2);
    expect(rows[0].due_date).toBe('2026-03-15');
  });

  it('タスクを削除するとDBから消える', async () => {
    const [id] = await seedTasks(db, [{ title: '削除対象' }]);
    await db.execute('DELETE FROM tasks WHERE id = $1', [id]);
    const rows = await db.select('SELECT * FROM tasks WHERE id = $1', [id]);
    expect(rows).toHaveLength(0);
  });

  it('タスク削除時にtask_tagsも連動して削除される（CASCADE）', async () => {
    const [taskId] = await seedTasks(db, [{ title: 'タグ付きタスク' }]);
    const [tagId] = await seedTags(db, [{ name: '仕事' }]);
    await linkTaskTags(db, taskId, [tagId]);

    // タグ連携が存在する
    let links = await db.select('SELECT * FROM task_tags WHERE task_id = $1', [taskId]);
    expect(links).toHaveLength(1);

    // タスクを削除
    await db.execute('DELETE FROM tasks WHERE id = $1', [taskId]);

    // task_tagsも消える
    links = await db.select('SELECT * FROM task_tags WHERE task_id = $1', [taskId]);
    expect(links).toHaveLength(0);
  });
});
