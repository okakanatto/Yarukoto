/** @vitest-environment jsdom */
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
import WorkSignals, { collectWorkSignals } from '@/components/WorkSignals';
import * as workspace from '@/lib/workspace';
import { createTestDb, seedTasks } from '../__helpers__/testDb';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const expandAll = () => fireEvent.click(screen.getByRole('button', { name: /^確認 \d+$/ }));

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

    it('starts with compact counts and exposes every item when expanded', () => {
        const onOpenTask = vi.fn();
        const tasks = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, title: `期限確認 ${index + 1}`, status_code: 1, due_date: '2020-01-01' }));
        render(createElement(WorkSignals, { tasks, onOpenTask }));
        expect(screen.queryByRole('list')).toBeNull();
        expect(screen.getByRole('button', { name: '確認 5' }).getAttribute('aria-expanded')).toBe('false');
        expandAll();
        expect(within(screen.getByRole('list', { name: '確認する仕事' })).getAllByRole('listitem')).toHaveLength(5);
        fireEvent.click(screen.getByRole('button', { name: /期限確認 5/ }));
        expect(onOpenTask).toHaveBeenCalledWith(5);
        expect(screen.queryByRole('list')).toBeNull();
    });

    it('shows and opens a project deadline even when the project has no tasks', () => {
        const onOpenProject = vi.fn();
        const onOpenTask = vi.fn();
        render(createElement(WorkSignals, { tasks: [], projects: [{ id: 10, name: '方式合意', due_date: '2020-01-01' }], onOpenProject, onOpenTask }));
        expandAll();
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
        expect(screen.getByRole('button', { name: '確認 2' })).toBeTruthy();
        expandAll();
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^タスクの約束/ }));
        expandAll();
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

    it('counts one task once while preserving all reasons and category filters', () => {
        render(createElement(WorkSignals, { tasks: [{ id: 1, title: '複数の確認理由', status_code: 4, due_date: '2020-01-01', today_date: '2020-01-01', review_date: '2020-01-01' }] }));
        expect(screen.getByRole('button', { name: '確認 1' })).toBeTruthy();
        expandAll();
        const list = screen.getByRole('list', { name: '確認する仕事' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(1);
        expect(within(list).getByText('期限超過')).toBeTruthy();
        expect(within(list).getByText('確認日到来')).toBeTruthy();
        expect(within(list).getByText('未消化の予定')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^未消化の予定\s*1$/ }));
        expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    });

    it.each([['今日に', false], ['予定を外す', true]])('%s updates only the plan in the real in-memory database', async (buttonName, remove) => {
        const db = await createTestDb();
        const [id] = await seedTasks(db, [{ title: '予定を修復', status_code: 1, today_date: '2020-01-01', due_date: '2035-05-20', notes: '元の背景' }]);
        const before = (await db.select('SELECT * FROM tasks WHERE id = $1', [id]))[0];
        const operation = vi.spyOn(workspace, 'setTaskPlan');
        const { rerender } = render(createElement(WorkSignals, { tasks: [before] }));
        expandAll();
        fireEvent.click(screen.getByRole('button', { name: buttonName }));
        await waitFor(() => expect(operation).toHaveBeenCalledWith(id, remove ? null : new Date().toLocaleDateString('sv-SE')));
        await waitFor(() => expect(screen.getByRole('button', { name: buttonName }).disabled).toBe(false));
        const after = (await db.select('SELECT * FROM tasks WHERE id = $1', [id]))[0];
        expect(after).toMatchObject({ today_date: remove ? null : new Date().toLocaleDateString('sv-SE'), due_date: before.due_date, notes: before.notes, status_code: 1 });
        rerender(createElement(WorkSignals, { tasks: [after] }));
        expect(screen.queryByRole('button', { name: /未消化の予定/ })).toBeNull();
    });

    it('keeps the missed plan visible and shows an error when saving fails, then permits retry', async () => {
        const db = await createTestDb();
        const [id] = await seedTasks(db, [{ title: '未保存の予定', status_code: 1, today_date: '2020-01-01', due_date: '2035-05-20' }]);
        const before = (await db.select('SELECT * FROM tasks WHERE id = $1', [id]))[0];
        const operation = vi.spyOn(workspace, 'setTaskPlan').mockRejectedValueOnce(new Error('保存に失敗しました'));
        render(createElement(WorkSignals, { tasks: [before] }));
        expandAll();
        fireEvent.click(screen.getByRole('button', { name: '今日に' }));
        expect(await screen.findByRole('alert')).toHaveProperty('textContent', '保存に失敗しました');
        expect((await db.select('SELECT today_date, due_date FROM tasks WHERE id = $1', [id]))[0]).toEqual({ today_date: before.today_date, due_date: before.due_date });
        expect(screen.getByRole('button', { name: /^未保存の予定/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '今日に' }));
        await waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    it('prevents duplicate plan updates while a write is pending', async () => {
        let finish;
        const operation = vi.spyOn(workspace, 'setTaskPlan').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        render(createElement(WorkSignals, { tasks: [{ id: 1, title: '保存中', status_code: 1, today_date: '2020-01-01' }] }));
        expandAll();
        fireEvent.click(screen.getByRole('button', { name: '今日に' }));
        fireEvent.click(screen.getByRole('button', { name: '予定を外す' }));
        expect(operation).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: '今日に' }).disabled).toBe(true);
        await act(async () => finish());
        expect(screen.getByRole('button', { name: '今日に' }).disabled).toBe(false);
    });

    it('rechecks yesterday plans after midnight and on returning focus', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 13, 23, 59, 30));
        render(createElement(WorkSignals, { tasks: [{ id: 1, title: '昨日になった予定', status_code: 1, today_date: '2026-09-13' }] }));
        expect(screen.queryByRole('region')).toBeNull();
        act(() => vi.advanceTimersByTime(60000));
        expect(screen.getByRole('button', { name: /^未消化の予定\s*1$/ })).toBeTruthy();
        vi.setSystemTime(new Date(2026, 8, 13, 12));
        act(() => window.dispatchEvent(new Event('focus')));
        expect(screen.queryByRole('button', { name: /未消化の予定/ })).toBeNull();
    });
});
