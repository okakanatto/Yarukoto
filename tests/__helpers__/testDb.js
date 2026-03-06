const DB_PROMISE_KEY = '__yarukoto_db_promise';
const HOLIDAY_KEY = '__yarukoto_holiday_update_promise';

/**
 * Creates a fresh in-memory test DB with full schema + seed data.
 * Clears globalThis singletons so each call returns a brand new DB.
 * The production initDb() runs automatically, ensuring schema parity.
 *
 * @returns {Promise<import('better-sqlite3').Database>} DB instance (mock)
 */
export async function createTestDb() {
  globalThis[DB_PROMISE_KEY] = null;
  globalThis[HOLIDAY_KEY] = null;

  // Dynamic import so the mock is resolved at call time
  const { getDb } = await import('@/lib/db');
  return getDb();
}

/**
 * Inserts test tasks into the DB.
 * @param {object} db - Mock database instance
 * @param {Array<object>} tasks - Task objects
 * @returns {Promise<number[]>} Inserted task IDs
 */
export async function seedTasks(db, tasks) {
  const ids = [];
  for (const t of tasks) {
    const result = await db.execute(
      `INSERT INTO tasks (title, parent_id, status_code, importance_level, urgency_level,
       start_date, due_date, estimated_hours, today_date, notes, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        t.title || 'テストタスク',
        t.parent_id ?? null,
        t.status_code ?? 1,
        t.importance_level ?? null,
        t.urgency_level ?? null,
        t.start_date ?? null,
        t.due_date ?? null,
        t.estimated_hours ?? null,
        t.today_date ?? null,
        t.notes ?? null,
        t.project_id ?? null,
      ]
    );
    ids.push(result.lastInsertId);
  }
  return ids;
}

/**
 * Inserts test tags and returns their IDs.
 */
export async function seedTags(db, tags) {
  const ids = [];
  for (const t of tags) {
    const result = await db.execute(
      'INSERT INTO tags (name, color) VALUES ($1, $2)',
      [t.name, t.color || '#3b82f6']
    );
    ids.push(result.lastInsertId);
  }
  return ids;
}

/**
 * Links a task to tags.
 */
export async function linkTaskTags(db, taskId, tagIds) {
  for (const tagId of tagIds) {
    await db.execute(
      'INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1, $2)',
      [taskId, tagId]
    );
  }
}

/**
 * Inserts a test project and returns its ID.
 */
export async function seedProject(db, project) {
  const result = await db.execute(
    `INSERT INTO projects (name, color, sort_order, is_default)
     VALUES ($1, $2, $3, $4)`,
    [
      project.name || 'テストプロジェクト',
      project.color || '#3b82f6',
      project.sort_order ?? 0,
      project.is_default ?? 0,
    ]
  );
  return result.lastInsertId;
}

/**
 * Inserts a test routine and returns its ID.
 */
export async function seedRoutine(db, routine) {
  const result = await db.execute(
    `INSERT INTO routines (title, frequency, days_of_week, day_of_month, weekdays_only,
     holiday_action, monthly_type, importance_level, urgency_level, estimated_hours, notes, enabled, end_date, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      routine.title || 'テストルーティン',
      routine.frequency || 'daily',
      routine.days_of_week ?? null,
      routine.day_of_month ?? null,
      routine.weekdays_only ?? 0,
      routine.holiday_action ?? 'none',
      routine.monthly_type ?? 'date',
      routine.importance_level ?? null,
      routine.urgency_level ?? null,
      routine.estimated_hours ?? null,
      routine.notes ?? null,
      routine.enabled ?? 1,
      routine.end_date ?? null,
      routine.project_id ?? null,
    ]
  );
  return result.lastInsertId;
}
