/** @vitest-environment jsdom */
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkSignals, { collectWorkSignals } from '@/components/WorkSignals';

afterEach(cleanup);

describe('WorkSignals reliability', () => {
    it('checks each descendant deadline and keeps the seven-day horizon correct across years', () => {
        const groups = collectWorkSignals([
            { id: 1, title: '親', status_code: 1, due_date: '2027-02-01' },
            { id: 2, parent_id: 1, title: '期限超過の孫', status_code: 2, due_date: '2026-12-28' },
            { id: 3, title: '七日先', status_code: 1, due_date: '2027-01-05' },
            { id: 4, title: '八日先', status_code: 1, due_date: '2027-01-06' },
            { id: 5, title: '完了済', status_code: 3, due_date: '2026-12-25' },
            { id: 6, title: '取消済', status_code: 5, due_date: '2026-12-25' },
            { id: 7, title: '保存済', status_code: 1, archived_at: '2026-12-27', due_date: '2026-12-25' },
        ], '2026-12-29');
        expect(groups.find(group => group.key === 'overdue').tasks.map(task => task.id)).toEqual([2]);
        expect(groups.find(group => group.key === 'due').tasks.map(task => task.id)).toEqual([3]);
    });

    it('surfaces waiting work with and without a review date without altering any dates', () => {
        const tasks = [
            { id: 1, status_code: 4, waiting_on: '人事の回答', review_date: '2026-09-15', due_date: '2026-09-20' },
            { id: 2, status_code: 4, waiting_on: '権限付与', review_date: null },
            { id: 3, status_code: 1, importance_level: 3 },
            { id: 4, status_code: 1, importance_level: 3, today_date: '2026-09-16' },
            { id: 5, status_code: 4, title: '既存データの保留（待ち条件欄なし）' },
        ];
        const before = JSON.stringify(tasks);
        const groups = collectWorkSignals(tasks, '2026-09-16');
        expect(groups.find(group => group.key === 'review').tasks.map(task => task.id)).toEqual([1]);
        expect(groups.find(group => group.key === 'waiting').tasks.map(task => task.id)).toEqual([2, 5]);
        expect(groups.find(group => group.key === 'important').tasks.map(task => task.id)).toEqual([3]);
        expect(JSON.stringify(tasks)).toBe(before);
    });

    it('lets the user open every overdue item beyond the initial two-row preview', () => {
        const onOpenTask = vi.fn();
        const tasks = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, title: `期限確認 ${index + 1}`, status_code: 1, due_date: '2020-01-01' }));
        render(createElement(WorkSignals, { tasks, onOpenTask }));
        expect(screen.queryByRole('button', { name: /期限確認 5/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /全5件を表示（残り3件）/ }));
        fireEvent.click(screen.getByRole('button', { name: /期限確認 5/ }));
        expect(onOpenTask).toHaveBeenCalledWith(5);
    });

    it('shows and opens a project deadline even when the project has no tasks', () => {
        const onOpenProject = vi.fn();
        const onOpenTask = vi.fn();
        render(createElement(WorkSignals, { tasks: [], projects: [{ id: 10, name: '方式合意', due_date: '2020-01-01' }], onOpenProject, onOpenTask }));
        fireEvent.click(screen.getByRole('button', { name: /プロジェクト · 方式合意/ }));
        expect(onOpenProject).toHaveBeenCalledWith(10);
        expect(onOpenTask).not.toHaveBeenCalled();
        const groups = collectWorkSignals([], '2026-09-16', [{ id: 11, name: '次の定例', due_date: '2026-09-18' }, { id: 12, name: '保管済み', due_date: '2026-09-10', archived_at: '2026-09-11' }]);
        expect(groups).toHaveLength(1);
        expect(groups[0].key).toBe('due');
        expect(groups[0].tasks[0]).toMatchObject({ id: 11, is_project: true });
    });

    it('keeps project and task IDs distinct and applies the same deadline boundaries', () => {
        const onOpenProject = vi.fn();
        const onOpenTask = vi.fn();
        const tasks = [{ id: 10, title: 'タスクの約束', status_code: 1, due_date: '2020-01-01' }];
        const projects = [{ id: 10, name: 'プロジェクトの約束', due_date: '2020-01-01' }];
        render(createElement(WorkSignals, { tasks, projects, onOpenTask, onOpenProject }));
        fireEvent.click(screen.getByRole('button', { name: /^タスクの約束/ }));
        fireEvent.click(screen.getByRole('button', { name: /^プロジェクト · プロジェクトの約束/ }));
        expect(onOpenTask).toHaveBeenCalledTimes(1);
        expect(onOpenTask).toHaveBeenCalledWith(10);
        expect(onOpenProject).toHaveBeenCalledTimes(1);
        expect(onOpenProject).toHaveBeenCalledWith(10);
        const groups = collectWorkSignals([], '2026-12-29', [
            { id: 1, name: '過去', due_date: '2026-12-28' },
            { id: 2, name: '当日', due_date: '2026-12-29' },
            { id: 3, name: '七日先', due_date: '2027-01-05' },
            { id: 4, name: '八日先', due_date: '2027-01-06' },
        ]);
        expect(groups.find(group => group.key === 'overdue').tasks.map(item => item.id)).toEqual([1]);
        expect(groups.find(group => group.key === 'due').tasks.map(item => item.id)).toEqual([2, 3]);
    });
});
