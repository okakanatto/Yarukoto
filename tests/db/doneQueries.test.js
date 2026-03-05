import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTasks, seedTags, linkTaskTags, seedRoutine } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('やったタスク画面 — サマリークエリ', () => {
  it('完了タスクを日付ごとにカウントできる', async () => {
    const [id1, id2, id3] = await seedTasks(db, [
      { title: 'タスクA', status_code: 3 },
      { title: 'タスクB', status_code: 3 },
      { title: 'タスクC', status_code: 3 },
    ]);
    // completed_at を手動設定（同日2件、別日1件）
    await db.execute("UPDATE tasks SET completed_at = '2026-03-01 10:00:00' WHERE id = $1", [id1]);
    await db.execute("UPDATE tasks SET completed_at = '2026-03-01 14:00:00' WHERE id = $2", [id2]);
    await db.execute("UPDATE tasks SET completed_at = '2026-03-02 09:00:00' WHERE id = $3", [id3]);

    const rows = await db.select(`
      SELECT date(completed_at) as date, COUNT(*) as count
      FROM tasks WHERE status_code = 3 AND completed_at IS NOT NULL
      AND date(completed_at) >= $1 AND date(completed_at) <= $2
      GROUP BY date(completed_at)
    `, ['2026-03-01', '2026-03-31']);

    expect(rows).toHaveLength(2);
    const mar01 = rows.find(r => r.date === '2026-03-01');
    const mar02 = rows.find(r => r.date === '2026-03-02');
    expect(mar01.count).toBe(2);
    expect(mar02.count).toBe(1);
  });

  it('未完了タスクはサマリーに含まれない', async () => {
    await seedTasks(db, [
      { title: '未着手', status_code: 1 },
      { title: '着手中', status_code: 2 },
    ]);

    const rows = await db.select(`
      SELECT date(completed_at) as date, COUNT(*) as count
      FROM tasks WHERE status_code = 3 AND completed_at IS NOT NULL
      AND date(completed_at) >= $1 AND date(completed_at) <= $2
      GROUP BY date(completed_at)
    `, ['2026-03-01', '2026-03-31']);

    expect(rows).toHaveLength(0);
  });

  it('ルーティン完了を日付ごとにカウントできる', async () => {
    const r1 = await seedRoutine(db, { title: 'ルーティンA' });
    const r2 = await seedRoutine(db, { title: 'ルーティンB' });
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [r1, '2026-03-01']);
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [r2, '2026-03-01']);
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [r1, '2026-03-03']);

    const rows = await db.select(`
      SELECT completion_date as date, COUNT(*) as count
      FROM routine_completions
      WHERE completion_date >= $1 AND completion_date <= $2
      GROUP BY completion_date
    `, ['2026-03-01', '2026-03-31']);

    expect(rows).toHaveLength(2);
    const mar01 = rows.find(r => r.date === '2026-03-01');
    const mar03 = rows.find(r => r.date === '2026-03-03');
    expect(mar01.count).toBe(2);
    expect(mar03.count).toBe(1);
  });

  it('日付範囲外のデータは含まれない', async () => {
    const [id1] = await seedTasks(db, [{ title: '範囲外', status_code: 3 }]);
    await db.execute("UPDATE tasks SET completed_at = '2026-02-28 10:00:00' WHERE id = $1", [id1]);

    const rows = await db.select(`
      SELECT date(completed_at) as date, COUNT(*) as count
      FROM tasks WHERE status_code = 3 AND completed_at IS NOT NULL
      AND date(completed_at) >= $1 AND date(completed_at) <= $2
      GROUP BY date(completed_at)
    `, ['2026-03-01', '2026-03-31']);

    expect(rows).toHaveLength(0);
  });
});

describe('やったタスク画面 — 日別詳細クエリ', () => {
  it('指定日の完了タスクをタグ・親情報付きで取得できる', async () => {
    const [parentId] = await seedTasks(db, [{ title: '親タスク', status_code: 1 }]);
    const [childId] = await seedTasks(db, [{ title: '子タスク', status_code: 3, parent_id: parentId }]);
    await db.execute("UPDATE tasks SET completed_at = '2026-03-01 15:30:00' WHERE id = $1", [childId]);

    const [tagId] = await seedTags(db, [{ name: '仕事', color: '#ef4444' }]);
    await linkTaskTags(db, childId, [tagId]);

    const rows = await db.select(`
      SELECT t.id, t.title, t.completed_at, t.parent_id, t.estimated_hours,
             t.archived_at, p.title as parent_title,
             json_group_array(tg.id) as tag_ids,
             json_group_array(tg.name) as tag_names,
             json_group_array(tg.color) as tag_colors
      FROM tasks t
      LEFT JOIN tasks p ON t.parent_id = p.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE t.status_code = 3 AND t.completed_at IS NOT NULL
      AND date(t.completed_at) = $1
      GROUP BY t.id
      ORDER BY t.completed_at DESC
    `, ['2026-03-01']);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('子タスク');
    expect(rows[0].parent_title).toBe('親タスク');
    expect(rows[0].completed_at).toBe('2026-03-01 15:30:00');
    // タグ情報がJSON配列で取得される
    const tagNames = JSON.parse(rows[0].tag_names);
    expect(tagNames).toContain('仕事');
  });

  it('指定日のルーティン完了を取得できる', async () => {
    const routineId = await seedRoutine(db, { title: '日報' });
    await db.execute('INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [routineId, '2026-03-01']);

    const rows = await db.select(`
      SELECT r.id, r.title, rc.completion_date
      FROM routine_completions rc
      JOIN routines r ON rc.routine_id = r.id
      WHERE rc.completion_date = $1
    `, ['2026-03-01']);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('日報');
    expect(rows[0].completion_date).toBe('2026-03-01');
  });

  it('アーカイブ済みタスクもdetailクエリに含まれる', async () => {
    const [id] = await seedTasks(db, [{ title: 'アーカイブ済み', status_code: 3 }]);
    await db.execute(
      "UPDATE tasks SET completed_at = '2026-03-01 10:00:00', archived_at = '2026-03-02 10:00:00' WHERE id = $1",
      [id]
    );

    const rows = await db.select(`
      SELECT t.id, t.title, t.archived_at
      FROM tasks t
      WHERE t.status_code = 3 AND t.completed_at IS NOT NULL
      AND date(t.completed_at) = $1
      GROUP BY t.id
    `, ['2026-03-01']);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('アーカイブ済み');
    expect(rows[0].archived_at).not.toBeNull();
  });

  it('タグなしタスクでもnullのJSON配列が返る', async () => {
    const [id] = await seedTasks(db, [{ title: 'タグなし', status_code: 3 }]);
    await db.execute("UPDATE tasks SET completed_at = '2026-03-01 12:00:00' WHERE id = $1", [id]);

    const rows = await db.select(`
      SELECT t.id, t.title,
             json_group_array(tg.id) as tag_ids,
             json_group_array(tg.name) as tag_names
      FROM tasks t
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE t.status_code = 3 AND t.completed_at IS NOT NULL
      AND date(t.completed_at) = $1
      GROUP BY t.id
    `, ['2026-03-01']);

    expect(rows).toHaveLength(1);
    // タグなしの場合、json_group_array は [null] を返す
    const tagNames = JSON.parse(rows[0].tag_names);
    expect(tagNames).toEqual([null]);
  });
});
