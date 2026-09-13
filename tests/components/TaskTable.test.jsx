/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskList from '@/components/TaskList';
import { createTestDb, seedTasks } from '../__helpers__/testDb';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/WorkDetailPanel', () => ({ default: ({ taskId, onClose }) => <div>詳細 {taskId}<button onClick={onClose}>詳細を閉じる</button></div> }));
vi.mock('@/components/TaskInput', () => ({ default: ({ defaultProjectId, predefinedParentId }) => <input aria-label="追加先" value={`${defaultProjectId || ''}/${predefinedParentId || ''}`} readOnly /> }));
let db, ids;
beforeEach(async () => {
    localStorage.clear(); db = await createTestDb();
    ids = await seedTasks(db, [{ title: '移行計画', due_date: '2026-10-01' }, { title: 'データ検証' }, { title: '例外を確認' }]);
    await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [ids[0], ids[1]]);
    await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [ids[1], ids[2]]);
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe('管理一覧を使う流れ', () => {
    it('状態フィルターは選んだ状態を表示し、解除すると全件へ戻る', async () => {
        await db.execute('UPDATE tasks SET status_code = 4 WHERE id = $1', [ids[2]]);
        render(<TaskList />);
        await screen.findByRole('button', { name: '例外を確認' });
        fireEvent.click(screen.getByRole('button', { name: /状態.*▾/ }));
        fireEvent.click(screen.getByLabelText('保留'));
        expect(screen.getByLabelText('例外を確認を選択')).toBeTruthy();
        expect(screen.queryByLabelText('移行計画を選択')).toBeNull();
        fireEvent.click(screen.getByLabelText('すべて'));
        expect(screen.getByLabelText('移行計画を選択')).toBeTruthy();
    });
    it('孫で絞っても親が分かり、選択対象を水増しせず、詳細を閉じても検索を維持する', async () => {
        render(<TaskList />);
        await screen.findByRole('button', { name: '例外を確認' });
        fireEvent.change(screen.getByLabelText('タスクを検索'), { target: { value: '例外' } });
        expect(screen.getByRole('button', { name: '移行計画' })).toBeTruthy();
        expect(screen.queryByLabelText('移行計画を選択')).toBeNull();
        expect(screen.getByLabelText('例外を確認を選択')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '例外を確認' }));
        expect(await screen.findByText(`詳細 ${ids[2]}`)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '詳細を閉じる' }));
        expect(screen.getByLabelText('タスクを検索').value).toBe('例外');
    });
    it('二件の実行予定を一括変更し、期限を保ったまま取り消せる', async () => {
        render(<TaskList />);
        fireEvent.click(await screen.findByLabelText('移行計画を選択'));
        fireEvent.click(screen.getByLabelText('データ検証を選択'));
        fireEvent.change(screen.getByLabelText('まとめて変更する項目'), { target: { value: 'today_date' } });
        fireEvent.change(screen.getByLabelText('まとめて変更する値'), { target: { value: '2026-09-20' } });
        fireEvent.click(screen.getByRole('button', { name: '適用' }));
        await screen.findByRole('button', { name: '変更を元に戻す' });
        expect((await db.select('SELECT * FROM tasks WHERE id = $1', [ids[0]]))[0]).toMatchObject({ today_date: '2026-09-20', due_date: '2026-10-01' });
        fireEvent.click(screen.getByRole('button', { name: '変更を元に戻す' }));
        await waitFor(async () => expect((await db.select('SELECT today_date FROM tasks WHERE id = $1', [ids[0]]))[0].today_date).toBeNull());
    });
    it('孫タスクの追加先を引き継ぎ、Escで一覧へ戻れる', async () => {
        render(<TaskList />);
        fireEvent.click(await screen.findByLabelText('データ検証の操作'));
        const row = screen.getByLabelText('データ検証の操作').closest('tr');
        fireEvent.click(within(row).getByRole('button', { name: '子タスク' }));
        expect(screen.getByLabelText('追加先').value).toBe(`/${ids[1]}`);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
