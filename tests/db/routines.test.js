import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedRoutine } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('ルーティンのCRUD', () => {
  it('ルーティンを追加できる', async () => {
    const id = await seedRoutine(db, {
      title: '朝の運動',
      frequency: 'daily',
    });
    const rows = await db.select('SELECT * FROM routines WHERE id = $1', [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('朝の運動');
    expect(rows[0].frequency).toBe('daily');
    expect(rows[0].enabled).toBe(1);
  });

  it('ルーティンを無効化できる', async () => {
    const id = await seedRoutine(db, { title: 'テスト' });
    await db.execute('UPDATE routines SET enabled = 0 WHERE id = $1', [id]);
    const rows = await db.select('SELECT enabled FROM routines WHERE id = $1', [id]);
    expect(rows[0].enabled).toBe(0);
  });
});

describe('ルーティン完了管理', () => {
  it('完了記録をINSERTできる', async () => {
    const routineId = await seedRoutine(db, { title: 'テスト' });
    await db.execute(
      'INSERT OR IGNORE INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)',
      [routineId, '2026-03-02']
    );
    const rows = await db.select(
      'SELECT * FROM routine_completions WHERE routine_id = $1 AND completion_date = $2',
      [routineId, '2026-03-02']
    );
    expect(rows).toHaveLength(1);
  });

  it('完了取消でDELETEできる', async () => {
    const routineId = await seedRoutine(db, { title: 'テスト' });
    await db.execute(
      'INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)',
      [routineId, '2026-03-02']
    );
    await db.execute(
      'DELETE FROM routine_completions WHERE routine_id = $1 AND completion_date = $2',
      [routineId, '2026-03-02']
    );
    const rows = await db.select(
      'SELECT * FROM routine_completions WHERE routine_id = $1',
      [routineId]
    );
    expect(rows).toHaveLength(0);
  });

  it('同じルーティン+日付のINSERT OR IGNOREで重複しない', async () => {
    const routineId = await seedRoutine(db, { title: 'テスト' });
    await db.execute(
      'INSERT OR IGNORE INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)',
      [routineId, '2026-03-02']
    );
    await db.execute(
      'INSERT OR IGNORE INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)',
      [routineId, '2026-03-02']
    );
    const rows = await db.select(
      'SELECT * FROM routine_completions WHERE routine_id = $1',
      [routineId]
    );
    expect(rows).toHaveLength(1);
  });

  it('ルーティン削除時にcompletion_recordsもCASCADE削除される', async () => {
    const routineId = await seedRoutine(db, { title: 'テスト' });
    await db.execute(
      'INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)',
      [routineId, '2026-03-01']
    );
    await db.execute(
      'INSERT INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)',
      [routineId, '2026-03-02']
    );

    await db.execute('DELETE FROM routines WHERE id = $1', [routineId]);

    const completions = await db.select(
      'SELECT * FROM routine_completions WHERE routine_id = $1',
      [routineId]
    );
    expect(completions).toHaveLength(0);
  });
});
