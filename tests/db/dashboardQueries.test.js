import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTasks, seedRoutine, seedProject } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('ダッシュボード — サマリークエリ', () => {
  it('月/週/今日の完了・追加をカウントできる', async () => {
    // 2026-03-09 (月) に作成、2026-03-10 (火) に完了するタスク
    const [id1, id2, id3] = await seedTasks(db, [
      { title: 'タスクA', status_code: 3 },
      { title: 'タスクB', status_code: 3 },
      { title: 'タスクC', status_code: 1 },
    ]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-09 10:00:00', completed_at = '2026-03-10 15:00:00' WHERE id = $1", [id1]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-10 09:00:00', completed_at = '2026-03-10 17:00:00' WHERE id = $2", [id2]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-10 08:00:00' WHERE id = $3", [id3]);

    const rows = await db.select(`
      SELECT
        SUM(CASE WHEN date(completed_at) >= $1 THEN 1 ELSE 0 END) as month_completed,
        SUM(CASE WHEN date(created_at) >= $2 THEN 1 ELSE 0 END) as month_created,
        SUM(CASE WHEN date(completed_at) >= $3 THEN 1 ELSE 0 END) as week_completed,
        SUM(CASE WHEN date(created_at) >= $4 THEN 1 ELSE 0 END) as week_created,
        SUM(CASE WHEN date(completed_at) = $5 THEN 1 ELSE 0 END) as today_completed,
        SUM(CASE WHEN date(created_at) = $6 THEN 1 ELSE 0 END) as today_created
      FROM tasks
      WHERE archived_at IS NULL AND status_code != 5
    `, ['2026-03-01', '2026-03-01', '2026-03-09', '2026-03-09', '2026-03-10', '2026-03-10']);

    expect(rows[0].month_completed).toBe(2);
    expect(rows[0].month_created).toBe(3);
    expect(rows[0].week_completed).toBe(2);
    expect(rows[0].week_created).toBe(3);
    expect(rows[0].today_completed).toBe(2);
    expect(rows[0].today_created).toBe(2); // id2 and id3 created today
  });

  it('アーカイブ済みタスクはサマリーに含まれない', async () => {
    const [id1] = await seedTasks(db, [{ title: 'アーカイブ済み', status_code: 3 }]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-10 10:00:00', completed_at = '2026-03-10 15:00:00', archived_at = '2026-03-10 16:00:00' WHERE id = $1", [id1]);

    const rows = await db.select(`
      SELECT
        SUM(CASE WHEN date(completed_at) = $1 THEN 1 ELSE 0 END) as today_completed,
        SUM(CASE WHEN date(created_at) = $2 THEN 1 ELSE 0 END) as today_created
      FROM tasks
      WHERE archived_at IS NULL AND status_code != 5
    `, ['2026-03-10', '2026-03-10']);

    // SUM() over zero matching rows returns null; production code handles via || 0
    expect(rows[0].today_completed).toBeNull();
    expect(rows[0].today_created).toBeNull();
  });

  it('キャンセル(status_code=5)はサマリーに含まれない', async () => {
    const [id1] = await seedTasks(db, [{ title: 'キャンセル', status_code: 5 }]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-10 10:00:00' WHERE id = $1", [id1]);

    const rows = await db.select(`
      SELECT
        SUM(CASE WHEN date(created_at) = $1 THEN 1 ELSE 0 END) as today_created
      FROM tasks
      WHERE archived_at IS NULL AND status_code != 5
    `, ['2026-03-10']);

    // SUM() over zero matching rows returns null; production code handles via || 0
    expect(rows[0].today_created).toBeNull();
  });

  it('ルーティン完了もサマリーに加算できる', async () => {
    const r1 = await seedRoutine(db, { title: 'ルーティンA' });
    const r2 = await seedRoutine(db, { title: 'ルーティンB' });
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [r1, '2026-03-10']);
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [r2, '2026-03-10']);
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [r1, '2026-03-09']);

    const rows = await db.select(`
      SELECT
        SUM(CASE WHEN completion_date >= $1 THEN 1 ELSE 0 END) as month_completed,
        SUM(CASE WHEN completion_date >= $2 THEN 1 ELSE 0 END) as week_completed,
        SUM(CASE WHEN completion_date = $3 THEN 1 ELSE 0 END) as today_completed
      FROM routine_completions
    `, ['2026-03-01', '2026-03-09', '2026-03-10']);

    expect(rows[0].month_completed).toBe(3);
    expect(rows[0].week_completed).toBe(3);
    expect(rows[0].today_completed).toBe(2);
  });
});

describe('ダッシュボード — プロジェクト別内訳クエリ', () => {
  it('プロジェクト別の完了・追加をカウントできる', async () => {
    const projA = await seedProject(db, { name: 'プロジェクトA', color: '#ef4444' });
    const projB = await seedProject(db, { name: 'プロジェクトB', color: '#3b82f6' });

    const [id1, id2] = await seedTasks(db, [
      { title: 'タスク1', status_code: 3, project_id: projA },
      { title: 'タスク2', status_code: 1, project_id: projB },
    ]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-10 10:00:00', completed_at = '2026-03-10 15:00:00' WHERE id = $1", [id1]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-10 09:00:00' WHERE id = $2", [id2]);

    const rows = await db.select(`
      SELECT
        p.id, p.name, p.color,
        SUM(CASE WHEN date(t.completed_at) >= $1 THEN 1 ELSE 0 END) as month_completed,
        SUM(CASE WHEN date(t.created_at) >= $2 THEN 1 ELSE 0 END) as month_created
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.archived_at IS NULL AND t.status_code != 5
      WHERE p.archived_at IS NULL
      GROUP BY p.id
    `, ['2026-03-01', '2026-03-01']);

    const pA = rows.find(r => r.name === 'プロジェクトA');
    const pB = rows.find(r => r.name === 'プロジェクトB');
    expect(pA.month_completed).toBe(1);
    expect(pA.month_created).toBe(1);
    expect(pB.month_completed).toBe(0);
    expect(pB.month_created).toBe(1);
  });

  it('活動のないプロジェクトは内訳上位から除外される', async () => {
    const projA = await seedProject(db, { name: '活動あり', color: '#ef4444' });
    await seedProject(db, { name: '活動なし', color: '#9CA3AF' });

    const [id1] = await seedTasks(db, [{ title: 'タスク1', status_code: 3, project_id: projA }]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-10 10:00:00', completed_at = '2026-03-10 15:00:00' WHERE id = $1", [id1]);

    const rows = await db.select(`
      SELECT
        p.id, p.name,
        SUM(CASE WHEN date(t.completed_at) >= $1 THEN 1 ELSE 0 END) as month_completed,
        SUM(CASE WHEN date(t.created_at) >= $2 THEN 1 ELSE 0 END) as month_created
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.archived_at IS NULL AND t.status_code != 5
      WHERE p.archived_at IS NULL
      GROUP BY p.id
    `, ['2026-03-01', '2026-03-01']);

    // Filter to active projects (like the production code does)
    const active = rows
      .map(p => ({ ...p, monthActivity: (p.month_completed || 0) + (p.month_created || 0) }))
      .filter(p => p.monthActivity > 0);

    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('活動あり');
  });

  it('上位5プロジェクト+その他にグルーピングできる', async () => {
    // 7プロジェクトを作成（上位5 + その他2）
    const projects = [];
    for (let i = 1; i <= 7; i++) {
      const pId = await seedProject(db, { name: `Proj${i}`, color: `#${i}${i}${i}` });
      projects.push(pId);
    }

    // 各プロジェクトにタスクを追加（月活動量でソートするため異なる件数）
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j <= i; j++) {
        const [tid] = await seedTasks(db, [{ title: `T${i}-${j}`, status_code: 1, project_id: projects[i] }]);
        await db.execute("UPDATE tasks SET created_at = '2026-03-10 10:00:00' WHERE id = $1", [tid]);
      }
    }

    const rows = await db.select(`
      SELECT
        p.id, p.name,
        SUM(CASE WHEN date(t.created_at) >= $1 THEN 1 ELSE 0 END) as month_created,
        SUM(CASE WHEN date(t.completed_at) >= $2 THEN 1 ELSE 0 END) as month_completed
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.archived_at IS NULL AND t.status_code != 5
      WHERE p.archived_at IS NULL
      GROUP BY p.id
    `, ['2026-03-01', '2026-03-01']);

    const sorted = rows
      .map(p => ({ ...p, monthActivity: (p.month_completed || 0) + (p.month_created || 0) }))
      .filter(p => p.monthActivity > 0)
      .sort((a, b) => b.monthActivity - a.monthActivity);

    const top5 = sorted.slice(0, 5);
    const others = sorted.slice(5);

    expect(top5).toHaveLength(5);
    expect(others).toHaveLength(2);
    // Top project should have 7 tasks (i=6, j=0..6)
    expect(top5[0].monthActivity).toBe(7);
  });
});

describe('ダッシュボード — 日別チャートデータクエリ', () => {
  it('日別の完了・追加件数を集計できる', async () => {
    const [id1, id2, id3] = await seedTasks(db, [
      { title: 'A', status_code: 3 },
      { title: 'B', status_code: 3 },
      { title: 'C', status_code: 1 },
    ]);
    await db.execute("UPDATE tasks SET completed_at = '2026-03-01 10:00:00' WHERE id = $1", [id1]);
    await db.execute("UPDATE tasks SET completed_at = '2026-03-01 14:00:00' WHERE id = $2", [id2]);
    await db.execute("UPDATE tasks SET created_at = '2026-03-02 08:00:00' WHERE id = $3", [id3]);

    const completedRows = await db.select(`
      SELECT date(completed_at) as d, COUNT(*) as c
      FROM tasks
      WHERE archived_at IS NULL AND status_code != 5 AND date(completed_at) >= $1 AND date(completed_at) <= $2
      GROUP BY date(completed_at)
    `, ['2026-03-01', '2026-03-31']);

    const createdRows = await db.select(`
      SELECT date(created_at) as d, COUNT(*) as c
      FROM tasks
      WHERE archived_at IS NULL AND status_code != 5 AND date(created_at) >= $1 AND date(created_at) <= $2
      GROUP BY date(created_at)
    `, ['2026-03-01', '2026-03-31']);

    // Completed: 2 on 03-01
    const comp0301 = completedRows.find(r => r.d === '2026-03-01');
    expect(comp0301.c).toBe(2);

    // Created: tasks are auto-created in seedTasks. Only id3 has explicit created_at 03-02
    const created0302 = createdRows.find(r => r.d === '2026-03-02');
    expect(created0302.c).toBe(1);
  });

  it('ルーティン完了も日別に集計できる', async () => {
    const r1 = await seedRoutine(db, { title: 'ルーティン' });
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [r1, '2026-03-01']);
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [r1, '2026-03-02']);

    const rows = await db.select(`
      SELECT completion_date as d, COUNT(*) as c
      FROM routine_completions
      WHERE completion_date >= $1 AND completion_date <= $2
      GROUP BY completion_date
    `, ['2026-03-01', '2026-03-31']);

    expect(rows).toHaveLength(2);
    expect(rows[0].c).toBe(1);
    expect(rows[1].c).toBe(1);
  });
});
