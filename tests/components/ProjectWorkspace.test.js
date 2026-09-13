/** @vitest-environment jsdom */
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectPage from '@/app/projects/page';

const state = vi.hoisted(() => ({ data: null, projectId: 7, save: vi.fn(), complete: vi.fn(), reload: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.projectId ? `id=${state.projectId}` : '') }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }) => createElement('a', { href, ...props }, children) }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ ...state.data, reload: state.reload }) }));
vi.mock('@/lib/workspace', () => ({ saveProjectContext: (...args) => state.save(...args), setProjectCompletion: (...args) => state.complete(...args) }));
vi.mock('@/components/TaskInput', () => ({ default: ({ defaultProjectId }) => createElement('div', { 'data-testid': 'existing-input' }, `入力先 ${defaultProjectId}`) }));
vi.mock('@/components/TaskList', () => ({ default: ({ projectId }) => createElement('div', { 'data-testid': 'existing-list' }, `管理対象 ${projectId}`) }));

function project() {
    return { id: 7, name: '移行準備', color: '#555', outcome: '方式を合意する', due_date: '2026-09-18', completed_at: null,
        progress: { total: 13, completed: 12, open: 1, inProgress: 1, waiting: 0 },
        milestones: [
            { id: 11, title: '方式を比較する', notes: '二つの方式を比較済み。\n費用は確認済み。', status_code: 3, completed_at: '2026-09-10 12:00:00', archived_at: '2026-09-11 12:00:00' },
            { id: 12, title: '方針を合意する', notes: '次回定例で方式を選ぶ。', status_code: 2 },
        ],
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    state.projectId = 7;
    state.data = { projects: [project()], tasks: [{ id: 12, project_id: 7, title: '方針を合意する', status_code: 2 }], loading: false, error: null };
    state.reload.mockResolvedValue(undefined);
    state.save.mockResolvedValue(undefined);
    state.complete.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('ProjectWorkspace keeps outcomes separate from task counts', () => {
    it('shows child and archived grandchild results with their own source, without copying to the parent', () => {
        state.data.projects[0].recentEntries = [
            { id: 'result-child', kind: 'pause', task_id: 21, task_title: '費用を確認する', result: '追加費用なしと確認できた。', created_at: '2026-09-13 10:00:00' },
            { id: 'result-grandchild', kind: 'step', task_id: 22, task_title: '旧部門コードを照合する', result: '5件中1件は変換表にない。', created_at: '2026-09-12 16:00:00', archived_at: '2026-09-12 18:00:00' },
        ];
        const dispatch = vi.spyOn(window, 'dispatchEvent');
        render(createElement(ProjectPage));
        const records = screen.getByRole('region', { name: '最近の記録' });
        expect(within(records).getByText('追加費用なしと確認できた。')).toBeTruthy();
        expect(within(records).getByText(/作業記録 · 2026-09-12 · アーカイブ/)).toBeTruthy();
        fireEvent.click(within(records).getByRole('button', { name: /5件中1件は変換表にない。.*旧部門コードを照合する/ }));
        expect(dispatch.mock.calls.some(([event]) => event.type === 'yarukoto:openTask' && event.detail.id === 22)).toBe(true);
        expect(state.save).not.toHaveBeenCalled();
        dispatch.mockRestore();
    });

    it('keeps completed parents with unfinished descendants outside the collapsed history', () => {
        state.data.projects[0].milestones[0].openDescendants = 2;
        state.data.projects[0].milestones[0].due_date = '2026-09-14';
        const dispatch = vi.spyOn(window, 'dispatchEvent');
        render(createElement(ProjectPage));
        const parent = screen.getByRole('button', { name: /方式を比較する/ });
        expect(parent.closest('details')).toBeNull();
        expect(within(parent).getByText('配下に未完了 2件')).toBeTruthy();
        expect(within(parent).getByTitle('2026年9月14日')).toBeTruthy();
        fireEvent.click(parent);
        expect(dispatch.mock.calls.some(([event]) => event.type === 'yarukoto:openTask' && event.detail.id === 11)).toBe(true);
        dispatch.mockRestore();
    });

    it('uses the completed step when no result was written and preserves the memo context', () => {
        state.data.projects[0].recentEntries = [
            { id: 'empty-pause', kind: 'pause', task_id: 21, task_title: '結果のない中断', result: '', created_at: '2026-09-13 12:00:00' },
            { id: 'step', kind: 'step', task_id: 21, task_title: '費用を確認する', result: '', consumed_step: '見積額を照合する', created_at: '2026-09-13 11:00:00' },
            { id: 'legacy-note', kind: 'note', task_id: 22, task_title: '移行条件を調べる', result: '古い経緯。\n確認した条件。\n次回の論点。', created_at: '2026-09-12 15:00:00' },
        ];
        render(createElement(ProjectPage));
        const records = screen.getByRole('region', { name: '最近の記録' });
        expect(within(records).queryByText('結果のない中断')).toBeNull();
        expect(within(records).getByText('見積額を照合する')).toBeTruthy();
        expect(within(records).getByText('古い経緯。 確認した条件。 次回の論点。')).toBeTruthy();
    });

    it('labels a current memo without a fabricated date and shows each branch condition', () => {
        state.data.projects[0].recentEntries = [
            { id: 'memo-21', kind: 'memo', task_id: 21, task_title: '展開する', result: '現在の判断', created_at: '' },
            { id: 'old-result', kind: 'pause', task_id: 21, task_title: '展開する', result: '以前の結果', created_at: '2026-09-01 10:00:00' },
        ];
        state.data.projects[0].milestones[1].branchSummaries = [
            { task_id: 21, task_title: '方式を決める', latestResult: { result: '方式Aで合意', task_title: '比較する', archived_at: '2026-09-11' }, waiting: [], nextSteps: [] },
            { task_id: 22, task_title: '展開する', latestResult: null, waiting: [{ task_id: 23, task_title: '承認を待つ', waiting_on: '責任者', review_date: '2026-09-20' }], nextSteps: [{ task_id: 23, task_title: '承認を待つ', next_step: '全社へ展開' }] },
        ];
        render(createElement(ProjectPage));
        const records = screen.getByRole('region', { name: '最近の記録' });
        expect(within(records).getByText('現在のメモ').closest('button').textContent).toContain('現在のメモ');
        expect(within(records).getByText('現在のメモ').closest('button').textContent).not.toMatch(/2099|2026-/);
        const milestone = screen.getByRole('button', { name: /方針を合意する/ });
        expect(within(milestone).getByText(/結果: 方式Aで合意/)).toBeTruthy();
        expect(within(milestone).getByText(/比較する · アーカイブ/)).toBeTruthy();
        expect(within(milestone).getByText(/待ち: 責任者 · 確認 2026-09-20/)).toBeTruthy();
        expect(within(milestone).getByText(/次: 全社へ展開/)).toBeTruthy();
        expect(within(milestone).queryByText('次回定例で方式を選ぶ。')).toBeNull();
    });

    it('keeps archived root work, its note and full-history counts visible', () => {
        const dispatch = vi.spyOn(window, 'dispatchEvent');
        render(createElement(ProjectPage));
        expect(screen.getByText('方式を合意する')).toBeTruthy();
        expect(screen.getByText('二つの方式を比較済み。 費用は確認済み。')).toBeTruthy();
        expect(screen.getByText('タスク 12 / 13 完了')).toBeTruthy();
        fireEvent.click(screen.getByText('完了・キャンセル 1件'));
        fireEvent.click(screen.getByRole('button', { name: /方式を比較する/ }));
        expect(dispatch.mock.calls.some(([event]) => event.type === 'yarukoto:openTask' && event.detail.id === 11)).toBe(true);
        dispatch.mockRestore();
    });

    it('retains the existing project-scoped input and full task management through the tab', () => {
        render(createElement(ProjectPage));
        const progress = screen.getByRole('tab', { name: '進行' });
        progress.focus();
        fireEvent.keyDown(progress, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'タスク' }).getAttribute('aria-selected')).toBe('true');
        expect(screen.queryByTestId('existing-input')).toBeNull(); // Adding lives inside the management table.
        expect(screen.getByTestId('existing-list').textContent).toBe('管理対象 7');
    });

    it('retains an edited outcome and does not complete the project if saving fails', async () => {
        state.save.mockRejectedValue(new Error('保存に失敗'));
        render(createElement(ProjectPage));
        fireEvent.click(screen.getByRole('button', { name: '編集' }));
        fireEvent.change(screen.getByLabelText('目標'), { target: { value: '合意した条件を残す' } });
        fireEvent.click(screen.getByRole('button', { name: '完了にする' }));
        await screen.findByRole('alert');
        expect(state.complete).not.toHaveBeenCalled();
        expect(screen.getByLabelText('目標').value).toBe('合意した条件を残す');
        fireEvent.click(screen.getByRole('button', { name: '下書きを破棄' }));
    });

    it('shows an unresolved-work rejection without pretending that the project completed', async () => {
        state.complete.mockRejectedValue(new Error('未完了のタスクが残っています'));
        render(createElement(ProjectPage));
        fireEvent.click(screen.getByRole('button', { name: '完了にする' }));
        expect((await screen.findByRole('alert')).textContent).toBe('未完了のタスクが残っています');
        expect(screen.queryByRole('button', { name: '再開', exact: true })).toBeNull();
        expect(screen.getByRole('button', { name: 'タスクを管理' })).toBeTruthy();
    });

    it('makes completion explicit and leaves a visible reopen action when new work exists', async () => {
        state.data.projects[0].completed_at = '2026-09-12 10:00:00';
        state.complete.mockImplementation(async (_id, completed) => { if (!completed) state.data.projects[0].completed_at = null; });
        render(createElement(ProjectPage));
        expect(screen.getByText('完了後の未完了 1件')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '再開', exact: true }));
        await waitFor(() => expect(state.complete).toHaveBeenCalledWith(7, false));
        await screen.findByRole('button', { name: '完了にする' });
        expect(screen.queryByText('完了後の未完了 1件')).toBeNull();
    });

    it('does not offer project completion for Inbox', () => {
        state.data.projects[0].is_default = 1;
        render(createElement(ProjectPage));
        expect(screen.queryByRole('button', { name: '完了にする' })).toBeNull();
    });
});
