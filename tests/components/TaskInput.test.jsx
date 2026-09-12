// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TaskInput from '@/components/TaskInput';
import { createTestDb, linkTaskTags, seedProject, seedTags, seedTasks } from '../__helpers__/testDb';

vi.mock('@/lib/holidayService', () => ({ updateHolidayCache: async () => {} }));

vi.mock('@/hooks/useMasterData', () => ({ useMasterData: () => ({
  masters: { importance: [{ level: 3, label: '高' }], urgency: [{ level: 2, label: '中' }] },
  tags: [{ id: 1, name: '親のタグ', color: '#123456' }, { id: 2, name: '選択タグ', color: '#654321' }],
  projects: [{ id: 1, name: 'Inbox', is_default: 1 }, { id: 2, name: '人事', is_default: 0 }],
}) }));
vi.mock('@/components/CalendarPicker', () => ({ default: ({ value, onChange, label }) => <input aria-label={label || '日付'} value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('@/components/TagSelect', () => ({ default: ({ selectedTagIds, onChange }) => <select aria-label="タグ" multiple value={selectedTagIds.map(String)} onChange={event => onChange([...event.target.selectedOptions].map(option => Number(option.value)))}>
  <option value="1">親のタグ</option><option value="2">選択タグ</option>
</select> }));

let db;
beforeEach(async () => {
  localStorage.clear();
  db = await createTestDb();
  await seedProject(db, { name: '人事' });
  await seedTags(db, [{ name: '親のタグ' }, { name: '選択タグ' }]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const record = () => screen.getByRole('textbox', { name: '仕事の記録' });
const field = label => screen.getByText(label, { selector: 'label' }).parentElement.querySelector('input,textarea,select');
const chooseTag = id => {
  const select = screen.getByRole('listbox', { name: 'タグ' });
  for (const option of select.options) option.selected = option.value === String(id);
  fireEvent.change(select);
};

describe('TaskInput local draft', () => {
  it('FABを閉じても原文・出どころ・全詳細属性を同じcontextへ復元する', async () => {
    const added = vi.fn();
    const first = render(<TaskInput draftKey="global" onTaskAdded={added} />);
    fireEvent.change(record(), { target: { value: '原文の一行目\n会議で見つけた背景' } });
    fireEvent.change(screen.getByRole('textbox', { name: '期限' }), { target: { value: '2026-12-20' } });
    fireEvent.click(screen.getByRole('button', { name: '出どころ' }));
    fireEvent.change(screen.getByPlaceholderText('メモ名・資料の場所'), { target: { value: '会議メモ.txt' } });
    fireEvent.click(screen.getByRole('button', { name: '詳細', exact: true }));
    fireEvent.change(screen.getByPlaceholderText('メモを入力...'), { target: { value: '編集できるメモ' } });
    fireEvent.change(field('プロジェクト'), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('textbox', { name: '日付' }), { target: { value: '2026-12-15' } });
    fireEvent.change(field('想定工数（分）'), { target: { value: '45' } });
    fireEvent.change(field('重要度'), { target: { value: '3' } });
    fireEvent.change(field('緊急度'), { target: { value: '2' } });
    chooseTag(2);
    first.unmount();

    render(<TaskInput draftKey="global" onTaskAdded={added} />);
    await waitFor(() => expect(record()).toHaveValue('原文の一行目\n会議で見つけた背景'));
    expect(screen.getByRole('textbox', { name: '期限' })).toHaveValue('2026-12-20');
    expect(screen.getByPlaceholderText('メモ名・資料の場所')).toHaveValue('会議メモ.txt');
    expect(screen.getByPlaceholderText('メモを入力...')).toHaveValue('編集できるメモ');
    expect(field('プロジェクト')).toHaveValue('2');
    expect(screen.getByRole('textbox', { name: '日付' })).toHaveValue('2026-12-15');
    expect(field('想定工数（分）')).toHaveValue(45);
    expect(field('重要度')).toHaveValue('3');
    expect(field('緊急度')).toHaveValue('2');
    expect(screen.getByRole('listbox', { name: 'タグ' })).toHaveValue(['2']);
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    await waitFor(() => expect(added).toHaveBeenCalledOnce());
    const rows = await db.select('SELECT * FROM tasks');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: '原文の一行目', capture_text: '原文の一行目\n会議で見つけた背景', notes: '編集できるメモ', source_ref: '会議メモ.txt', due_date: '2026-12-20', start_date: '2026-12-15', project_id: 2, estimated_hours: 45, importance_level: 3, urgency_level: 2 });
    expect(Object.keys(localStorage).filter(key => key.includes('task-input-draft'))).toHaveLength(0);
  });

  it.each(['期限だけ', '属性だけ'])('タイトルなしの%sの下書きも保持し、別contextへ混ぜない', async mode => {
    let view = render(<TaskInput draftKey="global" onTaskAdded={vi.fn()} />);
    if (mode === '期限だけ') fireEvent.change(screen.getByRole('textbox', { name: '期限' }), { target: { value: '2026-12-20' } });
    else {
      fireEvent.click(screen.getByRole('button', { name: '詳細', exact: true }));
      fireEvent.change(field('重要度'), { target: { value: '3' } });
    }
    view.unmount();
    view = render(<TaskInput defaultProjectId={2} onTaskAdded={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: '期限' })).toHaveValue('');
    view.unmount();
    render(<TaskInput draftKey="global" onTaskAdded={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '期限' })).toHaveValue(mode === '期限だけ' ? '2026-12-20' : ''));
    expect(record()).toHaveValue('');
    if (mode === '属性だけ') expect(field('重要度')).toHaveValue('3');
  });
});

describe('TaskInput partial persistence recovery', () => {
  it('下書きの選択タグが削除されたら本文作成前に止まり、明示的に外してから記録できる', async () => {
    const added = vi.fn();
    const view = render(<TaskInput draftKey="deleted-tag" onTaskAdded={added} />);
    fireEvent.change(record(), { target: { value: '原文\n背景はそのまま' } });
    fireEvent.change(screen.getByRole('textbox', { name: '期限' }), { target: { value: '2026-12-20' } });
    fireEvent.click(screen.getByRole('button', { name: '詳細', exact: true }));
    chooseTag(2);
    view.unmount();
    await db.execute('DELETE FROM tags WHERE id = $1', [2]);
    render(<TaskInput draftKey="deleted-tag" onTaskAdded={added} />);
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '削除済みタグを外す' })).toBeEnabled());
    expect(await db.select('SELECT id FROM tasks')).toHaveLength(0);
    expect(record()).toHaveValue('原文\n背景はそのまま');
    expect(record()).toBeEnabled();
    expect(screen.getByRole('listbox', { name: 'タグ' })).toHaveValue(['2']);
    fireEvent.click(screen.getByRole('button', { name: '削除済みタグを外す' }));
    expect(screen.getByRole('listbox', { name: 'タグ' })).toHaveValue([]);
    expect(await db.select('SELECT id FROM tasks')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    await waitFor(() => expect(added).toHaveBeenCalledOnce());
    expect(await db.select('SELECT capture_text, due_date FROM tasks')).toEqual([{ capture_text: '原文\n背景はそのまま', due_date: '2026-12-20' }]);
  });

  it('本文確定後にタグが削除されても、原文と確定IDを維持したままタグだけ外して復旧できる', async () => {
    const select = db.select.bind(db);
    let inject = true;
    vi.spyOn(db, 'select').mockImplementation(async (sql, params = []) => {
      if (inject && sql.includes('im.label as importance_label')) {
        inject = false; throw new Error('injected readback failure');
      }
      return select(sql, params);
    });
    const added = vi.fn();
    const view = render(<TaskInput draftKey="pending-deleted-tag" onTaskAdded={added} />);
    fireEvent.change(record(), { target: { value: '確定した原文\n背景' } });
    fireEvent.click(screen.getByRole('button', { name: '詳細', exact: true }));
    chooseTag(2);
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeEnabled());
    const [inserted] = await select('SELECT id FROM tasks');
    view.unmount();
    await db.execute('DELETE FROM tags WHERE id = $1', [2]);
    render(<TaskInput draftKey="pending-deleted-tag" onTaskAdded={added} />);
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '削除済みタグを外す' })).toBeEnabled());
    expect(record()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '削除済みタグを外す' }));
    expect(record()).toHaveValue('確定した原文\n背景');
    expect(record()).toBeDisabled();
    expect(JSON.parse(localStorage.getItem('yarukoto:task-input-draft:v1:pending-deleted-tag')).pendingTask.id).toBe(inserted.id);
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }));
    await waitFor(() => expect(added).toHaveBeenCalledOnce());
    expect(await select('SELECT id, capture_text FROM tasks')).toEqual([{ id: inserted.id, capture_text: '確定した原文\n背景' }]);
    expect(await select('SELECT * FROM task_tags')).toHaveLength(0);
  });

  it('部分保存した本文が別画面で削除されたら原文を下書きへ戻せて、自動再登録しない', async () => {
    const select = db.select.bind(db);
    let inject = true;
    vi.spyOn(db, 'select').mockImplementation(async (sql, params = []) => {
      if (inject && sql.includes('im.label as importance_label')) {
        inject = false; throw new Error('injected readback failure');
      }
      return select(sql, params);
    });
    const added = vi.fn();
    let view = render(<TaskInput draftKey="pending-deleted-task" onTaskAdded={added} />);
    fireEvent.change(record(), { target: { value: '消えた本文の原文\n背景' } });
    fireEvent.change(screen.getByRole('textbox', { name: '期限' }), { target: { value: '2026-12-20' } });
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeEnabled());
    const [inserted] = await select('SELECT id FROM tasks');
    view.unmount();
    await db.execute('DELETE FROM tasks WHERE id = $1', [inserted.id]);
    view = render(<TaskInput draftKey="pending-deleted-task" onTaskAdded={added} />);
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '下書きに戻す' })).toBeEnabled());
    expect(await select('SELECT id FROM tasks')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '下書きに戻す' }));
    expect(record()).toBeEnabled();
    expect(record()).toHaveValue('消えた本文の原文\n背景');
    expect(screen.getByRole('textbox', { name: '期限' })).toHaveValue('2026-12-20');
    expect(await select('SELECT id FROM tasks')).toHaveLength(0);
    expect(added).not.toHaveBeenCalled();
    view.unmount();
    render(<TaskInput draftKey="pending-deleted-task" onTaskAdded={added} />);
    expect(record()).toBeEnabled();
    expect(record()).toHaveValue('消えた本文の原文\n背景');
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    await waitFor(() => expect(added).toHaveBeenCalledOnce());
    expect(await select('SELECT capture_text, due_date FROM tasks')).toEqual([{ capture_text: '消えた本文の原文\n背景', due_date: '2026-12-20' }]);
  });

  it('保存中に閉じて開き直しても同じcontextで二重送信せず、完了を待って復元する', async () => {
    const execute = db.execute.bind(db);
    let releaseInsert;
    const barrier = new Promise(resolve => { releaseInsert = resolve; });
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params = []) => {
      if (/INSERT INTO tasks/.test(sql)) await barrier;
      return execute(sql, params);
    });
    const added = vi.fn();
    const first = render(<TaskInput draftKey="inflight" onTaskAdded={added} />);
    fireEvent.change(record(), { target: { value: '保存が終わる前に閉じる' } });
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    first.unmount();
    render(<TaskInput draftKey="inflight" onTaskAdded={added} />);
    const waitingWasDisabled = record().disabled || !!record().closest('fieldset[disabled]');
    await act(async () => { releaseInsert(); });
    await waitFor(() => expect(record()).toBeEnabled());
    expect(waitingWasDisabled).toBe(true);
    expect(record()).toHaveValue('');
    expect(await db.select('SELECT id FROM tasks')).toHaveLength(1);
    expect(added).toHaveBeenCalledOnce();
  });

  it.each(['selected-tag', 'inherited-tag', 'readback'])('%sの失敗後は同じ確定IDで回復し、再開しても重複しない', async failure => {
    const [parent] = await seedTasks(db, [{ title: '親', project_id: 2 }]);
    await linkTaskTags(db, parent, [1]);
    await db.execute("UPDATE app_settings SET value = '1' WHERE key = 'inherit_parent_tags'");
    const execute = db.execute.bind(db);
    const select = db.select.bind(db);
    let inject = true;
    vi.spyOn(db, 'execute').mockImplementation(async (sql, params = []) => {
      if (inject && /INSERT(?: OR IGNORE)? INTO task_tags/.test(sql) && params[1] === (failure === 'selected-tag' ? 2 : failure === 'inherited-tag' ? 1 : -1)) {
        inject = false; throw new Error('injected tag failure');
      }
      return execute(sql, params);
    });
    vi.spyOn(db, 'select').mockImplementation(async (sql, params = []) => {
      if (inject && failure === 'readback' && sql.includes('im.label as importance_label')) {
        inject = false; throw new Error('injected readback failure');
      }
      return select(sql, params);
    });
    const added = vi.fn();
    const view = render(<TaskInput predefinedParentId={parent} onTaskAdded={added} />);
    fireEvent.change(screen.getByRole('textbox', { name: '子タスクの記録' }), { target: { value: '原文を失わない\n背景' } });
    fireEvent.click(screen.getByRole('button', { name: '詳細', exact: true }));
    chooseTag(2);
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '保存を再試行' })).toBeEnabled());
    expect(added).not.toHaveBeenCalled();
    const inserted = (await select('SELECT * FROM tasks WHERE parent_id = $1', [parent]))[0];
    expect(inserted).toBeDefined();
    view.unmount();
    render(<TaskInput predefinedParentId={parent} onTaskAdded={added} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '子タスクの記録' })).toHaveValue('原文を失わない\n背景'));
    fireEvent.click(screen.getByRole('button', { name: '保存を再試行' }));
    await waitFor(() => expect(added).toHaveBeenCalledOnce());
    const children = await select('SELECT * FROM tasks WHERE parent_id = $1', [parent]);
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(inserted.id);
    expect(children[0].capture_text).toBe('原文を失わない\n背景');
    expect((await select('SELECT tag_id FROM task_tags WHERE task_id = $1 ORDER BY tag_id', [inserted.id])).map(row => row.tag_id)).toEqual([1, 2]);
  });

  it('onTaskAddedの例外を登録失敗と扱わず、保存済み下書きを残さない', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    render(<TaskInput draftKey="callback" onTaskAdded={() => { throw new Error('UI callback failed'); }} />);
    fireEvent.change(record(), { target: { value: '登録済みの仕事' } });
    fireEvent.click(screen.getByRole('button', { name: '記録' }));
    await waitFor(() => expect(record()).toHaveValue(''));
    expect(await db.select('SELECT id FROM tasks')).toHaveLength(1);
    expect(dispatch.mock.calls.filter(([event]) => event.type === 'yarukoto:toast' && event.detail.type === 'error')).toHaveLength(0);
    expect(Object.keys(localStorage).filter(key => key.includes('task-input-draft'))).toHaveLength(0);
  });
});
