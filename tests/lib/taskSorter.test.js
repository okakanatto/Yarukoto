import { describe, it, expect } from 'vitest';
import { taskComparator, SORT_OPTIONS } from '@/lib/taskSorter';

// Helper to create a minimal task object
function task(overrides = {}) {
  return {
    id: 1,
    title: 'タスク',
    status_code: 1,
    importance_level: null,
    urgency_level: null,
    created_at: '2026-03-01 10:00:00',
    due_date: null,
    tags: [],
    ...overrides,
  };
}

describe('taskComparator', () => {
  it('created_desc: 新しい順にソートされる', () => {
    const a = task({ created_at: '2026-03-01 10:00:00' });
    const b = task({ created_at: '2026-03-02 10:00:00' });
    const sorted = [a, b].sort(taskComparator('created_desc'));
    expect(sorted[0].created_at).toBe('2026-03-02 10:00:00');
  });

  it('created_asc: 古い順にソートされる', () => {
    const a = task({ created_at: '2026-03-02 10:00:00' });
    const b = task({ created_at: '2026-03-01 10:00:00' });
    const sorted = [a, b].sort(taskComparator('created_asc'));
    expect(sorted[0].created_at).toBe('2026-03-01 10:00:00');
  });

  it('due_asc: 期限日NULLが末尾に来る', () => {
    const a = task({ due_date: null });
    const b = task({ due_date: '2026-03-10' });
    const c = task({ due_date: '2026-03-05' });
    const sorted = [a, b, c].sort(taskComparator('due_asc'));
    expect(sorted[0].due_date).toBe('2026-03-05');
    expect(sorted[1].due_date).toBe('2026-03-10');
    expect(sorted[2].due_date).toBeNull();
  });

  it('due_desc: 期限日NULLが末尾に来る', () => {
    const a = task({ due_date: null });
    const b = task({ due_date: '2026-03-05' });
    const c = task({ due_date: '2026-03-10' });
    const sorted = [a, b, c].sort(taskComparator('due_desc'));
    expect(sorted[0].due_date).toBe('2026-03-10');
    expect(sorted[1].due_date).toBe('2026-03-05');
    expect(sorted[2].due_date).toBeNull();
  });

  it('importance: 重要度が高い順にソートされる', () => {
    const a = task({ importance_level: 1 });
    const b = task({ importance_level: 3 });
    const sorted = [a, b].sort(taskComparator('importance'));
    expect(sorted[0].importance_level).toBe(3);
  });

  it('urgency: 緊急度が高い順にソートされる', () => {
    const a = task({ urgency_level: 1 });
    const b = task({ urgency_level: 3 });
    const sorted = [a, b].sort(taskComparator('urgency'));
    expect(sorted[0].urgency_level).toBe(3);
  });

  it('title: あいう順にソートされる', () => {
    const a = task({ title: 'バナナ' });
    const b = task({ title: 'アップル' });
    const sorted = [a, b].sort(taskComparator('title'));
    expect(sorted[0].title).toBe('アップル');
  });

  it('status: sort_orderに従ってソートされる', () => {
    const statuses = [
      { code: 1, sort_order: 1 },
      { code: 2, sort_order: 2 },
      { code: 3, sort_order: 3 },
    ];
    const a = task({ status_code: 3 });
    const b = task({ status_code: 1 });
    const sorted = [a, b].sort(taskComparator('status', statuses));
    expect(sorted[0].status_code).toBe(1);
  });

  it('priority: 完了タスクが末尾になる', () => {
    const a = task({ status_code: 3, importance_level: 3 });
    const b = task({ status_code: 1, importance_level: 1 });
    const sorted = [a, b].sort(taskComparator('priority'));
    expect(sorted[0].status_code).toBe(1);
    expect(sorted[1].status_code).toBe(3);
  });

  it('priority: 未完了タスク同士は重要度→緊急度の順で比較する', () => {
    const a = task({ importance_level: 2, urgency_level: 3 });
    const b = task({ importance_level: 3, urgency_level: 1 });
    const c = task({ importance_level: 3, urgency_level: 2 });
    const sorted = [a, b, c].sort(taskComparator('priority'));
    expect(sorted[0].importance_level).toBe(3);
    expect(sorted[0].urgency_level).toBe(2);
    expect(sorted[1].importance_level).toBe(3);
    expect(sorted[1].urgency_level).toBe(1);
    expect(sorted[2].importance_level).toBe(2);
  });

  it('tag: 最初のタグ名であいう順にソート、タグなしは末尾', () => {
    const a = task({ tags: [{ name: 'ゼミ' }] });
    const b = task({ tags: [] });
    const c = task({ tags: [{ name: 'アルバイト' }] });
    const sorted = [a, b, c].sort(taskComparator('tag'));
    expect(sorted[0].tags[0].name).toBe('アルバイト');
    expect(sorted[1].tags[0].name).toBe('ゼミ');
    expect(sorted[2].tags).toEqual([]);
  });
});

describe('SORT_OPTIONS', () => {
  it('9つのソートオプションが定義されている', () => {
    expect(SORT_OPTIONS).toHaveLength(9);
  });

  it('各オプションにkeyとlabelがある', () => {
    for (const opt of SORT_OPTIONS) {
      expect(opt.key).toBeDefined();
      expect(opt.label).toBeDefined();
    }
  });
});
