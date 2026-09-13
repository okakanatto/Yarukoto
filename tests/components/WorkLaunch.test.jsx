/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkLaunch from '@/components/WorkLaunch';
import WorkSignals from '@/components/WorkSignals';

// jsdom has no native top layer; simulate the observable open state.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };

const today = '2026-09-13';
const task = (id, changes = {}) => ({ id, title: `仕事 ${id}`, status_code: 1, importance_level: 2, created_at: '2026-09-01 09:00:00', ...changes });
const setupProps = changes => ({ tasks: [], todayTasks: [], today, previousId: null, loading: false, onOpen: vi.fn(), onStart: vi.fn(), onBrowse: vi.fn(), onCapture: vi.fn(), ...changes });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe('ホームから仕事へ入る操作', () => {
    it('資料を開く開始は明示し、閲覧・5分開始で自動的に資料を開く要求を送らない', () => {
        const props = setupProps({ tasks: [task(1, { source_ref: 'C:\\work\\sample.csv' })] });
        render(<WorkLaunch {...props} />);
        expect(props.onStart).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '仕事 1' }));
        expect(props.onOpen).toHaveBeenCalledWith(1);
        expect(props.onStart).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '5分だけ' }));
        expect(props.onStart).toHaveBeenLastCalledWith(1, 5);
        fireEvent.click(screen.getByRole('button', { name: '資料を開いて始める' }));
        expect(props.onStart).toHaveBeenLastCalledWith(1, null, true);
    });
    it('内容を開く操作と実際の着手要求を分け、5分の選択をそのまま渡す', () => {
        const props = setupProps({ tasks: [task(1, { title: '移行方式を決める', next_step: '例外3件だけ確認する' })] });
        render(<WorkLaunch {...props} />);
        fireEvent.click(screen.getByRole('button', { name: '移行方式を決める' }));
        expect(props.onOpen).toHaveBeenCalledWith(1);
        expect(props.onStart).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '5分だけ' }));
        expect(props.onStart).toHaveBeenLastCalledWith(1, 5);
        fireEvent.click(screen.getByRole('button', { name: '取りかかる' }));
        expect(props.onStart).toHaveBeenLastCalledWith(1);
    });

    it('別の候補を表示しても期限・予定・再開IDを変更せず、元の実期限は確認欄に残る', () => {
        localStorage.setItem('yarukoto:work-selection', '1');
        const save = vi.spyOn(Storage.prototype, 'setItem');
        const tasks = Object.freeze([
            Object.freeze(task(1, { title: '締切のある判断', due_date: '2020-01-01', today_date: '2026-09-12' })),
            Object.freeze(task(2, { title: '今進められる仕事', next_step: '見出しを一つ書く' })),
        ]);
        const props = setupProps({ tasks });
        render(<><WorkSignals tasks={tasks} /><WorkLaunch {...props} /></>);
        expect(within(screen.getByRole('article', { name: '取りかかる仕事' })).getByText('期限 2020-01-01')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '別の仕事を選ぶ' }));
        fireEvent.click(screen.getByRole('button', { name: /次の一歩あり\s*今進められる仕事/ }));
        expect(within(screen.getByRole('article')).getByRole('button', { name: '今進められる仕事' })).toBeTruthy();
        expect(props.onStart).not.toHaveBeenCalled();
        expect(props.onOpen).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        expect(localStorage.getItem('yarukoto:work-selection')).toBe('1');
        expect(tasks[0]).toMatchObject({ due_date: '2020-01-01', today_date: '2026-09-12', status_code: 1 });
        fireEvent.click(screen.getByRole('button', { name: '確認 1' }));
        expect(within(screen.getByRole('list', { name: '確認する仕事' })).getByRole('button', { name: /締切のある判断/ })).toBeTruthy();
    });

    it('背景で見返し、タスクを変更せず送り位置だけ保存し、再表示でも続きを復元する', async () => {
        const tasks = [
            task(1, { title: '人事データの件', capture_text: '人事データの件\n旧コード移行の例外' }),
            task(2, { title: '人事データの件', capture_text: '人事データの件\n採用データとの連携方法' }),
        ];
        const before = structuredClone(tasks);
        const props = setupProps({ tasks });
        const save = vi.spyOn(Storage.prototype, 'setItem');
        const first = render(<WorkLaunch {...props} />);
        fireEvent.click(screen.getByRole('button', { name: '記録を見返す' }));
        const region = screen.getByRole('region', { name: '記録を一つずつ見返す' });
        expect(within(region).getByText('旧コード移行の例外')).toBeTruthy();
        fireEvent.click(within(region).getByRole('button', { name: '次の記録' }));
        expect(within(region).getByText('採用データとの連携方法')).toBeTruthy();
        expect(props.onOpen).not.toHaveBeenCalled();
        expect(props.onStart).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledWith('yarukoto:work-review:v1', expect.any(String));
        expect(localStorage.getItem('yarukoto:work-selection')).toBeNull();
        expect(tasks).toEqual(before);
        fireEvent.click(within(region).getByRole('button', { name: '開く' }));
        expect(props.onOpen).toHaveBeenCalledWith(2);
        first.unmount();
        render(<WorkLaunch {...props} />);
        await waitFor(() => expect(screen.getByRole('region', { name: '記録を一つずつ見返す' })).toBeTruthy());
        expect(within(screen.getByRole('region', { name: '記録を一つずつ見返す' })).getByText('採用データとの連携方法')).toBeTruthy();
    });

    it('候補を眺めた後に再表示しても、前回取り組んだ仕事へ戻る', () => {
        const props = setupProps({ previousId: 1, tasks: [
            task(1, { title: '中断した仕事', status_code: 2, work_started_at: '2026-09-12 10:00:00' }),
            task(2, { title: '確認するだけの別件' }),
        ] });
        const first = render(<WorkLaunch {...props} />);
        fireEvent.click(screen.getByRole('button', { name: '別の仕事を選ぶ' }));
        fireEvent.click(screen.getByRole('button', { name: /記録から選ぶ\s*確認するだけの別件/ }));
        fireEvent.click(screen.getByRole('button', { name: '確認するだけの別件' }));
        expect(props.onOpen).toHaveBeenCalledWith(2);
        expect(props.onStart).not.toHaveBeenCalled();
        first.unmount();
        render(<WorkLaunch {...props} />);
        expect(screen.getByRole('button', { name: '中断した仕事' })).toBeTruthy();
        expect(screen.getByText('続きから')).toBeTruthy();
    });

    it('ルーティンを通常タスクとして開始せず、既存の今日一覧で実行できる', () => {
        const routine = task('routine_7_2026-09-13', { title: '朝の確認', is_routine: true });
        const props = setupProps({ todayTasks: [routine] });
        render(<WorkLaunch {...props} />);
        fireEvent.click(screen.getByRole('button', { name: '今日の一覧を開く' }));
        fireEvent.click(screen.getByRole('button', { name: '朝の確認' }));
        expect(props.onBrowse).toHaveBeenCalledTimes(2);
        expect(props.onBrowse).toHaveBeenLastCalledWith('today');
        expect(props.onStart).not.toHaveBeenCalled();
        expect(props.onOpen).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '5分だけ' })).toBeNull();
    });

    it('候補が多くても一覧への出口を残し、読み込み中は未確定の仕事を開始させない', () => {
        const props = setupProps({ tasks: Array.from({ length: 150 }, (_, index) => task(index + 1)) });
        const { rerender } = render(<WorkLaunch {...props} />);
        fireEvent.click(screen.getByRole('button', { name: '別の仕事を選ぶ' }));
        fireEvent.click(screen.getByRole('button', { name: '一覧から選ぶ' }));
        expect(props.onBrowse).toHaveBeenCalledWith('all');
        rerender(<WorkLaunch {...props} loading />);
        expect(screen.getByText('読み込み中…')).toBeTruthy();
        expect(screen.queryByRole('button', { name: '取りかかる' })).toBeNull();
        expect(screen.queryByRole('button', { name: '5分だけ' })).toBeNull();
    });
});
