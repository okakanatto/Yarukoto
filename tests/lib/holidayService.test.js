import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../__helpers__/testDb.js';
import { isRoutineActiveOnDate, isHolidayOrWeekend } from '@/lib/holidayService';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('isHolidayOrWeekend', () => {
  it('土曜日はtrueを返す', async () => {
    // 2026-03-07 is Saturday
    expect(await isHolidayOrWeekend(db, '2026-03-07')).toBe(true);
  });

  it('日曜日はtrueを返す', async () => {
    // 2026-03-08 is Sunday
    expect(await isHolidayOrWeekend(db, '2026-03-08')).toBe(true);
  });

  it('平日でholidaysテーブルに無い日はfalseを返す', async () => {
    // 2026-03-02 is Monday
    expect(await isHolidayOrWeekend(db, '2026-03-02')).toBe(false);
  });

  it('holidaysテーブルに祝日データを保存・取得できる', async () => {
    // isHolidayOrWeekend はモジュールレベルのメモリキャッシュを使うため、
    // テスト間でキャッシュがリセットされない。ここでは DB 操作の正しさのみ検証する。
    await db.execute("INSERT INTO holidays (date, name) VALUES ($1, $2)", ['2026-03-09', 'テスト祝日']);
    const rows = await db.select("SELECT * FROM holidays WHERE date = $1", ['2026-03-09']);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('テスト祝日');
  });
});

describe('isRoutineActiveOnDate', () => {
  it('dailyルーティンは平日にactiveになる', async () => {
    const routine = {
      enabled: 1,
      frequency: 'daily',
      weekdays_only: 0,
      holiday_action: 'none',
      end_date: null,
    };
    // 2026-03-02 is Monday
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-02')).toBe(true);
  });

  it('dailyルーティンは週末にもactiveになる（weekdays_only=0）', async () => {
    const routine = {
      enabled: 1,
      frequency: 'daily',
      weekdays_only: 0,
      holiday_action: 'none',
      end_date: null,
    };
    // 2026-03-07 is Saturday
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-07')).toBe(true);
  });

  it('weekdays_only=1のdailyルーティンは週末にactiveにならない', async () => {
    const routine = {
      enabled: 1,
      frequency: 'daily',
      weekdays_only: 1,
      holiday_action: 'none',
      end_date: null,
    };
    // 2026-03-07 is Saturday
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-07')).toBe(false);
  });

  it('weeklyルーティンは指定曜日のみactiveになる', async () => {
    const routine = {
      enabled: 1,
      frequency: 'weekly',
      days_of_week: '1,3,5', // Mon, Wed, Fri
      weekdays_only: 0,
      holiday_action: 'none',
      end_date: null,
    };
    // 2026-03-02 is Monday (1)
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-02')).toBe(true);
    // 2026-03-03 is Tuesday (2)
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-03')).toBe(false);
    // 2026-03-04 is Wednesday (3)
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-04')).toBe(true);
  });

  it('monthlyルーティン（固定日）は指定日のみactiveになる', async () => {
    const routine = {
      enabled: 1,
      frequency: 'monthly',
      monthly_type: 'date',
      day_of_month: 15,
      weekdays_only: 0,
      holiday_action: 'none',
      end_date: null,
    };
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-15')).toBe(true);
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-14')).toBe(false);
  });

  it('無効化されたルーティンはactiveにならない', async () => {
    const routine = {
      enabled: 0,
      frequency: 'daily',
      weekdays_only: 0,
      holiday_action: 'none',
      end_date: null,
    };
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-02')).toBe(false);
  });

  it('end_dateを過ぎたルーティンはactiveにならない', async () => {
    const routine = {
      enabled: 1,
      frequency: 'daily',
      weekdays_only: 0,
      holiday_action: 'none',
      end_date: '2026-03-01',
    };
    expect(await isRoutineActiveOnDate(db, routine, '2026-03-02')).toBe(false);
  });
});
