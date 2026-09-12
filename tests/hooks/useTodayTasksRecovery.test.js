/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTodayTasks } from '@/hooks/useTodayTasks';

const api = vi.hoisted(() => ({ fetchDb: vi.fn(), select: vi.fn(), execute: vi.fn() }));
vi.mock('@/lib/utils', () => ({ fetchDb: () => api.fetchDb(), parseTags: () => [] }));
vi.mock('@/lib/holidayService', () => ({ isRoutineActiveOnDate: async () => true }));
const filters = { filterStatuses: [], filterTags: [], filterImportance: [], filterUrgency: [] };
const A = '2026-09-12', B = '2026-09-13';
let rejectDate = null;

const taskFor = date => ({ id: date === A ? 12 : 13, title: `${date} の仕事`, status_code: 1, today_date: date, importance_level: 1, urgency_level: 1, estimated_hours: 10 });
async function select(sql, params = []) {
    if (sql.includes('FROM status_master')) return [{ code: 1, label: '未着手', sort_order: 1 }, { code: 3, label: '完了', sort_order: 3 }];
    if (sql.includes('FROM app_settings')) return [{ value: params[0] === 'sort_mode_today' ? 'manual' : '0' }];
    if (sql.includes('FROM routines r')) return [];
    if (sql.includes('SELECT t.*')) {
        if (params[0] === rejectDate) throw new Error('task read failed');
        return [taskFor(params[0])];
    }
    if (sql.includes('SELECT id, title, parent_id FROM tasks')) return [];
    return [];
}

beforeEach(() => {
    vi.clearAllMocks();
    rejectDate = null;
    api.select.mockImplementation(select);
    api.fetchDb.mockResolvedValue({ select: api.select, execute: api.execute });
    api.execute.mockResolvedValue({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('useTodayTasks handles failed loading without misrepresenting another date', () => {
    it('stops loading on a master-data failure and retries settings and tasks', async () => {
        api.fetchDb.mockRejectedValueOnce(new Error('database unavailable'));
        const { result } = renderHook(() => useTodayTasks(A, filters));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('予定の設定を読み込めませんでした。');
        expect(result.current.tasks).toEqual([]);
        await act(async () => { await result.current.retry(); });
        await waitFor(() => expect(result.current.tasks.map(task => task.id)).toEqual([12]));
        expect(result.current.error).toBe('');
        expect(result.current.loading).toBe(false);
        expect(result.current.sortMode).toBe('manual');
        expect(result.current.statuses).toHaveLength(2);
    });

    it('clears the old date and its totals when the newly selected date fails, then retries that date', async () => {
        const { result, rerender } = renderHook(({ date }) => useTodayTasks(date, filters), { initialProps: { date: A } });
        await waitFor(() => expect(result.current.tasks[0]?.id).toBe(12));
        rejectDate = B;
        rerender({ date: B });
        expect(result.current.tasks).toEqual([]);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('予定を読み込めませんでした。');
        expect(result.current.unfilteredStats.total).toBe(0);
        expect(result.current.dataDate).toBeNull();
        rejectDate = null;
        await act(async () => { await result.current.retry(); });
        await waitFor(() => expect(result.current.tasks[0]?.id).toBe(13));
        expect(result.current.error).toBe('');
        expect(result.current.dataDate).toBe(B);
        expect(result.current.unfilteredStats.remainingMin).toBe(10);
    });

    it('ignores an older failed request after a newer date has succeeded', async () => {
        let rejectOldRequest;
        api.select.mockImplementation((sql, params) => {
            if (sql.includes('SELECT t.*') && params[0] === A) return new Promise((_, reject) => { rejectOldRequest = reject; });
            return select(sql, params);
        });
        const { result, rerender } = renderHook(({ date }) => useTodayTasks(date, filters), { initialProps: { date: A } });
        await waitFor(() => expect(rejectOldRequest).toBeTypeOf('function'));
        rerender({ date: B });
        await waitFor(() => expect(result.current.tasks[0]?.id).toBe(13));
        await act(async () => { rejectOldRequest(new Error('old date failed')); });
        expect(result.current.error).toBe('');
        expect(result.current.loading).toBe(false);
        expect(result.current.dataDate).toBe(B);
        expect(result.current.tasks[0].id).toBe(13);
    });

    it('ignores an older success and stale reload callbacks after switching dates', async () => {
        let finishOldRequest;
        api.select.mockImplementation((sql, params) => {
            if (sql.includes('SELECT t.*') && params[0] === A) return new Promise(resolve => { finishOldRequest = resolve; });
            return select(sql, params);
        });
        const { result, rerender } = renderHook(({ date }) => useTodayTasks(date, filters), { initialProps: { date: A } });
        await waitFor(() => expect(finishOldRequest).toBeTypeOf('function'));
        const oldReload = () => result.current.loadTasks(A);
        rerender({ date: B });
        await waitFor(() => expect(result.current.tasks[0]?.id).toBe(13));
        await act(async () => { finishOldRequest([taskFor(A)]); await oldReload(); });
        expect(result.current.dataDate).toBe(B);
        expect(result.current.tasks[0].id).toBe(13);
        expect(result.current.loading).toBe(false);
    });

    it('keeps unfiltered totals and configured sorting after retrying a same-date refresh', async () => {
        const chosen = { ...filters, filterStatuses: [3] };
        const { result } = renderHook(() => useTodayTasks(A, chosen));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.tasks).toEqual([]);
        expect(result.current.unfilteredStats.total).toBe(1);
        rejectDate = A;
        await act(async () => { window.dispatchEvent(new CustomEvent('yarukoto:tasksChanged')); });
        await waitFor(() => expect(result.current.error).toBeTruthy());
        expect(result.current.unfilteredStats.total).toBe(0);
        rejectDate = null;
        await act(async () => { await result.current.retry(); });
        expect(result.current.tasks).toEqual([]);
        expect(result.current.unfilteredStats.total).toBe(1);
        expect(result.current.sortMode).toBe('manual');
    });
});
