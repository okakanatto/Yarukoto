import BetterSqlite from 'better-sqlite3';

/**
 * Converts Tauri plugin-sql positional params ($1, $2, ...) to better-sqlite3 (?)
 */
function convertParams(sql) {
  return sql.replace(/\$(\d+)/g, '?');
}

/**
 * Mock Database class that mimics @tauri-apps/plugin-sql using better-sqlite3 in-memory DB.
 */
class MockDatabase {
  constructor(raw) {
    this._raw = raw;
  }

  static async load(_url) {
    const raw = new BetterSqlite(':memory:');
    return new MockDatabase(raw);
  }

  async execute(sql, params = []) {
    const trimmed = sql.trim();
    const firstWord = trimmed.split(/\s/)[0].toUpperCase();

    // PRAGMA, BEGIN, COMMIT, ROLLBACK need exec() not prepare()
    if (['PRAGMA', 'BEGIN', 'COMMIT', 'ROLLBACK'].includes(firstWord)) {
      this._raw.exec(trimmed);
      return { rowsAffected: 0, lastInsertId: 0 };
    }

    const converted = convertParams(sql);
    const stmt = this._raw.prepare(converted);
    const result = stmt.run(...params);
    return {
      rowsAffected: result.changes,
      lastInsertId: Number(result.lastInsertRowid),
    };
  }

  async select(sql, params = []) {
    const converted = convertParams(sql);
    const stmt = this._raw.prepare(converted);
    return stmt.all(...params);
  }

  async close() {
    this._raw.close();
  }
}

export default MockDatabase;
