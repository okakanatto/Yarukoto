import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTasks, seedProject, seedRoutine } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('projectsテーブルのスキーマ', () => {
  it('projectsテーブルが作成されている', async () => {
    const tables = await db.select(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    );
    expect(tables).toHaveLength(1);
  });

  it('デフォルト「General」プロジェクトがシードされている', async () => {
    const rows = await db.select('SELECT * FROM projects WHERE is_default = 1');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('General');
    expect(rows[0].is_default).toBe(1);
  });

  it('tasks.project_idカラムが存在する', async () => {
    const cols = await db.select("PRAGMA table_info(tasks)");
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('project_id');
  });

  it('routines.project_idカラムが存在する', async () => {
    const cols = await db.select("PRAGMA table_info(routines)");
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('project_id');
  });

  it('project_idのインデックスが作成されている', async () => {
    const indexes = await db.select(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%project%'"
    );
    const names = indexes.map(i => i.name);
    expect(names).toContain('idx_tasks_project_id');
    expect(names).toContain('idx_routines_project_id');
  });
});

describe('プロジェクトのCRUD', () => {
  it('プロジェクトを追加できる', async () => {
    const id = await seedProject(db, { name: '開発', color: '#ef4444' });
    const rows = await db.select('SELECT * FROM projects WHERE id = $1', [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('開発');
    expect(rows[0].color).toBe('#ef4444');
    expect(rows[0].is_default).toBe(0);
  });

  it('プロジェクトのフィールドを更新できる', async () => {
    const id = await seedProject(db, { name: '元の名前' });
    await db.execute(
      'UPDATE projects SET name = $1, color = $2 WHERE id = $3',
      ['更新後', '#22c55e', id]
    );
    const rows = await db.select('SELECT * FROM projects WHERE id = $1', [id]);
    expect(rows[0].name).toBe('更新後');
    expect(rows[0].color).toBe('#22c55e');
  });

  it('プロジェクトを削除できる', async () => {
    const id = await seedProject(db, { name: '削除対象' });
    await db.execute('DELETE FROM projects WHERE id = $1', [id]);
    const rows = await db.select('SELECT * FROM projects WHERE id = $1', [id]);
    expect(rows).toHaveLength(0);
  });

  it('プロジェクトをアーカイブできる', async () => {
    const id = await seedProject(db, { name: 'アーカイブ対象' });
    await db.execute(
      "UPDATE projects SET archived_at = datetime('now', 'localtime') WHERE id = $1",
      [id]
    );
    const rows = await db.select('SELECT * FROM projects WHERE id = $1', [id]);
    expect(rows[0].archived_at).not.toBeNull();
  });
});

describe('タスク・ルーティンとプロジェクトの紐付け', () => {
  it('タスクにproject_idを設定できる', async () => {
    const projId = await seedProject(db, { name: 'プロジェクトA' });
    const [taskId] = await seedTasks(db, [{ title: 'タスク1', project_id: projId }]);
    const rows = await db.select('SELECT project_id FROM tasks WHERE id = $1', [taskId]);
    expect(rows[0].project_id).toBe(projId);
  });

  it('ルーティンにproject_idを設定できる', async () => {
    const projId = await seedProject(db, { name: 'プロジェクトB' });
    const routineId = await seedRoutine(db, { title: 'ルーティン1', project_id: projId });
    const rows = await db.select('SELECT project_id FROM routines WHERE id = $1', [routineId]);
    expect(rows[0].project_id).toBe(projId);
  });

  it('プロジェクト別にタスクをフィルタできる', async () => {
    const projA = await seedProject(db, { name: 'A' });
    const projB = await seedProject(db, { name: 'B' });
    await seedTasks(db, [
      { title: 'タスクA1', project_id: projA },
      { title: 'タスクA2', project_id: projA },
      { title: 'タスクB1', project_id: projB },
    ]);
    const tasksA = await db.select('SELECT * FROM tasks WHERE project_id = $1', [projA]);
    const tasksB = await db.select('SELECT * FROM tasks WHERE project_id = $1', [projB]);
    expect(tasksA).toHaveLength(2);
    expect(tasksB).toHaveLength(1);
  });

  it('タスクとプロジェクトをJOINで取得できる', async () => {
    const projId = await seedProject(db, { name: '開発', color: '#ef4444' });
    const [taskId] = await seedTasks(db, [{ title: 'JOIN確認用', project_id: projId }]);
    const rows = await db.select(
      `SELECT t.*, p.name AS project_name, p.color AS project_color
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1`,
      [taskId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].project_name).toBe('開発');
    expect(rows[0].project_color).toBe('#ef4444');
  });
});
