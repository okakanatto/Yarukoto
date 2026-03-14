import Database from '@tauri-apps/plugin-sql';
import { updateHolidayCache } from '@/lib/holidayService';

const DB_PROMISE_KEY = '__yarukoto_db_promise';

/**
 * Current schema version number.
 * Increment this and add a new entry to MIGRATIONS when making schema changes.
 *
 * Version history:
 *   1: holiday_action, monthly_type on routines
 *   2: archived flag on tags
 *   3: archived_at on tasks + index + auto_archive_days setting
 *   4: sort_order / today_sort_order columns + sort mode settings
 *   5: auto_complete_parent setting
 *   6: projects table + project_id on tasks/routines + Inbox project
 *   7: theme settings (theme_mode, theme_accent)
 */
const LATEST_SCHEMA_VERSION = 7;

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('yarukoto:dberror', { detail: error }));
      }
      throw error;
    }
  })();

  return globalThis[DB_PROMISE_KEY];
}

/** Safe ALTER TABLE - ignores "duplicate column" errors. Returns true if column was added. */
async function tryAlter(db, sql) {
  try { await db.execute(sql); return true; } catch (_e) { return false; }
}

// ---------------------------------------------------------------------------
// Version-based migrations
// ---------------------------------------------------------------------------
// Each entry runs once when db_schema_version < entry.version.
// For existing DBs adopting versioning for the first time (version = 0),
// all migrations are re-applied safely (tryAlter + INSERT OR IGNORE).
// ---------------------------------------------------------------------------
const MIGRATIONS = [
  {
    version: 1,
    migrate: async (db) => {
      await tryAlter(db, "ALTER TABLE routines ADD COLUMN holiday_action TEXT DEFAULT 'none'");
      await tryAlter(db, "ALTER TABLE routines ADD COLUMN monthly_type TEXT DEFAULT 'date'");
    }
  },
  {
    version: 2,
    migrate: async (db) => {
      await tryAlter(db, "ALTER TABLE tags ADD COLUMN archived INTEGER DEFAULT 0");
    }
  },
  {
    version: 3,
    migrate: async (db) => {
      await tryAlter(db, "ALTER TABLE tasks ADD COLUMN archived_at TEXT");
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at)');
      await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", ['auto_archive_days', '0']);
    }
  },
  {
    version: 4,
    migrate: async (db) => {
      const sortOrderAdded = await tryAlter(db, "ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE tasks ADD COLUMN today_sort_order INTEGER DEFAULT 0");
      await tryAlter(db, "ALTER TABLE routines ADD COLUMN today_sort_order INTEGER DEFAULT 0");

      // Initialize sort_order for existing tasks only when column is first added
      if (sortOrderAdded) {
        const rootTasks = await db.select(
          'SELECT id FROM tasks WHERE parent_id IS NULL ORDER BY created_at DESC'
        );
        for (let i = 0; i < rootTasks.length; i++) {
          await db.execute('UPDATE tasks SET sort_order = $1 WHERE id = $2', [i + 1, rootTasks[i].id]);
        }
        const parents = await db.select('SELECT DISTINCT parent_id FROM tasks WHERE parent_id IS NOT NULL');
        for (const p of parents) {
          const children = await db.select(
            `SELECT id FROM tasks WHERE parent_id = $1
             ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, created_at ASC`,
            [p.parent_id]
          );
          for (let i = 0; i < children.length; i++) {
            await db.execute('UPDATE tasks SET sort_order = $1 WHERE id = $2', [i + 1, children[i].id]);
          }
        }
      }

      await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order)');
      await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", ['sort_mode_tasks', 'auto']);
      await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", ['sort_mode_today', 'auto']);
    }
  },
  {
    version: 5,
    migrate: async (db) => {
      await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", ['auto_complete_parent', '0']);
    }
  },
  {
    version: 6,
    migrate: async (db) => {
      // Ensure default project exists
      const defaultProjectCheck = await db.select("SELECT id FROM projects WHERE is_default = 1");
      let defaultProjectId;
      if (defaultProjectCheck.length === 0) {
        const res = await db.execute(
          "INSERT INTO projects (name, color, sort_order, is_default) VALUES ($1, $2, 0, 1)",
          ['Inbox', '#6366f1']
        );
        defaultProjectId = res.lastInsertId;
      } else {
        defaultProjectId = defaultProjectCheck[0].id;
      }
      await db.execute("UPDATE projects SET name = 'Inbox' WHERE is_default = 1 AND name = 'General'");

      const tasksAdded = await tryAlter(db, "ALTER TABLE tasks ADD COLUMN project_id INTEGER");
      if (tasksAdded) {
        await db.execute("UPDATE tasks SET project_id = $1 WHERE project_id IS NULL", [defaultProjectId]);
      }
      const routinesAdded = await tryAlter(db, "ALTER TABLE routines ADD COLUMN project_id INTEGER");
      if (routinesAdded) {
        await db.execute("UPDATE routines SET project_id = $1 WHERE project_id IS NULL", [defaultProjectId]);
      }

      await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_routines_project_id ON routines(project_id)');
    }
  },
  {
    version: 7,
    migrate: async (db) => {
      await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", ['theme_mode', 'light']);
      await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", ['theme_accent', 'coral']);
    }
  }
];

/**
 * Executes table creation, seed data, and version-based migrations.
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

  // ---------------------------------------------------------------------------
  // 1. Table creation — full current schema (all columns included)
  // ---------------------------------------------------------------------------
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
      sort_order INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0
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
      archived_at TEXT,
      sort_order INTEGER DEFAULT 0,
      today_sort_order INTEGER DEFAULT 0,
      project_id INTEGER,
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
      holiday_action TEXT DEFAULT 'none',
      monthly_type TEXT DEFAULT 'date',
      importance_level INTEGER,
      urgency_level INTEGER,
      estimated_hours REAL,
      notes TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_generated_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      end_date TEXT,
      today_sort_order INTEGER DEFAULT 0,
      project_id INTEGER
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
    `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      archived_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS holidays (
      date TEXT PRIMARY KEY,
      name TEXT
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status_code ON tasks(status_code)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_today_date ON tasks(today_date)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_routines_project_id ON routines(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_routine_completions_comp_date ON routine_completions(completion_date)`
  ];

  try {
    for (const sql of createTables) {
      await db.execute(sql);
    }

    // -------------------------------------------------------------------------
    // 2. Seed master data (idempotent — only inserts if tables are empty)
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // 3. Seed default project (idempotent)
    // -------------------------------------------------------------------------
    const defaultProjectCheck = await db.select("SELECT id FROM projects WHERE is_default = 1");
    if (defaultProjectCheck.length === 0) {
      await db.execute(
        "INSERT INTO projects (name, color, sort_order, is_default) VALUES ($1, $2, 0, 1)",
        ['Inbox', '#6366f1']
      );
    }

    // -------------------------------------------------------------------------
    // 4. Seed app_settings defaults (INSERT OR IGNORE — safe to repeat)
    // -------------------------------------------------------------------------
    const defaultSettings = [
      ['inherit_parent_tags', '0'],
      ['show_overdue_in_today', '1'],
      ['auto_archive_days', '0'],
      ['sort_mode_tasks', 'auto'],
      ['sort_mode_today', 'auto'],
      ['auto_complete_parent', '0'],
      ['theme_mode', 'light'],
      ['theme_accent', 'coral'],
    ];
    for (const [key, value] of defaultSettings) {
      await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", [key, value]);
    }

    // -------------------------------------------------------------------------
    // 5. Version-based migration
    // -------------------------------------------------------------------------
    await db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ($1, $2)", ['db_schema_version', '0']);
    const versionRows = await db.select("SELECT value FROM app_settings WHERE key = 'db_schema_version'");
    let currentVersion = parseInt(versionRows[0]?.value || '0', 10);

    if (currentVersion < LATEST_SCHEMA_VERSION) {
      for (const m of MIGRATIONS) {
        if (m.version > currentVersion) {
          await m.migrate(db);
        }
      }
      await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)",
        ['db_schema_version', String(LATEST_SCHEMA_VERSION)]
      );
    }

    // -------------------------------------------------------------------------
    // 6. Startup tasks
    // -------------------------------------------------------------------------
    await runAutoArchive(db);

  } catch (e) {
    console.error('Tauri DB Initialization error:', e);
  }
}

/**
 * Auto-archives completed tasks where completed_at + N days has passed.
 * Cancelled tasks (no completed_at) are not auto-archived.
 * @param {Database} db
 */
async function runAutoArchive(db) {
  try {
    const rows = await db.select("SELECT value FROM app_settings WHERE key = 'auto_archive_days'");
    const days = parseInt(rows[0]?.value || '0');
    if (days <= 0) return;

    // Auto-archive completed tasks past the threshold (each statement is atomic via SQLite implicit transaction)
    await db.execute(
      `UPDATE tasks
       SET archived_at = datetime('now', 'localtime')
       WHERE archived_at IS NULL
         AND status_code = 3
         AND completed_at IS NOT NULL
         AND date(completed_at) <= date('now', 'localtime', '-' || $1 || ' days')`,
      [days]
    );

    // Parent-child linkage: archive children of auto-archived parent tasks
    await db.execute(
      `UPDATE tasks
       SET archived_at = datetime('now', 'localtime')
       WHERE archived_at IS NULL
         AND parent_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL AND parent_id IS NULL)`
    );
  } catch (e) {
    console.error('Auto-archive error:', e);
  }
}

/**
 * Closes the current DB connection and clears the singleton.
 * Used before DB file replacement (restore flow).
 */
export async function closeDb() {
  const p = globalThis[DB_PROMISE_KEY];
  if (!p) return;
  try {
    const db = await p;
    await db.close();
  } finally {
    globalThis[DB_PROMISE_KEY] = null;
  }
}

export { runAutoArchive };
