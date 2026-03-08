import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
  db = await createTestDb();
});

describe('app_settings', () => {
  it('設定値を読み書きできる', async () => {
    await db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
      ['test_key', 'test_value']
    );
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['test_key']);
    expect(rows[0].value).toBe('test_value');
  });

  it('INSERT OR REPLACEで既存値を上書きできる', async () => {
    await db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
      ['inherit_parent_tags', '1']
    );
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['inherit_parent_tags']);
    expect(rows[0].value).toBe('1');
  });

  it('デフォルトのinherit_parent_tagsは0', async () => {
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['inherit_parent_tags']);
    expect(rows[0].value).toBe('0');
  });

  it('デフォルトのauto_archive_daysは0（無効）', async () => {
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['auto_archive_days']);
    expect(rows[0].value).toBe('0');
  });

  it('デフォルトのauto_complete_parentは0（無効）', async () => {
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['auto_complete_parent']);
    expect(rows[0].value).toBe('0');
  });

  it('デフォルトのtheme_modeはlight', async () => {
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['theme_mode']);
    expect(rows[0]?.value).toBe('light');
  });

  it('デフォルトのtheme_accentはcoral', async () => {
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['theme_accent']);
    expect(rows[0]?.value).toBe('coral');
  });

  it('theme_modeをdarkに変更できる', async () => {
    await db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
      ['theme_mode', 'dark']
    );
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['theme_mode']);
    expect(rows[0].value).toBe('dark');
  });

  it('theme_accentを別のプリセットに変更できる', async () => {
    await db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
      ['theme_accent', 'violet']
    );
    const rows = await db.select("SELECT value FROM app_settings WHERE key = $1", ['theme_accent']);
    expect(rows[0].value).toBe('violet');
  });
});

