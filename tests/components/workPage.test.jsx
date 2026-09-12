/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkPage from '@/app/work/page';

const fixture = vi.hoisted(() => ({ workspace: null, day: null }));
const api = vi.hoisted(() => ({ loadTaskContext: vi.fn(), rememberTask: vi.fn(), saveWorkContext: vi.fn(), createCapturedTask: vi.fn(), setTaskPlan: vi.fn(), resolveWaiting: vi.fn() }));
const actions = vi.hoisted(() => ({ handleStatusChange: vi.fn(), handleRoutineStatusChange: vi.fn(), handleTodayToggle: vi.fn(), processingIds: new Set() }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => fixture.workspace }));
vi.mock('@/hooks/useTodayTasks', () => ({ useTodayTasks: () => fixture.day }));
vi.mock('@/hooks/useTaskActions', () => ({ useTaskActions: () => actions }));
vi.mock('@/hooks/useStatusActions', () => ({ useStatusActions: () => ({ handleStatusChange: actions.handleStatusChange }) }));
vi.mock('@/lib/workspace', () => api);
vi.mock('@/lib/workReferences', () => ({ classifyWorkReference: value => ({ kind: 'text', label: value, target: value }), openWorkReference: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/components/WorkSignals', () => ({ default: () => null }));
vi.mock('@/components/TaskEditModal', () => ({ default: () => null }));
vi.mock('@/components/WorkRow', () => ({ default: ({ task, onOpen }) => <button onClick={() => onOpen(task.id)}>{task.title}</button> }));
vi.mock('@/components/TaskInput', () => ({ default: ({ onTaskAdded }) => <div><input aria-label="仕事の記録" /><button onClick={onTaskAdded}>記録</button></div> }));

function task(id, patch = {}) {
    return { id, title: `仕事${id}`, capture_text: `最初の記録${id}`, notes: `作業メモ${id}`, status_code: 1, project_id: 1, project_name: '移行', ...patch };
}

function prepare(tasks) {
    fixture.workspace = { tasks, projects: [], loading: false, error: '', reload: vi.fn(), setTasks: vi.fn() };
    fixture.day = { tasks, loading: false, loadTasks: vi.fn(), setTasks: vi.fn() };
    api.loadTaskContext.mockImplementation(async id => ({ task: { ...fixture.workspace.tasks.find(item => item.id === id) }, ancestors: [], descendants: [] }));
    api.saveWorkContext.mockImplementation(async (id, patch) => Object.assign(fixture.workspace.tasks.find(item => item.id === id), patch));
}

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    api.rememberTask.mockResolvedValue({});
    api.createCapturedTask.mockResolvedValue(9999);
    api.setTaskPlan.mockResolvedValue({});
    api.resolveWaiting.mockResolvedValue({});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the work list and real embedded work panel share a safe selection', () => {
    it('restores only a previously selected, available work in progress', async () => {
        prepare([task(2001, { status_code: 2 }), task(2002)]);
        localStorage.setItem('yarukoto:work-selection', '2001');
        render(<WorkPage />);
        await screen.findByLabelText('作業メモ');
        expect(screen.getByRole('region', { name: '仕事2001' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: /進行中/ }).getAttribute('aria-selected')).toBe('true');
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it.each([
        { status_code: 1, last_opened_at: '2026-09-12 10:00:00' },
        { status_code: 2, waiting_on: '人事の返事' },
        { status_code: 2, today_date: '2099-01-01' },
        { status_code: 3 },
    ])('does not restore mere reading, waiting, future work, or completed work: %j', async patch => {
        prepare([task(2011, patch)]);
        localStorage.setItem('yarukoto:work-selection', '2011');
        render(<WorkPage />);
        await act(async () => {});
        expect(api.loadTaskContext).not.toHaveBeenCalled();
        expect(document.querySelector('.desk-has-selection')).toBeNull();
    });

    it('closes a dirty embedded panel with one save despite both levels guarding navigation', async () => {
        prepare([task(2021)]);
        render(<WorkPage />);
        fireEvent.click(screen.getByRole('button', { name: '仕事2021', exact: true }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '閉じる前に残す' } });
        fireEvent.click(screen.getByRole('button', { name: '仕事の内容を閉じる' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: '仕事2021' })).toBeNull());
        expect(api.saveWorkContext).toHaveBeenCalledTimes(1);
        expect(api.saveWorkContext).toHaveBeenCalledWith(2021, { notes: '閉じる前に残す' });
        expect(document.querySelector('.desk-has-selection')).toBeNull();
        expect(localStorage.getItem('yarukoto:work-selection')).toBe('2021');
    });

    it('retains the selected work and draft when changing rows cannot save', async () => {
        prepare([task(2031), task(2032)]);
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        render(<WorkPage />);
        fireEvent.click(screen.getByRole('button', { name: '仕事2031', exact: true }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '失わない編集' } });
        fireEvent.click(screen.getByRole('button', { name: '仕事2032', exact: true }));
        await screen.findByRole('alert');
        expect(screen.getByRole('region', { name: '仕事2031' })).toBeTruthy();
        expect(screen.getByLabelText('作業メモ').value).toBe('失わない編集');
        expect(localStorage.getItem('yarukoto:work-selection')).toBe('2031');
    });

    it('uses the latest row selected while saving, without losing the requested selection', async () => {
        prepare([task(2041), task(2042), task(2043)]);
        let completeSave;
        api.saveWorkContext.mockImplementation((id, patch) => new Promise(resolve => { completeSave = () => { Object.assign(fixture.workspace.tasks.find(item => item.id === id), patch); resolve({}); }; }));
        render(<WorkPage />);
        fireEvent.click(screen.getByRole('button', { name: '仕事2041', exact: true }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '選択前のメモ' } });
        fireEvent.click(screen.getByRole('button', { name: '仕事2042', exact: true }));
        await waitFor(() => expect(completeSave).toBeTypeOf('function'));
        fireEvent.click(screen.getByRole('button', { name: '仕事2043', exact: true }));
        await act(async () => completeSave());
        await screen.findByRole('region', { name: '仕事2043' });
        expect(api.saveWorkContext).toHaveBeenCalledTimes(1);
    });

    it('opens capture above a selected work and returns to the same work on close', async () => {
        prepare([task(2051)]);
        render(<WorkPage />);
        fireEvent.click(screen.getByRole('button', { name: '仕事2051', exact: true }));
        await screen.findByLabelText('作業メモ');
        fireEvent(window, new CustomEvent('yarukoto:openFab'));
        await screen.findByLabelText('仕事の記録');
        expect(document.querySelector('.desk-has-selection.desk-capture-open')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '記録欄を閉じる' }));
        expect(document.querySelector('.desk-capture-open')).toBeNull();
        expect(document.querySelector('.desk-has-selection')).not.toBeNull();
        expect(screen.getByRole('region', { name: '仕事2051' })).toBeTruthy();
    });

    it('leaves capture mode when the user chooses a work from that list', async () => {
        prepare([task(2061), task(2062)]);
        render(<WorkPage />);
        fireEvent.click(screen.getByRole('button', { name: '仕事2061', exact: true }));
        await screen.findByLabelText('作業メモ');
        fireEvent(window, new CustomEvent('yarukoto:openFab'));
        await screen.findByLabelText('仕事の記録');
        fireEvent.click(screen.getByRole('button', { name: '仕事2062', exact: true }));
        await screen.findByRole('region', { name: '仕事2062' });
        expect(document.querySelector('.desk-capture-open')).toBeNull();
    });

    it('restores the same work and saved memo after interruption and a new app session', async () => {
        prepare([task(2071, { status_code: 2 })]);
        const initial = render(<WorkPage />);
        fireEvent.click(screen.getByRole('button', { name: '仕事2071', exact: true }));
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '通常分は確認済み。次は旧部門の例外5件。' } });
        fireEvent.click(screen.getByRole('button', { name: '保存して中断' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: '仕事2071' })).toBeNull());
        expect(localStorage.getItem('yarukoto:work-selection')).toBe('2071');
        expect(fixture.workspace.tasks[0].notes).toBe('通常分は確認済み。次は旧部門の例外5件。');
        expect(api.saveWorkContext).toHaveBeenCalledTimes(1);
        expect(actions.handleStatusChange).not.toHaveBeenCalled();

        initial.unmount();
        render(<WorkPage />);
        expect((await screen.findByLabelText('作業メモ')).value).toBe('通常分は確認済み。次は旧部門の例外5件。');
        expect(screen.getByRole('region', { name: '仕事2071' })).toBeTruthy();
        expect(screen.getByRole('tab', { name: /進行中/ }).getAttribute('aria-selected')).toBe('true');
    });

    it('does not close or change the remembered selection when saving interruption fails', async () => {
        prepare([task(2081, { status_code: 2 })]);
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        localStorage.setItem('yarukoto:work-selection', '2081');
        render(<WorkPage />);
        fireEvent.change(await screen.findByLabelText('作業メモ'), { target: { value: '未保存でも失わない中断メモ' } });
        fireEvent.click(screen.getByRole('button', { name: '保存して中断' }));
        await screen.findByRole('alert');
        expect(screen.getByRole('region', { name: '仕事2081' })).toBeTruthy();
        expect(screen.getByLabelText('作業メモ').value).toBe('未保存でも失わない中断メモ');
        expect(localStorage.getItem('yarukoto:work-selection')).toBe('2081');
        expect(fixture.workspace.tasks[0].notes).toBe('作業メモ2081');
    });
});
