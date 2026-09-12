/** @vitest-environment jsdom */
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkDetailPanel from '@/components/WorkDetailPanel';
import { createTestDb, linkTaskTags, seedTags } from '../__helpers__/testDb';

const api = vi.hoisted(() => ({ loadTaskContext: vi.fn(), rememberTask: vi.fn(), saveWorkContext: vi.fn(), createCapturedTask: vi.fn() }));
const statusApi = vi.hoisted(() => ({ change: vi.fn() }));
vi.mock('@/lib/workspace', () => api);
vi.mock('@/components/TaskEditModal', () => ({ default: () => null }));
vi.mock('@/hooks/useStatusActions', () => ({ useStatusActions: () => ({ handleStatusChange: statusApi.change }) }));

function example(id) {
    return {
        task: { id, title: '移行方式を決める', capture_text: '人事マスタのコードが使えないかも。9/18に判断する。', notes: 'データの所在を確認。例外件数は未確認。', project_id: 1, project_name: '移行', status_code: 1, tags: [] },
        ancestors: [{ id: 500, title: '移行準備', due_date: '2026-09-18' }],
        descendants: [{ id: id + 1, title: '例外を調べる', depth: 1, status_code: 1 }, { id: id + 2, title: 'データの所在を確認', depth: 2, status_code: 1 }],
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    api.rememberTask.mockResolvedValue({});
    api.saveWorkContext.mockResolvedValue({});
    api.createCapturedTask.mockResolvedValue(9999);
    statusApi.change.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('WorkDetailPanel preserves the work during persistence and navigation', () => {
    it('shows the complete captured context before an empty work memo and folds it when a memo exists', async () => {
        const original = '人事マスタのコードが使えないかも。\n例外件数はまだ分からない。\n9/18の定例で移行方式を決める。';
        const captured = example(881);
        captured.task.capture_text = original;
        captured.task.notes = '';
        captured.descendants = [];
        api.loadTaskContext.mockResolvedValue(captured);
        const view = render(createElement(WorkDetailPanel, { taskId: 881 }));
        const notes = await screen.findByLabelText('作業メモ');
        const raw = screen.getByText((_, node) => node.tagName === 'P' && node.textContent === original);
        expect(raw.closest('details').open).toBe(true);
        expect(raw.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(notes.rows).toBe(4);
        expect(screen.queryByLabelText('次の作業')).toBeNull();

        api.loadTaskContext.mockResolvedValue(example(882));
        view.rerender(createElement(WorkDetailPanel, { taskId: 882 }));
        await screen.findByDisplayValue(example(882).task.notes);
        expect(screen.getByText(example(882).task.capture_text).closest('details').open).toBe(false);
    });

    it('keeps edited text and the panel open when saving on close fails', async () => {
        api.loadTaskContext.mockResolvedValue(example(801));
        api.saveWorkContext.mockRejectedValue(new Error('database is locked'));
        const onClose = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 801, onClose }));
        const notes = await screen.findByLabelText('作業メモ');
        fireEvent.change(notes, { target: { value: '確認済みの範囲を失わない' } });
        fireEvent.click(screen.getByRole('button', { name: '仕事の内容を閉じる' }));
        await screen.findByRole('alert');
        expect(onClose).not.toHaveBeenCalled();
        expect(notes.value).toBe('確認済みの範囲を失わない');
        expect(api.saveWorkContext).toHaveBeenCalledWith(801, { notes: '確認済みの範囲を失わない' });
    });

    it('opens a descendant only after the pending note has been saved', async () => {
        api.loadTaskContext.mockResolvedValue(example(811));
        let finishSaving;
        api.saveWorkContext.mockImplementation(() => new Promise(resolve => { finishSaving = resolve; }));
        const onOpenTask = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 811, onOpenTask }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '次は例外を確認' } });
        fireEvent.click(screen.getByRole('button', { name: /例外を調べる/ }));
        await waitFor(() => expect(api.saveWorkContext).toHaveBeenCalled());
        expect(onOpenTask).not.toHaveBeenCalled();
        await act(async () => finishSaving({}));
        await waitFor(() => expect(onOpenTask).toHaveBeenCalledWith(812));
    });

    it('creates one selected child while keeping the original and memo intact', async () => {
        api.loadTaskContext.mockResolvedValue(example(821));
        render(createElement(WorkDetailPanel, { taskId: 821 }));
        const notes = await screen.findByLabelText('作業メモ');
        notes.focus();
        notes.setSelectionRange(0, 'データの所在を確認'.length);
        fireEvent.select(notes);
        fireEvent.click(screen.getByRole('button', { name: '子タスクにする' }));
        expect(screen.getByLabelText('子タスク').value).toBe('データの所在を確認');
        fireEvent.click(screen.getByRole('button', { name: '追加', exact: true }));
        await waitFor(() => expect(api.createCapturedTask).toHaveBeenCalledWith({ text: 'データの所在を確認', source_ref: '', parent_id: 821, project_id: 1 }));
        expect(notes.value).toBe(example(821).task.notes);
        expect(screen.getByText(example(821).task.capture_text)).toBeTruthy();
    });

    it('closes the child form after a committed creation even if optional tag inheritance fails', async () => {
        const workspace = await vi.importActual('@/lib/workspace');
        const db = await createTestDb();
        const parent = await workspace.createCapturedTask({ text: '親の原文' });
        const tags = await seedTags(db, [{ name: '確認' }]);
        await linkTaskTags(db, parent, tags);
        await db.execute("UPDATE app_settings SET value = '1' WHERE key = 'inherit_parent_tags'");
        const execute = db.execute.bind(db);
        vi.spyOn(db, 'execute').mockImplementation((sql, params) => {
            if (sql.includes('INSERT OR IGNORE INTO task_tags')) return Promise.reject(new Error('tag write failed'));
            return execute(sql, params);
        });
        const dispatch = vi.spyOn(window, 'dispatchEvent');
        for (const name of Object.keys(api)) api[name].mockImplementation(workspace[name]);
        const onChanged = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: parent, onChanged }));
        await screen.findByLabelText('作業メモ');
        fireEvent.click(screen.getByRole('button', { name: '子タスクを追加', exact: true }));
        fireEvent.change(screen.getByLabelText('子タスク'), { target: { value: '新しい作業' } });
        fireEvent.click(screen.getByRole('button', { name: '追加', exact: true }));

        await waitFor(() => expect(screen.queryByLabelText('子タスク')).toBeNull());
        await screen.findByRole('button', { name: /新しい作業/ });
        expect(screen.queryByRole('alert')).toBeNull();
        expect(onChanged).toHaveBeenCalledOnce();
        expect(api.createCapturedTask).toHaveBeenCalledOnce();
        expect((await db.select('SELECT COUNT(*) AS count FROM tasks WHERE parent_id = $1', [parent]))[0].count).toBe(1);
        expect(dispatch.mock.calls.some(([event]) => event.type === 'yarukoto:toast' && event.detail.message === '子タスクは保存済みです。タグの継承に失敗しました')).toBe(true);
        dispatch.mockRestore();
    });

    it('stores the next action as a descendant reference without duplicating its title', async () => {
        api.loadTaskContext.mockResolvedValue(example(831));
        render(createElement(WorkDetailPanel, { taskId: 831 }));
        fireEvent.change(await screen.findByLabelText('次の作業'), { target: { value: '833' } });
        fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
        await waitFor(() => expect(api.saveWorkContext).toHaveBeenCalledWith(831, { next_task_id: 833 }));
        expect(api.createCapturedTask).not.toHaveBeenCalled();
    });

    it('does not silently discard a child still being written when Escape is pressed', async () => {
        api.loadTaskContext.mockResolvedValue(example(841));
        const onClose = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 841, onClose }));
        await screen.findByLabelText('作業メモ');
        fireEvent.click(screen.getByRole('button', { name: '子タスクを追加', exact: true }));
        fireEvent.change(screen.getByLabelText('子タスク'), { target: { value: 'まだ入力中' } });
        fireEvent.keyDown(document, { key: 'Escape' });
        await screen.findByRole('alert');
        expect(screen.getByLabelText('子タスク').value).toBe('まだ入力中');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('saves notes before delegating start, then saves interruption without changing status', async () => {
        const initial = example(851);
        api.loadTaskContext.mockResolvedValue(initial);
        statusApi.change.mockImplementation(async () => {
            api.loadTaskContext.mockResolvedValue({ ...initial, task: { ...initial.task, notes: '通常コードは確認済み', status_code: 2 } });
        });
        const onClose = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 851, onClose }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '通常コードは確認済み' } });
        fireEvent.click(screen.getByRole('button', { name: '着手', exact: true }));
        await screen.findByRole('button', { name: '保存して中断' });
        expect(statusApi.change).toHaveBeenCalledWith(851, 2);
        expect(api.saveWorkContext.mock.invocationCallOrder[0]).toBeLessThan(statusApi.change.mock.invocationCallOrder[0]);
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '次は旧部門コードの例外を確認' } });
        fireEvent.click(screen.getByRole('button', { name: '保存して中断' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(api.saveWorkContext).toHaveBeenLastCalledWith(851, { notes: '次は旧部門コードの例外を確認' });
        expect(statusApi.change).toHaveBeenCalledTimes(1);
    });

    it('does not mark work complete if its pending note cannot be saved', async () => {
        api.loadTaskContext.mockResolvedValue(example(861));
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        render(createElement(WorkDetailPanel, { taskId: 861 }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '合意した判断を保持' } });
        fireEvent.click(screen.getByRole('button', { name: '完了', exact: true }));
        await screen.findByRole('alert');
        expect(statusApi.change).not.toHaveBeenCalled();
        expect(screen.getByLabelText('作業メモ').value).toBe('合意した判断を保持');
    });

    it('delegates completion to the existing status hook and reports its failure', async () => {
        api.loadTaskContext.mockResolvedValue(example(871));
        statusApi.change.mockRejectedValue(new Error('write failed'));
        render(createElement(WorkDetailPanel, { taskId: 871 }));
        await screen.findByLabelText('作業メモ');
        fireEvent.click(screen.getByRole('button', { name: '完了', exact: true }));
        await screen.findByRole('alert');
        expect(statusApi.change).toHaveBeenCalledWith(871, 3);
        expect(screen.getByLabelText('作業メモ').value).toBe(example(871).task.notes);
    });
});
