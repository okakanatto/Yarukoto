import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../__helpers__/testDb.js';

const DB_PROMISE_KEY = '__yarukoto_db_promise';
const HOLIDAY_KEY = '__yarukoto_holiday_update_promise';

describe('closeDb', () => {
  beforeEach(() => {
    globalThis[DB_PROMISE_KEY] = null;
    globalThis[HOLIDAY_KEY] = null;
  });

  it('DBが未初期化のとき、エラーなく終了する', async () => {
    const { closeDb } = await import('@/lib/db');
    await expect(closeDb()).resolves.toBeUndefined();
  });

  it('DB初期化後にcloseDbを呼ぶとシングルトンがnullにリセットされる', async () => {
    await createTestDb();
    expect(globalThis[DB_PROMISE_KEY]).not.toBeNull();

    const { closeDb } = await import('@/lib/db');
    await closeDb();

    expect(globalThis[DB_PROMISE_KEY]).toBeNull();
  });

  it('closeDb後にgetDbを呼ぶと新しいDBインスタンスが返る', async () => {
    const db1 = await createTestDb();
    const { closeDb, getDb } = await import('@/lib/db');

    await closeDb();

    const db2 = await getDb();
    expect(db2).not.toBe(db1);
  });
});
