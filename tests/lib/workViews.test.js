import { describe, expect, it } from 'vitest';
import { isWaiting, workViews } from '@/lib/workViews';

const task = (id, patch = {}) => ({ id, title: `仕事 ${id}`, status_code: 1, ...patch });
const ids = tasks => tasks.map(t => t.id);

describe('ホームの仕事の意味', () => {
    it('今日の集合は共通hookの期限・ルーティン・手動予定をそのまま使う', () => {
        const planned = task(1, { today_date: '2026-09-13' });
        const due = task(2, { due_date: '2026-09-13' });
        const routine = task('routine_1_2026-09-13', { is_routine: true });
        const groups = workViews([planned, due, task(3)], [routine, due, planned, task(4, { status_code: 3 })]);
        expect(ids(groups.today)).toEqual([routine.id, 2, 1]);
    });
    it('詳細を見ただけの仕事は進行中に入れず、実作業開始の新しい順で並べる', () => {
        const groups = workViews([
            task(1, { last_opened_at: '2026-09-13 12:00:00' }),
            task(2, { status_code: 2, work_started_at: '2026-09-12 10:00:00', last_opened_at: '2026-09-13 14:00:00' }),
            task(3, { status_code: 2, work_started_at: '2026-09-13 09:00:00' }),
            task(4, { status_code: 2 }),
        ], []);
        expect(ids(groups.working)).toEqual([3, 2, 4]);
        expect(ids(groups.open)).toEqual([1]);
    });
    it('待ち条件がある着手中は待ちに置き、条件解消で進行中へ戻る', () => {
        const waiting = task(1, { status_code: 2, waiting_on: '担当者の返答', review_date: '2026-09-20' });
        expect(ids(workViews([waiting], []).waiting)).toEqual([1]);
        expect(workViews([waiting], []).working).toEqual([]);
        expect(ids(workViews([{ ...waiting, waiting_on: '', review_date: null }], []).working)).toEqual([1]);
        expect(isWaiting(task(2, { waiting_on: '  ' }))).toBe(false);
        expect(isWaiting(task(3, { status_code: '4' }))).toBe(true);
    });
    it('カスタムの未完了状態も必ず一つの管理タブに属し、完了・保管は除く', () => {
        const groups = workViews([
            task(1, { status_code: 6 }), task(2, { status_code: '7' }), task(3, { status_code: 4 }),
            task(4, { status_code: 2 }), task(5, { status_code: 3 }), task(6, { status_code: 5 }), task(7, { archived_at: '2026-09-01' }),
        ], []);
        expect(ids(groups.open)).toEqual([2, 1]);
        expect(ids(groups.waiting)).toEqual([3]);
        expect(ids(groups.working)).toEqual([4]);
        const assigned = [...groups.open, ...groups.waiting, ...groups.working];
        expect(new Set(ids(assigned)).size).toBe(4);
    });
    it('日付が変わった共通hookの結果に入れ替え、元の予定・状態を変更しない', () => {
        const tasks = [task(1, { today_date: '2026-09-13' }), task(2, { today_date: '2026-09-14' })];
        const before = structuredClone(tasks);
        expect(ids(workViews(tasks, [tasks[0]]).today)).toEqual([1]);
        expect(ids(workViews(tasks, [tasks[1]]).today)).toEqual([2]);
        expect(tasks).toEqual(before);
    });
});
