import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('DBスキーマの初期化', () => {
  it('全テーブルが作成されている', async () => {
    const tables = await db.select(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('tags');
    expect(tableNames).toContain('task_tags');
    expect(tableNames).toContain('routines');
    expect(tableNames).toContain('routine_tags');
    expect(tableNames).toContain('routine_completions');
    expect(tableNames).toContain('importance_master');
    expect(tableNames).toContain('urgency_master');
    expect(tableNames).toContain('status_master');
    expect(tableNames).toContain('app_settings');
    expect(tableNames).toContain('holidays');
    expect(tableNames).toContain('projects');
  });

  it('importance_masterに3レベルがシードされている', async () => {
    const rows = await db.select('SELECT * FROM importance_master ORDER BY level');
    expect(rows).toHaveLength(3);
    expect(rows[0].level).toBe(1);
    expect(rows[2].level).toBe(3);
  });

  it('urgency_masterに3レベルがシードされている', async () => {
    const rows = await db.select('SELECT * FROM urgency_master ORDER BY level');
    expect(rows).toHaveLength(3);
  });

  it('status_masterに5つのステータスがシードされている', async () => {
    const rows = await db.select('SELECT * FROM status_master ORDER BY code');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ code: 1, label: '未着手' });
    expect(rows[1]).toMatchObject({ code: 2, label: '着手中' });
    expect(rows[2]).toMatchObject({ code: 3, label: '完了' });
    expect(rows[3]).toMatchObject({ code: 4, label: '保留' });
    expect(rows[4]).toMatchObject({ code: 5, label: 'キャンセル' });
  });

  it('app_settingsにデフォルト値がシードされている', async () => {
    const rows = await db.select('SELECT * FROM app_settings ORDER BY key');
    const keys = rows.map(r => r.key);
    expect(keys).toContain('inherit_parent_tags');
    expect(keys).toContain('show_overdue_in_today');
    expect(keys).toContain('auto_archive_days');
    expect(keys).toContain('sort_mode_tasks');
    expect(keys).toContain('sort_mode_today');
    expect(keys).toContain('auto_complete_parent');
  });

  it('インデックスが作成されている', async () => {
    const indexes = await db.select(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    );
    const names = indexes.map(i => i.name);
    expect(names).toContain('idx_tasks_parent_id');
    expect(names).toContain('idx_tasks_status_code');
    expect(names).toContain('idx_tasks_due_date');
    expect(names).toContain('idx_tasks_today_date');
    expect(names).toContain('idx_tasks_archived_at');
    expect(names).toContain('idx_tasks_sort_order');
    expect(names).toContain('idx_tasks_project_id');
    expect(names).toContain('idx_routines_project_id');
  });
});
