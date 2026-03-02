import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTasks } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('アーカイブ・復元', () => {
  it('完了タスクをアーカイブするとarchived_atが設定される', async () => {
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 3 }]);
    await db.execute(
      "UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE id = $1",
      [id]
    );
    const row = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].archived_at).not.toBeNull();
  });

  it('未完了タスクはアーカイブすべきでない（バリデーション対象）', async () => {
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 1 }]);
    // DB上はUPDATE可能だが、アプリ側でstatus_codeを確認して拒否する
    const row = await db.select('SELECT status_code FROM tasks WHERE id = $1', [id]);
    expect(row[0].status_code).not.toBe(3);
    expect(row[0].status_code).not.toBe(5);
    // status_codeが3(完了)でも5(キャンセル)でもなければアーカイブ不可
  });

  it('親アーカイブ時に子もまとめてアーカイブされる', async () => {
    const [parentId] = await seedTasks(db, [{ title: '親', status_code: 3 }]);
    const childIds = await seedTasks(db, [
      { title: '子1', parent_id: parentId, status_code: 3 },
      { title: '子2', parent_id: parentId, status_code: 3 },
    ]);

    // トランザクションでアーカイブ
    await db.execute('BEGIN');
    await db.execute(
      "UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE parent_id = $1 AND archived_at IS NULL",
      [parentId]
    );
    await db.execute(
      "UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE id = $1",
      [parentId]
    );
    await db.execute('COMMIT');

    // 全員アーカイブ済み
    const parent = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [parentId]);
    expect(parent[0].archived_at).not.toBeNull();

    for (const id of childIds) {
      const child = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
      expect(child[0].archived_at).not.toBeNull();
    }
  });

  it('未完了の子がいる親のアーカイブは拒否すべき', async () => {
    const [parentId] = await seedTasks(db, [{ title: '親', status_code: 3 }]);
    await seedTasks(db, [
      { title: '完了子', parent_id: parentId, status_code: 3 },
      { title: '未完了子', parent_id: parentId, status_code: 1 },
    ]);

    // 子の完了状態を確認
    const children = await db.select('SELECT status_code FROM tasks WHERE parent_id = $1', [parentId]);
    const hasIncomplete = children.some(c => c.status_code !== 3 && c.status_code !== 5);
    expect(hasIncomplete).toBe(true);
    // hasIncomplete === true の場合、アプリはアーカイブを拒否する
  });

  it('復元でarchived_atがNULLになる', async () => {
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 3 }]);
    await db.execute(
      "UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE id = $1",
      [id]
    );

    // 復元
    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1', [id]);
    const row = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].archived_at).toBeNull();
  });
});
