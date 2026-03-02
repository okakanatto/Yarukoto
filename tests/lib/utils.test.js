import { describe, it, expect } from 'vitest';
import { formatMin, parseTags } from '@/lib/utils';

describe('formatMin', () => {
  it('0分を正しくフォーマットする', () => {
    expect(formatMin(0)).toBe('0分');
  });

  it('null/undefinedを0分として扱う', () => {
    expect(formatMin(null)).toBe('0分');
    expect(formatMin(undefined)).toBe('0分');
  });

  it('60分未満を「N分」形式で返す', () => {
    expect(formatMin(30)).toBe('30分');
    expect(formatMin(1)).toBe('1分');
    expect(formatMin(59)).toBe('59分');
  });

  it('60分以上を「Nh M分」形式で返す', () => {
    expect(formatMin(90)).toBe('1h 30分');
    expect(formatMin(120)).toBe('2h');
    expect(formatMin(150)).toBe('2h 30分');
  });

  it('負の値を0分として扱う', () => {
    expect(formatMin(-10)).toBe('0分');
  });
});

describe('parseTags', () => {
  it('正常なJSON文字列からタグ配列を生成する', () => {
    const row = {
      tag_ids: '[1, 2]',
      tag_names: '["仕事", "個人"]',
      tag_colors: '["#ef4444", "#3b82f6"]',
    };
    const result = parseTags(row);
    expect(result).toEqual([
      { id: 1, name: '仕事', color: '#ef4444' },
      { id: 2, name: '個人', color: '#3b82f6' },
    ]);
  });

  it('空配列の場合は空を返す', () => {
    const row = { tag_ids: '[]', tag_names: '[]', tag_colors: '[]' };
    expect(parseTags(row)).toEqual([]);
  });

  it('null値の場合は空を返す', () => {
    const row = { tag_ids: null, tag_names: null, tag_colors: null };
    expect(parseTags(row)).toEqual([]);
  });

  it('nullを含むタグ（LEFT JOINの結果）をフィルタする', () => {
    // json_group_array with no matching tags produces [null]
    const row = {
      tag_ids: '[null]',
      tag_names: '[null]',
      tag_colors: '[null]',
    };
    expect(parseTags(row)).toEqual([]);
  });
});
