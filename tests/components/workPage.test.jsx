/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkPage from '@/app/work/page';

const fixture = vi.hoisted(() => ({ workspace: null, day: null }));
const api = vi.hoisted(() => ({ saveWorkContext: vi.fn() }));
const detail = vi.hoisted(() => ({ requestStart: vi.fn(), close: null }));
const actions = vi.hoisted(() => ({ handleStatusChange: vi.fn(), handleRoutineStatusChange: vi.fn(), handleTodayToggle: vi.fn(), processingIds: new Set() }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => fixture.workspace }));
vi.mock('@/hooks/useTodayTasks', () => ({ useTodayTasks: () => fixture.day }));
vi.mock('@/hooks/useTaskActions', () => ({ useTaskActions: () => actions }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/components/WorkSignals', () => ({ default: () => null }));
vi.mock('@/components/WorkRow', () => ({ default: ({ task, onOpen }) => <button onClick={() => onOpen(task.id)}>{task.title}</button> }));
vi.mock('@/components/TaskInput', () => ({ default: ({ onTaskAdded }) => <div><input aria-label="仕事の記録" /><button onClick={onTaskAdded}>記録</button></div> }));

// WorkDetail's autosave/checkpoint behavior has its own component tests. This
// contract double checks the page waits for its guard and start-success callback.
vi.mock('@/components/WorkDetailPanel', async () => {
    const { useEffect, useRef, useState } = await import('react');
    function Panel({ taskId, navigationRef, onClose, onWorkStarted, startRequested }) {
        const task = fixture.workspace.tasks.find(item => item.id === taskId);
        const [notes, setNotes] = useState(task.notes);
        const [error, setError] = useState('');
        const notesRef = useRef(notes);
        useEffect(() => {
            navigationRef.current = async () => {
                try {
                    if (notesRef.current !== task.notes) await api.saveWorkContext(taskId, { notes: notesRef.current });
                    return true;
                } catch {
                    setError('保存できませんでした');
                    return false;
                }
            };
            return () => { navigationRef.current = null; };
        }, [navigationRef, task, taskId]);
        useEffect(() => { if (startRequested) detail.requestStart(taskId, startRequested); }, [startRequested, taskId]);
        useEffect(() => { detail.close = onClose; return () => { detail.close = null; }; }, [onClose]);
        return <section aria-label={task.title}>
            <textarea aria-label="作業メモ" value={notes} onChange={event => { notesRef.current = event.target.value; setNotes(event.target.value); }} />
            {error && <p role="alert">{error}</p>}
            <button onClick={onClose}>仕事の内容を閉じる</button>
            <button onClick={() => onWorkStarted(taskId)}>開始成功を通知</button>
        </section>;
    }
    return { default: props => <Panel key={props.taskId} {...props} /> };
});

function task(id, patch = {}) {
    return { id, title: `仕事${id}`, capture_text: `最初の記録${id}`, notes: `作業メモ${id}`, status_code: 1, project_id: 1, project_name: '移行', ...patch };
}
function prepare(tasks) {
    fixture.workspace = { tasks, projects: [], loading: false, error: '', reload: vi.fn(), setTasks: vi.fn() };
    fixture.day = { tasks, loading: false, loadTasks: vi.fn(), setTasks: vi.fn() };
    api.saveWorkContext.mockImplementation(async (id, patch) => Object.assign(fixture.workspace.tasks.find(item => item.id === id), patch));
}
function browse() { fireEvent.click(screen.getByRole('button', { name: '仕事の一覧' })); }
async function open(id) {
    fireEvent.click(screen.getByRole('button', { name: `仕事${id}`, exact: true }));
    return screen.findByRole('region', { name: `仕事${id}` });
}
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); detail.close = null; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ホームと作業面の選択・保存境界', () => {
    it('前回の中断結果をホームで読める状態へ戻し、詳細を自動で開かない', async () => {
        const result = '通常分を確認済み。次は旧部門の例外5件。';
        prepare([task(2001, { status_code: 2, next_step: '例外5件を確認', work_log: JSON.stringify([{ id: 'pause-1', kind: 'pause', created_at: '2026-09-13 09:00:00', result }]) }), task(2002)]);
        localStorage.setItem('yarukoto:work-selection', '2001');
        render(<WorkPage />);
        await waitFor(() => expect(screen.getByRole('article', { name: '取りかかる仕事' })).toBeTruthy());
        expect(within(screen.getByRole('article')).getByText(result)).toBeTruthy();
        expect(screen.getByText('続きから')).toBeTruthy();
        expect(screen.queryByLabelText('作業メモ')).toBeNull();
        expect(document.querySelector('.desk-has-selection')).toBeNull();
        expect(detail.requestStart).not.toHaveBeenCalled();
        await open(2001);
        expect(screen.getByLabelText('作業メモ').value).toBe('作業メモ2001');
    });

    it.each([
        { status_code: 1, last_opened_at: '2026-09-12 10:00:00' },
        { status_code: 2, waiting_on: '人事の返事' },
        { status_code: 2, today_date: '2099-01-01' },
        { status_code: 3 },
    ])('閲覧・待ち・未来予定・完了を保存IDだけで作業へ戻さない: %j', async patch => {
        prepare([task(2011, patch)]);
        localStorage.setItem('yarukoto:work-selection', '2011');
        render(<WorkPage />);
        await act(async () => {});
        expect(screen.queryByLabelText('作業メモ')).toBeNull();
        expect(screen.queryByText('続きから')).toBeNull();
        expect(detail.requestStart).not.toHaveBeenCalled();
        expect(document.querySelector('.desk-has-selection')).toBeNull();
    });

    it('閲覧して閉じる際に保存し、閲覧だけでは前回の作業IDを上書きしない', async () => {
        prepare([task(2021), task(2022, { status_code: 2 })]);
        localStorage.setItem('yarukoto:work-selection', '2022');
        render(<WorkPage />);
        browse();
        await open(2021);
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '閉じる前に残す' } });
        fireEvent.click(screen.getByRole('button', { name: '仕事の内容を閉じる' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: '仕事2021' })).toBeNull());
        expect(api.saveWorkContext).toHaveBeenCalledTimes(1);
        expect(api.saveWorkContext).toHaveBeenCalledWith(2021, { notes: '閉じる前に残す' });
        expect(localStorage.getItem('yarukoto:work-selection')).toBe('2022');
        expect(detail.requestStart).not.toHaveBeenCalled();
    });

    it('行切替の保存に失敗すると選択中の仕事と編集内容を残す', async () => {
        prepare([task(2031), task(2032)]);
        api.saveWorkContext.mockRejectedValue(new Error('disk full'));
        render(<WorkPage />);
        browse();
        await open(2031);
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '失わない編集' } });
        fireEvent.click(screen.getByRole('button', { name: '仕事2032', exact: true }));
        await screen.findByRole('alert');
        expect(screen.getByRole('region', { name: '仕事2031' })).toBeTruthy();
        expect(screen.getByLabelText('作業メモ').value).toBe('失わない編集');
        expect(localStorage.getItem('yarukoto:work-selection')).toBeNull();
        expect(fixture.workspace.tasks[0].notes).toBe('作業メモ2031');
    });

    it('保存待ちに複数行を選ぶと保存を共有し、最後に選んだ行へ移る', async () => {
        prepare([task(2041), task(2042), task(2043)]);
        let completeSave;
        api.saveWorkContext.mockImplementation((id, patch) => new Promise(resolve => { completeSave = () => { Object.assign(fixture.workspace.tasks.find(item => item.id === id), patch); resolve({}); }; }));
        render(<WorkPage />);
        browse();
        await open(2041);
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '選択前のメモ' } });
        fireEvent.click(screen.getByRole('button', { name: '仕事2042', exact: true }));
        await waitFor(() => expect(completeSave).toBeTypeOf('function'));
        fireEvent.click(screen.getByRole('button', { name: '仕事2043', exact: true }));
        await act(async () => completeSave());
        expect(await screen.findByRole('region', { name: '仕事2043' })).toBeTruthy();
        expect(api.saveWorkContext).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('region', { name: '仕事2042' })).toBeNull();
    });

    it('5分の開始要求を作業面へ渡し、開始が成功した時だけ再開IDを更新する', async () => {
        prepare([task(2051)]);
        render(<WorkPage />);
        fireEvent.click(screen.getByRole('button', { name: '5分だけ' }));
        await screen.findByRole('region', { name: '仕事2051' });
        await waitFor(() => expect(detail.requestStart).toHaveBeenCalledWith(2051, expect.objectContaining({ minutes: 5, token: expect.any(Number), openReference: false })));
        expect(localStorage.getItem('yarukoto:work-selection')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '開始成功を通知' }));
        await waitFor(() => expect(localStorage.getItem('yarukoto:work-selection')).toBe('2051'));
        expect(fixture.workspace.reload).toHaveBeenCalled();
        expect(actions.handleStatusChange).not.toHaveBeenCalled();
    });

    it('作業面の中断保存完了で結果カードへ戻り、新しいアプリセッションでも結果を読める', async () => {
        prepare([task(2052)]);
        const initial = render(<WorkPage />);
        fireEvent.click(screen.getByRole('button', { name: '5分だけ' }));
        await screen.findByRole('region', { name: '仕事2052' });
        Object.assign(fixture.workspace.tasks[0], { status_code: 2, work_started_at: '2026-09-13 09:00:00' });
        fireEvent.click(screen.getByRole('button', { name: '開始成功を通知' }));
        const result = '通常分は確認済み。例外11件を特定。';
        // The real panel invokes onClose after its checkpoint write succeeds.
        // Verify the page boundary using that already-persisted DB result.
        fixture.workspace.tasks[0].work_log = JSON.stringify([{ id: 'pause-2052', kind: 'pause', created_at: '2026-09-13 09:05:00', result }]);
        await act(async () => detail.close());
        expect(screen.queryByLabelText('作業メモ')).toBeNull();
        expect(within(screen.getByRole('article')).getByText(result)).toBeTruthy();
        expect(localStorage.getItem('yarukoto:work-selection')).toBe('2052');
        initial.unmount();
        render(<WorkPage />);
        expect(within(screen.getByRole('article')).getByText(result)).toBeTruthy();
        expect(screen.queryByLabelText('作業メモ')).toBeNull();
        expect(screen.getByText('続きから')).toBeTruthy();
    });

    it('作業中に記録欄を開閉しても、選択と入力中のメモを維持する', async () => {
        prepare([task(2061)]);
        render(<WorkPage />);
        await open(2061);
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '記録前の作業状況' } });
        fireEvent(window, new CustomEvent('yarukoto:openFab'));
        await screen.findByLabelText('仕事の記録');
        expect(document.querySelector('.desk-has-selection.desk-capture-open')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '記録欄を閉じる' }));
        expect(document.querySelector('.desk-capture-open')).toBeNull();
        expect(screen.getByLabelText('作業メモ').value).toBe('記録前の作業状況');
        expect(api.saveWorkContext).not.toHaveBeenCalled();
    });

    it('記録欄から別の仕事へ戻る時は作業面を保存してから記録欄を閉じる', async () => {
        prepare([task(2071), task(2072)]);
        render(<WorkPage />);
        browse();
        await open(2071);
        fireEvent.change(screen.getByLabelText('作業メモ'), { target: { value: '別件の前に残す' } });
        fireEvent(window, new CustomEvent('yarukoto:openFab'));
        await screen.findByLabelText('仕事の記録');
        await open(2072);
        expect(api.saveWorkContext).toHaveBeenCalledWith(2071, { notes: '別件の前に残す' });
        expect(document.querySelector('.desk-capture-open')).toBeNull();
    });
});

it('状態を思い出さず待ちの背景を検索でき、タブを変えても検索語を保持する', async () => {
    prepare([task(2091), task(2092, { status_code: 4, waiting_on: '法務から捺印条件の回答待ち' })]);
    render(<WorkPage />);
    fireEvent.click(screen.getByRole('button', { name: '仕事の一覧' }));
    fireEvent.change(screen.getByRole('textbox', { name: '仕事を検索' }), { target: { value: '捺印' } });
    expect(screen.getByRole('button', { name: '仕事2092' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^今日/ }));
    expect(screen.getByRole('textbox', { name: '仕事を検索' }).value).toBe('捺印');
    expect(screen.getByRole('button', { name: '仕事2092' })).toBeTruthy();
    expect(screen.getByText('全状態 · 1件')).toBeTruthy();
});
