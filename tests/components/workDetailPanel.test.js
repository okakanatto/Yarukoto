/** @vitest-environment jsdom */
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkDetailPanel from '@/components/WorkDetailPanel';
import { createTestDb, linkTaskTags, seedTags } from '../__helpers__/testDb';
import { clearWorkDraftCache } from '@/lib/workDrafts';

const api = vi.hoisted(() => ({ loadTaskContext: vi.fn(), rememberTask: vi.fn(), saveWorkContext: vi.fn(), createCapturedTask: vi.fn(), setTaskPlan: vi.fn(), resolveWaiting: vi.fn(), finishWorkStep: vi.fn(), stampWorkStarted: vi.fn() }));
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
    api.finishWorkStep.mockResolvedValue({});
    api.stampWorkStarted.mockResolvedValue({});
    references.open.mockResolvedValue(undefined);
    statusApi.change.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

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
        expect(screen.getByRole('button', { name: '再開する' })).toBeTruthy();
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
        await waitFor(() => expect(api.createCapturedTask).toHaveBeenCalledWith({ text: 'データの所在を確認', source_ref: '', parent_id: 821, project_id: 1 }));
        await waitFor(() => expect(api.saveWorkContext).toHaveBeenCalledWith(821, { next_task_id: 9999 }));
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
        fireEvent.change(await screen.findByLabelText('一歩にする子タスク'), { target: { value: '833' } });
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
        fireEvent.click(screen.getByRole('button', { name: '取りかかる', exact: true }));
        await screen.findByRole('button', { name: '区切る' });
        expect(statusApi.change).toHaveBeenCalledWith(851, 2);
        expect(api.saveWorkContext.mock.invocationCallOrder[0]).toBeLessThan(statusApi.change.mock.invocationCallOrder[0]);
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '次は旧部門コードの例外を確認' } });
        fireEvent.click(screen.getByRole('button', { name: '区切る' }));
        fireEvent.click(screen.getByRole('button', { name: '保存して中断' }));
        await waitFor(() => expect(api.finishWorkStep).toHaveBeenCalledWith(851, { result: '', next_step: '', stepCompleted: false }));
        await screen.findByRole('button', { name: '再開する' });
        expect(onClose).toHaveBeenCalledOnce();
        expect(api.saveWorkContext).toHaveBeenLastCalledWith(851, { notes: '次は旧部門コードの例外を確認' });
        expect(statusApi.change).toHaveBeenCalledTimes(1);
    });

    it('does not mark work complete if its pending note cannot be saved', async () => {
        api.loadTaskContext.mockResolvedValue(example(861));
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        render(createElement(WorkDetailPanel, { taskId: 861 }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '合意した判断を保持' } });
        fireEvent.click(screen.getByRole('button', { name: '仕事全体を完了', exact: true }));
        await screen.findByRole('alert');
        expect(statusApi.change).not.toHaveBeenCalled();
        expect(screen.getByLabelText('作業メモ').value).toBe('合意した判断を保持');
    });

    it('delegates completion to the existing status hook and reports its failure', async () => {
        api.loadTaskContext.mockResolvedValue({ ...example(871), descendants: [] });
        statusApi.change.mockRejectedValue(new Error('write failed'));
        render(createElement(WorkDetailPanel, { taskId: 871 }));
        await screen.findByLabelText('作業メモ');
        fireEvent.click(screen.getByRole('button', { name: '仕事全体を完了', exact: true }));
        await screen.findByRole('alert');
        expect(statusApi.change).toHaveBeenCalledWith(871, 3);
        expect(screen.getByLabelText('作業メモ').value).toBe(example(871).task.notes);
    });
});

describe('WorkDetailPanel makes a safe work session rather than another checklist', () => {
    it('autosaves without locking typing and flushes the edit made during the first write before navigation', async () => {
        const context = example(1201);
        context.descendants = [];
        api.loadTaskContext.mockImplementation(async () => ({ ...context, task: { ...context.task } }));
        const writes = [];
        api.saveWorkContext.mockImplementation((id, patch) => new Promise(resolve => {
            writes.push(() => { Object.assign(context.task, patch); resolve(context.task); });
        }));
        const navigationRef = { current: null };
        render(createElement(WorkDetailPanel, { taskId: 1201, embedded: true, navigationRef }));
        const notes = await screen.findByLabelText('作業メモ');
        fireEvent.change(notes, { target: { value: '通常分を確認した' } });
        expect(JSON.parse(localStorage.getItem('yarukoto:work-draft:v1:1201')).fields.notes).toBe('通常分を確認した');
        await waitFor(() => expect(writes).toHaveLength(1));
        expect(notes.disabled).toBe(false);
        fireEvent.change(notes, { target: { value: '通常分を確認した。次は例外を3件見る' } });
        let navigationDone = false;
        let leaving;
        act(() => { leaving = navigationRef.current().then(value => { navigationDone = value; }); });
        expect(navigationDone).toBe(false);
        await act(async () => writes[0]());
        expect(writes).toHaveLength(2);
        expect(navigationDone).toBe(false);
        await act(async () => { writes[1](); await leaving; });
        expect(navigationDone).toBe(true);
        expect(context.task.notes).toBe('通常分を確認した。次は例外を3件見る');
        expect(api.saveWorkContext).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem('yarukoto:work-draft:v1:1201')).toBeNull();
    });

    it('guards a real internal link, including a failed save and a later successful retry', async () => {
        api.loadTaskContext.mockResolvedValue(example(1211));
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        const navigate = vi.fn(event => event.preventDefault());
        render(createElement('div', {}, createElement('a', { href: '/projects', onClick: navigate }, 'プロジェクトへ'), createElement(WorkDetailPanel, { taskId: 1211, embedded: true })));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '他画面へ移る前の結論' } });
        fireEvent.click(screen.getByRole('link', { name: 'プロジェクトへ' }));
        await screen.findByRole('alert');
        expect(navigate).not.toHaveBeenCalled();
        api.saveWorkContext.mockResolvedValue({});
        fireEvent.click(screen.getByRole('link', { name: 'プロジェクトへ' }));
        await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
        expect(localStorage.getItem('yarukoto:work-draft:v1:1211')).toBeNull();
    });

    it('does not start while browsing and a five minute session never changes completion or deadlines by elapsed time', async () => {
        const context = example(1221);
        context.task.due_date = '2026-09-18';
        context.task.source_ref = 'https://example.com/material';
        context.descendants = [];
        api.loadTaskContext.mockImplementation(async () => ({ ...context, task: { ...context.task } }));
        statusApi.change.mockImplementation(async (id, code) => { context.task.status_code = code; });
        const onWorkStarted = vi.fn(), onFocusChange = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 1221, onWorkStarted, onFocusChange }));
        await screen.findByLabelText('作業メモ');
        expect(statusApi.change).not.toHaveBeenCalled();
        expect(onWorkStarted).not.toHaveBeenCalled();
        vi.useFakeTimers();
        await act(async () => fireEvent.click(screen.getByRole('button', { name: '5分だけ' })));
        expect(onWorkStarted).toHaveBeenCalledExactlyOnceWith(1221);
        expect(onFocusChange).toHaveBeenCalledWith(true);
        await act(async () => vi.advanceTimersByTime(301000));
        expect(screen.getByLabelText('作業の経過時間').textContent).toBe('5:01 / 5:00');
        expect(screen.getByRole('button', { name: '区切る' })).toBeTruthy();
        expect(context.task.status_code).toBe(2);
        expect(context.task.due_date).toBe('2026-09-18');
        expect(api.finishWorkStep).not.toHaveBeenCalled();
        expect(api.setTaskPlan).not.toHaveBeenCalled();
        expect(references.open).not.toHaveBeenCalled();
        expect(statusApi.change).toHaveBeenCalledTimes(1);
    });

    it('honors a requested start once and records an explicit resume of an already started task', async () => {
        const context = example(1231);
        context.task.status_code = 2;
        api.loadTaskContext.mockResolvedValue(context);
        const onWorkStarted = vi.fn();
        const view = render(createElement(WorkDetailPanel, { taskId: 1231, onWorkStarted, startRequested: { token: 1, minutes: null } }));
        await screen.findByRole('button', { name: '区切る' });
        expect(api.stampWorkStarted).toHaveBeenCalledExactlyOnceWith(1231);
        expect(statusApi.change).not.toHaveBeenCalled();
        view.rerender(createElement(WorkDetailPanel, { taskId: 1231, onWorkStarted, startRequested: { token: 1, minutes: null } }));
        expect(onWorkStarted).toHaveBeenCalledOnce();
    });

    it('records a consumed free step and an optional result without completing its work or copying the entire memo', async () => {
        const workspace = await vi.importActual('@/lib/workspace');
        const db = await createTestDb();
        const id = await workspace.createCapturedTask({ text: '移行方式を考える\n旧コードの重複が懸念' });
        await workspace.saveWorkContext(id, { notes: '長い検討背景はここに一度だけ保持', next_step: '旧コードを3件見る' });
        await db.execute('UPDATE tasks SET status_code = 2 WHERE id = $1', [id]);
        for (const name of Object.keys(api)) api[name].mockImplementation(workspace[name]);
        render(createElement(WorkDetailPanel, { taskId: id }));
        fireEvent.click(await screen.findByRole('button', { name: '再開する' }));
        fireEvent.click(await screen.findByRole('button', { name: '一歩を終える' }));
        fireEvent.change(screen.getByLabelText('進んだこと（任意）'), { target: { value: '重複は旧部門だけと判明' } });
        fireEvent.change(screen.getByLabelText('次の一歩（任意）'), { target: { value: '人事担当に対応表を確認' } });
        fireEvent.click(screen.getByRole('button', { name: '記録する' }));
        await screen.findByRole('button', { name: '再開する' });
        const saved = await workspace.loadTaskContext(id);
        expect(saved.task.status_code).toBe(2);
        expect(saved.task.next_step).toBe('人事担当に対応表を確認');
        expect(saved.task.notes).toBe('長い検討背景はここに一度だけ保持');
        expect(saved.entries).toHaveLength(1);
        expect(saved.entries[0]).toMatchObject({ kind: 'step', consumed_step: '旧コードを3件見る', result: '重複は旧部門だけと判明' });
        expect(saved.task.work_log).not.toContain(saved.task.notes);
        expect(localStorage.getItem(`yarukoto:work-draft:v1:${id}`)).toBeNull();
    });

    it('treats a child reference as the step, preserves the old free step and blocks premature whole-work completion', async () => {
        const context = example(1241);
        context.task.next_step = '例外件数を先に確認';
        api.loadTaskContext.mockResolvedValue(context);
        render(createElement(WorkDetailPanel, { taskId: 1241 }));
        fireEvent.change(await screen.findByLabelText('一歩にする子タスク'), { target: { value: '1242' } });
        expect(screen.queryByLabelText('今する一歩')).toBeNull();
        expect(screen.getByLabelText('作業メモ').value).toBe(`${context.task.notes}\n\n例外件数を先に確認`);
        fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
        await waitFor(() => expect(api.saveWorkContext).toHaveBeenCalledWith(1241, { next_task_id: 1242, next_step: '', notes: `${context.task.notes}\n\n例外件数を先に確認` }));
        fireEvent.click(screen.getByRole('button', { name: '仕事全体を完了' }));
        await screen.findByRole('alert');
        expect(statusApi.change).not.toHaveBeenCalled();
    });

    it('keeps an unsuccessful pause recoverable across an app restart and saves it when closing', async () => {
        const context = example(1251);
        context.task.status_code = 2;
        context.task.next_step = '旧コードを確認';
        context.descendants = [];
        api.loadTaskContext.mockImplementation(async () => ({ ...context, task: { ...context.task } }));
        api.finishWorkStep.mockRejectedValue(new Error('disk full'));
        const onClose = vi.fn();
        const view = render(createElement(WorkDetailPanel, { taskId: 1251, onClose }));
        fireEvent.click(await screen.findByRole('button', { name: '再開する' }));
        fireEvent.click(await screen.findByRole('button', { name: '区切る' }));
        fireEvent.change(screen.getByLabelText('進んだこと（任意）'), { target: { value: '例外が2件あると判明' } });
        fireEvent.change(screen.getByLabelText('次の一歩（任意）'), { target: { value: '例外の担当者を確認' } });
        fireEvent.click(screen.getByRole('button', { name: '保存して中断' }));
        await screen.findByRole('alert');
        expect(onClose).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem('yarukoto:work-draft:v1:1251')).checkpoint).toEqual({ result: '例外が2件あると判明', next_step: '例外の担当者を確認', stepCompleted: false });
        view.unmount();
        clearWorkDraftCache();
        render(createElement(WorkDetailPanel, { taskId: 1251, onClose }));
        expect((await screen.findByLabelText('進んだこと（任意）')).value).toBe('例外が2件あると判明');
        api.finishWorkStep.mockImplementation(async (id, patch) => { context.task.next_step = patch.next_step; return context.task; });
        fireEvent.click(screen.getByRole('button', { name: '仕事の内容を閉じる' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(context.task.next_step).toBe('例外の担当者を確認');
        expect(context.task.status_code).toBe(2);
        expect(api.finishWorkStep).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem('yarukoto:work-draft:v1:1251')).toBeNull();
    });

    it('blocks an already requested completion once a checkpoint opens, keeping its result and hiding unrelated controls', async () => {
        const context = example(1261);
        context.task.status_code = 2;
        context.task.due_date = '2026-09-18';
        context.task.source_ref = 'https://example.com/material';
        context.descendants = [];
        api.loadTaskContext.mockImplementation(async () => ({ ...context, task: { ...context.task } }));
        const onClose = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 1261, onClose }));
        fireEvent.click(await screen.findByRole('button', { name: '資料を開いて始める' }));
        await screen.findByRole('button', { name: '区切る' });
        let releaseSave;
        api.saveWorkContext.mockImplementation((id, patch) => new Promise(resolve => { releaseSave = () => { Object.assign(context.task, patch); resolve({}); }; }));
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '記録中の作業文脈' } });
        screen.getByText('管理', { selector: 'summary' }).closest('details').open = true;
        fireEvent.click(screen.getByRole('button', { name: '仕事全体を完了' }));
        await waitFor(() => expect(releaseSave).toBeTypeOf('function'));
        fireEvent.click(screen.getByRole('button', { name: '区切る' }));
        const result = screen.getByLabelText('進んだこと（任意）');
        fireEvent.change(result, { target: { value: '消してはいけない判断結果' } });
        expect(document.activeElement).toBe(result);
        expect(screen.queryByRole('button', { name: '仕事全体を完了' })).toBeNull();
        expect(screen.queryByRole('button', { name: '属性を編集' })).toBeNull();
        expect(screen.queryByLabelText('作業メモ')).toBeNull();
        expect(screen.queryByLabelText('今する一歩')).toBeNull();
        expect(screen.queryByRole('button', { name: context.task.source_ref })).toBeNull();
        expect(screen.getByText('期限 2026-09-18')).toBeTruthy();
        await act(async () => releaseSave());
        expect(statusApi.change).not.toHaveBeenCalled();
        expect(context.task.status_code).toBe(2);
        expect(JSON.parse(localStorage.getItem('yarukoto:work-draft:v1:1261')).checkpoint.result).toBe('消してはいけない判断結果');
        fireEvent.click(screen.getByRole('button', { name: '保存して中断' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(api.finishWorkStep).toHaveBeenCalledExactlyOnceWith(1261, { result: '消してはいけない判断結果', next_step: '', stepCompleted: false });
    });

    it('commits one checkpoint when submit is repeated while a memo write is still pending', async () => {
        const workspace = await vi.importActual('@/lib/workspace');
        const db = await createTestDb();
        const id = await workspace.createCapturedTask({ text: '中断結果の二重記録を防ぐ' });
        await db.execute('UPDATE tasks SET status_code = 2 WHERE id = $1', [id]);
        for (const name of Object.keys(api)) api[name].mockImplementation(workspace[name]);
        const onClose = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: id, onClose }));
        fireEvent.click(await screen.findByRole('button', { name: '再開する' }));
        await screen.findByRole('button', { name: '区切る' });
        let releaseSave;
        api.saveWorkContext.mockImplementation((taskId, patch) => new Promise(resolve => {
            releaseSave = async () => resolve(await workspace.saveWorkContext(taskId, patch));
        }));
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '保存待ちの作業メモ' } });
        fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
        await waitFor(() => expect(releaseSave).toBeTypeOf('function'));
        fireEvent.click(screen.getByRole('button', { name: '区切る' }));
        fireEvent.change(screen.getByLabelText('進んだこと（任意）'), { target: { value: '一度だけ記録する成果' } });
        const form = screen.getByLabelText('進んだこと（任意）').closest('form');
        fireEvent.submit(form);
        fireEvent.submit(form);
        expect(api.finishWorkStep).not.toHaveBeenCalled();
        await act(async () => releaseSave());
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        const saved = await workspace.loadTaskContext(id);
        expect(saved.entries).toHaveLength(1);
        expect(saved.entries[0].result).toBe('一度だけ記録する成果');
        expect(saved.task.notes).toBe('保存待ちの作業メモ');
        expect(api.finishWorkStep).toHaveBeenCalledOnce();
    });

    it('keeps the task name as its accessible region name during inline title editing', async () => {
        api.loadTaskContext.mockResolvedValue(example(1271));
        render(createElement(WorkDetailPanel, { taskId: 1271, embedded: true }));
        await screen.findByRole('region', { name: '移行方式を決める' });
        expect(screen.getByRole('heading', { name: '移行方式を決める' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '仕事の名前を編集' }));
        expect(screen.getByRole('region', { name: '移行方式を決める' })).toBeTruthy();
        fireEvent.change(screen.getByLabelText('仕事の名前'), { target: { value: '移行方式を比較して決める' } });
        expect(screen.getByRole('region', { name: '移行方式を比較して決める' })).toBeTruthy();
    });

    it('opens the material from the explicit start button only after saving and starting successfully', async () => {
        const context = example(1281);
        context.task.source_ref = 'https://example.com/material';
        api.loadTaskContext.mockImplementation(async () => ({ ...context, task: { ...context.task } }));
        statusApi.change.mockImplementation(async (id, code) => { context.task.status_code = code; });
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        const onWorkStarted = vi.fn();
        render(createElement(WorkDetailPanel, { taskId: 1281, onWorkStarted }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '資料を確認する前の背景' } });
        expect(references.open).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '資料を開いて始める' }));
        await screen.findByRole('alert');
        expect(references.open).not.toHaveBeenCalled();
        expect(statusApi.change).not.toHaveBeenCalled();
        api.saveWorkContext.mockImplementation(async (id, patch) => Object.assign(context.task, patch));
        fireEvent.click(screen.getByRole('button', { name: '資料を開いて始める' }));
        await waitFor(() => expect(references.open).toHaveBeenCalledExactlyOnceWith(context.task.source_ref));
        expect(onWorkStarted).toHaveBeenCalledExactlyOnceWith(1281);
        expect(statusApi.change.mock.invocationCallOrder[0]).toBeLessThan(references.open.mock.invocationCallOrder[0]);
        expect(screen.getByLabelText('作業メモ').value).toBe('資料を確認する前の背景');
    });

    it('honors an explicit material-opening start token once and retains started work when the material cannot open', async () => {
        const context = example(1291);
        context.task.source_ref = 'https://example.com/missing';
        api.loadTaskContext.mockImplementation(async () => ({ ...context, task: { ...context.task } }));
        statusApi.change.mockImplementation(async (id, code) => { context.task.status_code = code; });
        references.open.mockRejectedValue(new Error('見つかりません'));
        const onWorkStarted = vi.fn();
        const view = render(createElement(WorkDetailPanel, { taskId: 1291, onWorkStarted }));
        await screen.findByLabelText('作業メモ');
        expect(references.open).not.toHaveBeenCalled();
        const props = { taskId: 1291, onWorkStarted, startRequested: { token: 1, minutes: null, openReference: true } };
        view.rerender(createElement(WorkDetailPanel, props));
        expect((await screen.findByRole('alert')).textContent).toContain('資料を開けませんでした');
        expect(context.task.status_code).toBe(2);
        expect(screen.getByLabelText('作業メモ').value).toBe(context.task.notes);
        expect(screen.getByRole('button', { name: '区切る' })).toBeTruthy();
        view.rerender(createElement(WorkDetailPanel, { ...props, startRequested: { ...props.startRequested } }));
        expect(references.open).toHaveBeenCalledOnce();
        expect(onWorkStarted).toHaveBeenCalledExactlyOnceWith(1291);
    });
});

it('小さな始め方で一歩を作り、元の一歩とメモを保ち、連打しても一度だけ開始する', async () => {
    const context = example(1901); context.descendants = [];
    context.task.next_step = '完成版を全員に送る';
    api.loadTaskContext.mockResolvedValue(context);
    statusApi.change.mockImplementation(async (id, code) => { context.task.status_code = code; });
    api.saveWorkContext.mockImplementation(async (id, patch) => { Object.assign(context.task, patch); });
    const onWorkStarted = vi.fn();
    render(createElement(WorkDetailPanel, { taskId: 1901, onWorkStarted }));
    fireEvent.click(await screen.findByRole('button', { name: 'はじめ方を小さくする' }));
    const choice = screen.getByRole('button', { name: '送らずに下書きする' });
    fireEvent.click(choice); fireEvent.click(choice);
    await waitFor(() => expect(onWorkStarted).toHaveBeenCalledTimes(1));
    expect(api.saveWorkContext).toHaveBeenCalledWith(1901, {
        next_step: '下書きを一文だけ書く（まだ送らない）',
        notes: 'データの所在を確認。例外件数は未確認。\n\n以前の一歩：完成版を全員に送る',
    });
    expect(statusApi.change).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('今する一歩').value).toContain('まだ送らない');
    expect(document.activeElement).toBe(screen.getByLabelText('作業メモ'));
    expect(api.createCapturedTask).not.toHaveBeenCalled();
});

it('小さな始め方の保存に失敗したら開始せず、一歩の下書きを保つ', async () => {
    const context = example(1911); context.descendants = [];
    api.loadTaskContext.mockResolvedValue(context);
    api.saveWorkContext.mockRejectedValue(new Error('disk full'));
    render(createElement(WorkDetailPanel, { taskId: 1911 }));
    fireEvent.click(await screen.findByRole('button', { name: 'はじめ方を小さくする' }));
    fireEvent.click(screen.getByRole('button', { name: '不明点を一つ書く' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('disk full'));
    expect(statusApi.change).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('yarukoto:work-draft:v1:1911')).fields.next_step).toContain('分からない点を一つ');
});

it('ホームから小さな始め方を開いても、選ぶまでは開始しない', async () => {
    api.loadTaskContext.mockResolvedValue(example(1931));
    render(createElement(WorkDetailPanel, { taskId: 1931, startRequested: { token: 1, help: true } }));
    expect(await screen.findByRole('button', { name: '不明点を一つ書く' })).toBeTruthy();
    expect(statusApi.change).not.toHaveBeenCalled();
    expect(api.saveWorkContext).not.toHaveBeenCalled();
});

it('親の一歩が他者待ちなら開始を止め、子の確認へ移れる', async () => {
    const context = example(1921); context.task.next_task_id = 1922;
    context.descendants[0].waiting_on = '先方の回答';
    api.loadTaskContext.mockResolvedValue(context);
    render(createElement(WorkDetailPanel, { taskId: 1921 }));
    fireEvent.click(await screen.findByRole('button', { name: '取りかかる' }));
    expect(screen.getByRole('alert').textContent).toContain('待ち・予定');
    expect(statusApi.change).not.toHaveBeenCalled();
});
