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
    expect(keys).toContain('db_schema_version');
  });

  it('db_schema_versionが最新バージョンに設定されている', async () => {
    const rows = await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'");
    const version = parseInt(rows[0].value, 10);
    expect(version).toBeGreaterThanOrEqual(7);
  });

  it('tasksテーブルに全カラムが存在する', async () => {
    const cols = await db.select("PRAGMA table_info(tasks)");
    const colNames = cols.map(c => c.name);
    const expected = [
      'id', 'title', 'parent_id', 'status_code', 'importance_level', 'urgency_level',
      'start_date', 'due_date', 'estimated_hours', 'today_date', 'notes',
      'created_at', 'updated_at', 'completed_at', 'archived_at',
      'sort_order', 'today_sort_order', 'project_id'
    ];
    for (const col of expected) {
      expect(colNames).toContain(col);
    }
  });

  it('routinesテーブルに全カラムが存在する', async () => {
    const cols = await db.select("PRAGMA table_info(routines)");
    const colNames = cols.map(c => c.name);
    const expected = [
      'id', 'title', 'frequency', 'days_of_week', 'day_of_month', 'weekdays_only',
      'holiday_action', 'monthly_type', 'importance_level', 'urgency_level',
      'estimated_hours', 'notes', 'enabled', 'last_generated_date',
      'created_at', 'updated_at', 'end_date', 'today_sort_order', 'project_id'
    ];
    for (const col of expected) {
      expect(colNames).toContain(col);
    }
  });

  it('tagsテーブルにarchivedカラムが存在する', async () => {
    const cols = await db.select("PRAGMA table_info(tags)");
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('archived');
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
