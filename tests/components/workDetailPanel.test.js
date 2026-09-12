/** @vitest-environment jsdom */
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkDetailPanel from '@/components/WorkDetailPanel';
import { createTestDb, linkTaskTags, seedTags } from '../__helpers__/testDb';

const api = vi.hoisted(() => ({ loadTaskContext: vi.fn(), rememberTask: vi.fn(), saveWorkContext: vi.fn(), createCapturedTask: vi.fn(), setTaskPlan: vi.fn(), resolveWaiting: vi.fn() }));
const statusApi = vi.hoisted(() => ({ change: vi.fn() }));
const references = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/lib/workspace', () => api);
vi.mock('@/lib/workReferences', () => ({ classifyWorkReference: value => ({ kind: value.startsWith('https://') ? 'url' : 'text', label: value, target: value }), openWorkReference: references.open }));
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
    localStorage.clear();
    api.rememberTask.mockResolvedValue({});
    api.saveWorkContext.mockResolvedValue({});
    api.createCapturedTask.mockResolvedValue(9999);
    api.setTaskPlan.mockResolvedValue({});
    api.resolveWaiting.mockResolvedValue({});
    references.open.mockResolvedValue(undefined);
    statusApi.change.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function openChildren() {
    const summary = screen.getByText('子タスク', { selector: 'summary' });
    summary.closest('details').open = true;
    fireEvent(summary.closest('details'), new Event('toggle'));
}

describe('WorkDetailPanel supports work without requiring another management screen', () => {
    it('uses a selected memo as the next step without making a child or changing the memo', async () => {
        const context = example(1001);
        context.descendants = [];
        api.loadTaskContext.mockResolvedValue(context);
        render(createElement(WorkDetailPanel, { taskId: 1001 }));
        const notes = await screen.findByLabelText('作業メモ');
        notes.focus();
        notes.setSelectionRange(0, 'データの所在を確認'.length);
        fireEvent.select(notes);
        fireEvent.click(screen.getByRole('button', { name: '今する一歩に' }));
        expect(screen.getByLabelText('今する一歩').value).toBe('データの所在を確認');
        expect(notes.value).toBe(context.task.notes);
        fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
        await waitFor(() => expect(api.saveWorkContext).toHaveBeenCalledWith(1001, { next_step: 'データの所在を確認' }));
        expect(api.createCapturedTask).not.toHaveBeenCalled();
    });

    it('changes today planning directly, after saving, without sending a deadline edit', async () => {
        const context = example(1011);
        context.task.due_date = '2026-09-18';
        api.loadTaskContext.mockResolvedValue(context);
        api.setTaskPlan.mockImplementation(async (id, date) => {
            context.task.today_date = date;
        });
        render(createElement(WorkDetailPanel, { taskId: 1011 }));
        fireEvent.change(await screen.findByLabelText('今する一歩'), { target: { value: 'サンプルを5件見る' } });
        fireEvent.click(screen.getByRole('button', { name: '今日やる' }));
        await screen.findByRole('button', { name: '今日から外す' });
        expect(api.setTaskPlan).toHaveBeenCalledWith(1011, new Date().toLocaleDateString('sv-SE'));
        expect(api.saveWorkContext).toHaveBeenCalledWith(1011, { next_step: 'サンプルを5件見る' });
        expect(api.saveWorkContext.mock.invocationCallOrder[0]).toBeLessThan(api.setTaskPlan.mock.invocationCallOrder[0]);
        fireEvent.click(screen.getByRole('button', { name: '今日から外す' }));
        await waitFor(() => expect(api.setTaskPlan).toHaveBeenLastCalledWith(1011, null));
        expect(context.task.due_date).toBe('2026-09-18');
    });

    it('keeps a reference visible after notes exist and opens it without searching the original', async () => {
        const context = example(1021);
        context.task.source_ref = 'https://example.com/source';
        api.loadTaskContext.mockResolvedValue(context);
        render(createElement(WorkDetailPanel, { taskId: 1021 }));
        const open = await screen.findByRole('button', { name: 'https://example.com/source' });
        expect(open.closest('details')).toBeNull();
        fireEvent.click(open);
        await waitFor(() => expect(references.open).toHaveBeenCalledWith(context.task.source_ref));
        expect(screen.getByText(context.task.capture_text).closest('details').open).toBe(false);
    });

    it('resolves waiting explicitly and preserves a memo written while waiting', async () => {
        const context = example(1031);
        context.task.waiting_on = '人事担当からのファイル';
        context.task.review_date = '2026-09-14';
        context.task.status_code = 4;
        api.loadTaskContext.mockResolvedValue(context);
        api.resolveWaiting.mockImplementation(async () => {
            context.task = { ...context.task, waiting_on: '', review_date: '', status_code: 1 };
        });
        render(createElement(WorkDetailPanel, { taskId: 1031 }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: 'ファイル到着。例外だけ確認する' } });
        fireEvent.click(screen.getByRole('button', { name: '待ちを解消' }));
        await waitFor(() => expect(api.resolveWaiting).toHaveBeenCalledWith(1031));
        expect(api.saveWorkContext).toHaveBeenCalledWith(1031, { notes: 'ファイル到着。例外だけ確認する' });
        expect(api.saveWorkContext.mock.invocationCallOrder[0]).toBeLessThan(api.resolveWaiting.mock.invocationCallOrder[0]);
        expect(statusApi.change).not.toHaveBeenCalled();
    });

    it('lets embedded navigation save first and blocks switching when the save fails', async () => {
        api.loadTaskContext.mockResolvedValue(example(1041));
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        const navigationRef = { current: null };
        const onClose = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 1041, embedded: true, navigationRef, onClose }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '切替前のメモ' } });
        let allowed;
        await act(async () => { allowed = await navigationRef.current(); });
        expect(allowed).toBe(false);
        expect(screen.getByLabelText('作業メモ').value).toBe('切替前のメモ');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(document.body.style.overflow).not.toBe('hidden');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();

        api.saveWorkContext.mockResolvedValue({});
        await act(async () => { allowed = await navigationRef.current(); });
        expect(allowed).toBe(true);
    });

    it('keeps only edited fields in a recoverable local draft', async () => {
        const context = example(1051);
        api.loadTaskContext.mockResolvedValue(context);
        const view = render(createElement(WorkDetailPanel, { taskId: 1051, embedded: true }));
        fireEvent.change(await screen.findByLabelText('今する一歩'), { target: { value: '例外を5件だけ確認' } });
        expect(JSON.parse(localStorage.getItem('yarukoto:work-draft:v1:1051'))).toEqual({ fields: { next_step: '例外を5件だけ確認' }, childText: '' });
        view.unmount();
        context.task.notes = '別の場所で保存された新しいメモ';
        render(createElement(WorkDetailPanel, { taskId: 1051, embedded: true }));
        expect((await screen.findByLabelText('今する一歩')).value).toBe('例外を5件だけ確認');
        expect(screen.getByLabelText('作業メモ').value).toBe('別の場所で保存された新しいメモ');
        fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
        await waitFor(() => expect(localStorage.getItem('yarukoto:work-draft:v1:1051')).toBeNull());
    });

    it('reports a failed reference opening while keeping the saved work intact', async () => {
        const context = example(1061);
        context.task.source_ref = 'https://example.com/document';
        api.loadTaskContext.mockResolvedValue(context);
        references.open.mockRejectedValue(new Error('ファイルが見つかりません'));
        render(createElement(WorkDetailPanel, { taskId: 1061 }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '通常分は確認済み' } });
        fireEvent.click(screen.getByRole('button', { name: 'https://example.com/document' }));
        await screen.findByRole('alert');
        expect(screen.getByLabelText('作業メモ').value).toBe('通常分は確認済み');
        expect(api.saveWorkContext).toHaveBeenCalledWith(1061, { notes: '通常分は確認済み' });
        expect(api.saveWorkContext.mock.invocationCallOrder[0]).toBeLessThan(references.open.mock.invocationCallOrder[0]);
    });

    it('does not change today planning when its pending work cannot be saved', async () => {
        api.loadTaskContext.mockResolvedValue(example(1071));
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        render(createElement(WorkDetailPanel, { taskId: 1071 }));
        fireEvent.change(await screen.findByLabelText('今する一歩'), { target: { value: 'まず旧コードだけ' } });
        fireEvent.click(screen.getByRole('button', { name: '今日やる' }));
        await screen.findByRole('alert');
        expect(api.setTaskPlan).not.toHaveBeenCalled();
        expect(screen.getByLabelText('今する一歩').value).toBe('まず旧コードだけ');
    });

    it('reflects status and planning changed outside the panel while retaining its edited memo', async () => {
        const context = example(1081);
        api.loadTaskContext.mockImplementation(async () => ({ ...context, task: { ...context.task } }));
        render(createElement(WorkDetailPanel, { taskId: 1081, embedded: true }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '右側で入力中のメモ' } });
        context.task.status_code = 2;
        context.task.today_date = new Date().toLocaleDateString('sv-SE');
        context.task.next_step = '左側の変更で得た次の一歩';
        fireEvent(window, new CustomEvent('yarukoto:tasksChanged'));
        await screen.findByRole('button', { name: '今日から外す' });
        expect(screen.getByRole('button', { name: '保存して中断' })).toBeTruthy();
        expect(screen.getByLabelText('今する一歩').value).toBe(context.task.next_step);
        expect(screen.getByLabelText('作業メモ').value).toBe('右側で入力中のメモ');
        fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
        await waitFor(() => expect(api.saveWorkContext).toHaveBeenCalledWith(1081, { notes: '右側で入力中のメモ' }));
    });

    it('defers a refresh during its own save and does not reintroduce a saved draft', async () => {
        const context = example(1091);
        api.loadTaskContext.mockImplementation(async () => ({ ...context, task: { ...context.task } }));
        let completeSave;
        api.saveWorkContext.mockImplementation((id, patch) => new Promise(resolve => {
            fireEvent(window, new CustomEvent('yarukoto:tasksChanged'));
            completeSave = () => { Object.assign(context.task, patch, { today_date: new Date().toLocaleDateString('sv-SE') }); resolve({}); };
        }));
        render(createElement(WorkDetailPanel, { taskId: 1091, embedded: true }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '保存されるメモ' } });
        fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
        await waitFor(() => expect(completeSave).toBeTypeOf('function'));
        await act(async () => completeSave());
        await screen.findByRole('button', { name: '今日から外す' });
        expect(screen.getByLabelText('作業メモ').value).toBe('保存されるメモ');
        expect(screen.getByRole('button', { name: '保存', exact: true }).disabled).toBe(true);
        expect(localStorage.getItem('yarukoto:work-draft:v1:1091')).toBeNull();
        expect(api.saveWorkContext).toHaveBeenCalledTimes(1);
    });
});

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
        expect(screen.getByLabelText('今する一歩').value).toBe('');
        expect(screen.queryByLabelText('次の子タスク')).toBeNull();

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
        openChildren();
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
        openChildren();
        fireEvent.click(screen.getByRole('button', { name: '子タスクを追加', exact: true }));
        fireEvent.change(screen.getByLabelText('子タスク'), { target: { value: '新しい作業' } });
        fireEvent.click(screen.getByRole('button', { name: '追加', exact: true }));

        await waitFor(() => expect(screen.queryByLabelText('子タスク')).toBeNull());
        openChildren();
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
        fireEvent.change(await screen.findByLabelText('次の子タスク'), { target: { value: '833' } });
        fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
        await waitFor(() => expect(api.saveWorkContext).toHaveBeenCalledWith(831, { next_task_id: 833 }));
        expect(api.createCapturedTask).not.toHaveBeenCalled();
    });

    it('does not silently discard a child still being written when Escape is pressed', async () => {
        api.loadTaskContext.mockResolvedValue(example(841));
        const onClose = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 841, onClose }));
        await screen.findByLabelText('作業メモ');
        openChildren();
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
