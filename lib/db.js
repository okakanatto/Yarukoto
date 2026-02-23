import Database from '@tauri-apps/plugin-sql';
import { updateHolidayCache } from '@/lib/holidayService';

const DB_PROMISE_KEY = '__yarukoto_db_promise';

/**
 * Initializes and returns the Tauri SQL database connection.
 * Uses globalThis to survive HMR module re-evaluation.
 * @returns {Promise<Database>}
 */
export function getDb() {
  if (globalThis[DB_PROMISE_KEY]) return globalThis[DB_PROMISE_KEY];

  globalThis[DB_PROMISE_KEY] = (async () => {
    try {
      // Loads or creates tasks.db in the AppData/Roaming/<App> path automatically managed by Tauri
      const dbInstance = await Database.load('sqlite:tasks.db');
      await initDb(dbInstance);

      // Fire and forget cache update (singleton-guarded in holidayService.js)
      updateHolidayCache(dbInstance).catch(e => console.error("Holiday cache error:", e));

      return dbInstance;
    } catch (error) {
      console.error("Failed to load SQLite database via Tauri plugin:", error);
      globalThis[DB_PROMISE_KEY] = null; // Re-attempt on next call if it failed
      throw error;
    }
  })();

  return globalThis[DB_PROMISE_KEY];
}

/**
 * Executes initial table creation and migration scripts via Tauri IPC.
 * @param {Database} db
 */
async function initDb(db) {
  try {
    // Enable WAL mode to allow concurrent reads and writes, preventing "database is locked" errors
    await db.execute('PRAGMA journal_mode = WAL');
    // Set a busy timeout so queries wait up to 5 seconds for a lock instead of instantly failing
    await db.execute('PRAGMA busy_timeout = 5000');
    // Enable Foreign Keys (SQLite disables them by default). Required for ON DELETE CASCADE to prevent orphaned data!
    await db.execute('PRAGMA foreign_keys = ON');
  } catch (e) { console.warn('Failed to set PRAGMAs:', e); }

  const createTables = [
    `CREATE TABLE IF NOT EXISTS importance_master (
      level INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      color TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS urgency_master (
      level INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      color TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS status_master (
      code INTEGER PRIMARY KEY,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#3b82f6',
      sort_order INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      parent_id INTEGER,
      status_code INTEGER NOT NULL DEFAULT 1,
      importance_level INTEGER,
      urgency_level INTEGER,
      start_date TEXT,
      due_date TEXT,
      estimated_hours REAL,
      today_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT,
      FOREIGN KEY(parent_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER,
      tag_id INTEGER,
      PRIMARY KEY (task_id, tag_id),
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      days_of_week TEXT,
      day_of_month INTEGER,
      weekdays_only INTEGER NOT NULL DEFAULT 0,
      importance_level INTEGER,
      urgency_level INTEGER,
      estimated_hours REAL,
      notes TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_generated_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      end_date TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS routine_tags (
      routine_id INTEGER,
      tag_id INTEGER,
      PRIMARY KEY (routine_id, tag_id),
      FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS routine_completions (
      routine_id INTEGER,
      completion_date TEXT,
      PRIMARY KEY (routine_id, completion_date),
      FOREIGN KEY(routine_id) REFERENCES routines(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS holidays (
      date TEXT PRIMARY KEY,
      name TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status_code ON tasks(status_code)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_today_date ON tasks(today_date)`,
    `CREATE INDEX IF NOT EXISTS idx_routine_completions_comp_date ON routine_completions(completion_date)`
  ];

  try {
    // Execute table creations
    for (const sql of createTables) {
      await db.execute(sql);
    }

    // Seed initial data if empty
    const importanceCount = await db.select('SELECT count(*) as count FROM importance_master');
    if (importanceCount[0].count === 0) {
      await db.execute('INSERT INTO importance_master (level, label, color) VALUES (1, $1, $2)', ['低', '#10b981']);
      await db.execute('INSERT INTO importance_master (level, label, color) VALUES (2, $1, $2)', ['中', '#f59e0b']);
      await db.execute('INSERT INTO importance_master (level, label, color) VALUES (3, $1, $2)', ['高', '#ef4444']);
    }

    const urgencyCount = await db.select('SELECT count(*) as count FROM urgency_master');
    if (urgencyCount[0].count === 0) {
      await db.execute('INSERT INTO urgency_master (level, label, color) VALUES (1, $1, $2)', ['低', '#10b981']);
      await db.execute('INSERT INTO urgency_master (level, label, color) VALUES (2, $1, $2)', ['中', '#f59e0b']);
      await db.execute('INSERT INTO urgency_master (level, label, color) VALUES (3, $1, $2)', ['高', '#ef4444']);
    }

    const statusCount = await db.select('SELECT count(*) as count FROM status_master');
    if (statusCount[0].count === 0) {
      await db.execute('INSERT INTO status_master (code, label, color, sort_order) VALUES (1, $1, $2, 1)', ['未着手', '#94a3b8']);
      await db.execute('INSERT INTO status_master (code, label, color, sort_order) VALUES (2, $1, $2, 2)', ['着手中', '#3b82f6']);
      await db.execute('INSERT INTO status_master (code, label, color, sort_order) VALUES (3, $1, $2, 3)', ['完了', '#10b981']);
      await db.execute('INSERT INTO status_master (code, label, color, sort_order) VALUES (4, $1, $2, 4)', ['保留', '#f59e0b']);
      await db.execute('INSERT INTO status_master (code, label, color, sort_order) VALUES (5, $1, $2, 5)', ['キャンセル', '#64748b']);
    }

    // Seed app_settings defaults
    const settingsCount = await db.select('SELECT count(*) as count FROM app_settings');
    if (settingsCount[0].count === 0) {
      await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", ['inherit_parent_tags', '0']);
    }

    // Migrations
    try {
      await db.execute("ALTER TABLE routines ADD COLUMN holiday_action TEXT DEFAULT 'none'");
    } catch (e) { /* Ignore if exists */ }
    try {
      await db.execute("ALTER TABLE routines ADD COLUMN monthly_type TEXT DEFAULT 'date'");
    } catch (e) { /* Ignore if exists */ }

  } catch (e) {
    console.error('Tauri DB Initialization error:', e);
  }
}
