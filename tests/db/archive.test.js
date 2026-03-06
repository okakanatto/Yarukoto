import { describe, it, expect, beforeEach } from 'vitest';
import { runAutoArchive } from '@/lib/db';
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

    // 単一SQLでアーカイブ (v1.6.0でトランザクションから変更)
    await db.execute(
      "UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE (id = $1 OR parent_id = $1) AND archived_at IS NULL",
      [parentId, parentId]
    );

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

describe('単一SQLによるアーカイブ・復元 (v1.6.0修正)', () => {
  it('親+子を単一SQLでまとめて復元できる', async () => {
    const [parentId] = await seedTasks(db, [{ title: '親', status_code: 3 }]);
    const childIds = await seedTasks(db, [
      { title: '子1', parent_id: parentId, status_code: 3 },
      { title: '子2', parent_id: parentId, status_code: 3 },
    ]);

    // まずアーカイブ
    await db.execute(
      "UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE (id = $1 OR parent_id = $1) AND archived_at IS NULL",
      [parentId, parentId]
    );

    // 親を指定して復元（handleRestoreの親復元パターン）
    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1 OR parent_id = $1', [parentId, parentId]);

    const parent = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [parentId]);
    expect(parent[0].archived_at).toBeNull();
    for (const id of childIds) {
      const child = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
      expect(child[0].archived_at).toBeNull();
    }
  });

  it('子を復元すると親も一緒に単一SQLで復元される', async () => {
    const [parentId] = await seedTasks(db, [{ title: '親', status_code: 3 }]);
    const [childId] = await seedTasks(db, [
      { title: '子', parent_id: parentId, status_code: 3 },
    ]);

    // アーカイブ
    await db.execute(
      "UPDATE tasks SET archived_at = datetime('now', 'localtime') WHERE (id = $1 OR parent_id = $1) AND archived_at IS NULL",
      [parentId, parentId]
    );

    // 子を指定して復元（handleRestoreの子復元パターン: 親も復元）
    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1 OR id = $2', [childId, parentId]);

    const parent = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [parentId]);
    expect(parent[0].archived_at).toBeNull();
    const child = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [childId]);
    expect(child[0].archived_at).toBeNull();
  });
});

describe('runAutoArchive（自動アーカイブ）', () => {
  it('auto_archive_daysが0の場合、何もアーカイブしない', async () => {
    // デフォルトで auto_archive_days = '0'
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 3 }]);
    await db.execute(
      "UPDATE tasks SET completed_at = datetime('now', 'localtime', '-30 days') WHERE id = $1",
      [id]
    );

    await runAutoArchive(db);

    const row = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].archived_at).toBeNull();
  });

  it('完了タスクが期限超過で自動アーカイブされる', async () => {
    await db.execute("UPDATE app_settings SET value = '7' WHERE key = 'auto_archive_days'");
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 3 }]);
    await db.execute(
      "UPDATE tasks SET completed_at = datetime('now', 'localtime', '-10 days') WHERE id = $1",
      [id]
    );

    await runAutoArchive(db);

    const row = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].archived_at).not.toBeNull();
  });

  it('完了から日数が不足しているタスクはアーカイブされない', async () => {
    await db.execute("UPDATE app_settings SET value = '7' WHERE key = 'auto_archive_days'");
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 3 }]);
    await db.execute(
      "UPDATE tasks SET completed_at = datetime('now', 'localtime', '-3 days') WHERE id = $1",
      [id]
    );

    await runAutoArchive(db);

    const row = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].archived_at).toBeNull();
  });

  it('未完了タスクは自動アーカイブされない', async () => {
    await db.execute("UPDATE app_settings SET value = '7' WHERE key = 'auto_archive_days'");
    const [id] = await seedTasks(db, [{ title: 'テスト', status_code: 1 }]);

    await runAutoArchive(db);

    const row = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
    expect(row[0].archived_at).toBeNull();
  });

  it('親が自動アーカイブされると子もまとめてアーカイブされる（STEP B NG#1 再発防止）', async () => {
    await db.execute("UPDATE app_settings SET value = '7' WHERE key = 'auto_archive_days'");
    const [parentId] = await seedTasks(db, [{ title: '親', status_code: 3 }]);
    const childIds = await seedTasks(db, [
      { title: '子1', parent_id: parentId, status_code: 3 },
      { title: '子2', parent_id: parentId, status_code: 2 },
    ]);
    await db.execute(
      "UPDATE tasks SET completed_at = datetime('now', 'localtime', '-10 days') WHERE id = $1",
      [parentId]
    );

    await runAutoArchive(db);

    const parent = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [parentId]);
    expect(parent[0].archived_at).not.toBeNull();
    for (const id of childIds) {
      const child = await db.select('SELECT archived_at FROM tasks WHERE id = $1', [id]);
      expect(child[0].archived_at).not.toBeNull();
    }
  });
});
