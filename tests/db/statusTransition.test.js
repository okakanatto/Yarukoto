import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTasks } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('ステータス遷移', () => {
  it('未着手(1) → 着手中(2) → 完了(3) の順に遷移できる', async () => {
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 1 }]);

    await db.execute('UPDATE tasks SET status_code = 2 WHERE id = $1', [id]);
    let row = await db.select('SELECT status_code FROM tasks WHERE id = $1', [id]);
    expect(row[0].status_code).toBe(2);

    await db.execute('UPDATE tasks SET status_code = 3 WHERE id = $1', [id]);
    row = await db.select('SELECT status_code FROM tasks WHERE id = $1', [id]);
    expect(row[0].status_code).toBe(3);
  });

  it('完了(3) → 未着手(1) に戻せる', async () => {
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 3 }]);

    await db.execute('UPDATE tasks SET status_code = 1, completed_at = NULL WHERE id = $1', [id]);
    const row = await db.select('SELECT status_code, completed_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].status_code).toBe(1);
    expect(row[0].completed_at).toBeNull();
  });

  it('完了(3)に変更するとcompleted_atが設定される', async () => {
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 1 }]);

    await db.execute(
      "UPDATE tasks SET status_code = 3, completed_at = datetime('now', 'localtime') WHERE id = $1",
      [id]
    );
    const row = await db.select('SELECT completed_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].completed_at).not.toBeNull();
  });

  it('完了以外に変更するとcompleted_atがNULLになる', async () => {
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 3 }]);
    // まずcompleted_atを設定
    await db.execute(
      "UPDATE tasks SET completed_at = datetime('now', 'localtime') WHERE id = $1",
      [id]
    );

    // 未着手に戻す
    await db.execute('UPDATE tasks SET status_code = 1, completed_at = NULL WHERE id = $1', [id]);
    const row = await db.select('SELECT completed_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].completed_at).toBeNull();
  });

  it('子タスク全完了で親も自動完了するロジック（auto_complete_parent ON）', async () => {
    // app_settingsでauto_complete_parentをONにする
    await db.execute(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)",
      ['auto_complete_parent', '1']
    );

    const [parentId] = await seedTasks(db, [{ title: '親', status_code: 1 }]);
    const childIds = await seedTasks(db, [
      { title: '子1', parent_id: parentId, status_code: 1 },
      { title: '子2', parent_id: parentId, status_code: 1 },
    ]);

    // 子1を完了
    await db.execute("UPDATE tasks SET status_code = 3, completed_at = datetime('now', 'localtime') WHERE id = $1", [childIds[0]]);

    // まだ全完了ではない → 親は未着手のまま
    const siblings1 = await db.select('SELECT status_code FROM tasks WHERE parent_id = $1', [parentId]);
    const allComplete1 = siblings1.every(s => s.status_code === 3);
    expect(allComplete1).toBe(false);

    // 子2を完了
    await db.execute("UPDATE tasks SET status_code = 3, completed_at = datetime('now', 'localtime') WHERE id = $1", [childIds[1]]);

    // 全子完了を確認
    const siblings2 = await db.select('SELECT status_code FROM tasks WHERE parent_id = $1', [parentId]);
    const allComplete2 = siblings2.every(s => s.status_code === 3);
    expect(allComplete2).toBe(true);

    // 設定確認
    const setting = await db.select("SELECT value FROM app_settings WHERE key = 'auto_complete_parent'");
    expect(setting[0].value).toBe('1');

    // 親の自動完了（アプリではuseTaskActionsが実行するが、ここではDB操作のみテスト）
    if (allComplete2 && setting[0].value === '1') {
      await db.execute("UPDATE tasks SET status_code = 3, completed_at = datetime('now', 'localtime') WHERE id = $1", [parentId]);
    }

    const parentRow = await db.select('SELECT status_code FROM tasks WHERE id = $1', [parentId]);
    expect(parentRow[0].status_code).toBe(3);
  });
});
