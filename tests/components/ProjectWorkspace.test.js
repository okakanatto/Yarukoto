/** @vitest-environment jsdom */
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        expect(screen.getByTestId('existing-input').textContent).toBe('入力先 7');
        expect(screen.getByTestId('existing-list').textContent).toBe('管理対象 7');
    });

    it('retains an edited outcome and does not complete the project if saving fails', async () => {
        state.save.mockRejectedValue(new Error('保存に失敗'));
        render(createElement(ProjectPage));
        fireEvent.click(screen.getByRole('button', { name: '編集' }));
        fireEvent.change(screen.getByLabelText('成果'), { target: { value: '合意した条件を残す' } });
        fireEvent.click(screen.getByRole('button', { name: '完了にする' }));
        await screen.findByRole('alert');
        expect(state.complete).not.toHaveBeenCalled();
        expect(screen.getByLabelText('成果').value).toBe('合意した条件を残す');
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
