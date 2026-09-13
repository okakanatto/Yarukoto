import { describe, expect, it } from 'vitest';
import { workChoices, recordsToRevisit } from '@/lib/workChoices';
import { captureExcerpt, workSummary } from '@/lib/workEntries';
import { collectWorkSignals } from '@/lib/workSignals';

const today = '2026-09-13';
const task = (id, changes = {}) => ({ id, title: `仕事 ${id}`, status_code: 1, importance_level: 2, created_at: '2026-09-01 09:00:00', ...changes });
const ids = choices => choices.map(choice => choice.task.id);

describe('取りかかる候補と記録の見返し', () => {
    it('今日までの実期限を再開候補より先に示し、重複掲載せず元の予定・状態を変えない', () => {
        const tasks = [
            task(1, { due_date: '2026-09-12', today_date: '2026-09-10' }),
            task(2, { due_date: today, status_code: 2, work_started_at: '2026-09-13 09:00:00' }),
            task(3, { status_code: 2, work_started_at: '2026-09-13 10:00:00' }),
        ];
        const before = structuredClone(tasks);
        const choices = workChoices(tasks, [tasks[1]], today, 3);
        expect(ids(choices)).toEqual([1, 2, 3]);
        expect(choices.map(choice => choice.reason)).toEqual(['期限を確認', '今日が期限', '続きから']);
        expect(tasks).toEqual(before);
    });

    it('待ち・開始前・未来予定は着手候補にせず、競合する本当の期限は全体確認に残す', () => {
        const tasks = [
            task(1, { waiting_on: '人事の回答', review_date: today, due_date: today }),
            task(2, { status_code: 4, due_date: today }),
            task(3, { start_date: '2026-09-20', due_date: today }),
            task(4, { today_date: '2026-09-20', due_date: '2026-09-12' }),
            task(5, { waiting_on: '  ', start_date: today, today_date: today }),
        ];
        const before = structuredClone(tasks);
        expect(ids(workChoices(tasks, tasks, today, 3))).toEqual([5]);
        const signals = collectWorkSignals(tasks, today);
        expect(signals.find(group => group.key === 'overdue').tasks.map(t => t.id)).toEqual([4]);
        expect(signals.find(group => group.key === 'due').tasks.map(t => t.id)).toEqual([1, 2, 3]);
        expect(signals.find(group => group.key === 'review').tasks.map(t => t.id)).toEqual([1]);
        expect(tasks).toEqual(before);
    });

    it('未完了の今日のルーティンを残し、完了・取消・保管は候補に戻さない', () => {
        const routine = task('routine_10_2026-09-13', { is_routine: true });
        const planned = task(10, { today_date: today });
        const tasks = [planned, task(20, { status_code: 3 }), task(21, { status_code: 5 }), task(22, { archived_at: today })];
        const choices = workChoices(tasks, [routine, planned, task('routine_11_2026-09-13', { is_routine: true, status_code: 3 })], today, null);
        expect(ids(choices)).toEqual([routine.id, planned.id]);
        expect(choices[0].reason).toBe('今日のルーティン');
    });

    it('閲覧しただけの未着手を再開扱いせず、前回IDが無効なら実際の作業開始時刻へ戻る', () => {
        const tasks = [
            task(1, { status_code: 2, work_started_at: '2026-09-13 09:00:00' }),
            task(2, { status_code: 2, work_started_at: '2026-09-13 10:00:00' }),
            task(3, { last_opened_at: '2026-09-13 12:00:00' }),
        ];
        // A start made from the existing task list is newer than the saved
        // detail-panel ID, and must become the work to return to.
        expect(ids(workChoices(tasks, [], today, 1)).slice(0, 2)).toEqual([2, 1]);
        const mostRecentFirst = tasks.map(t => t.id === 1 ? { ...t, work_started_at: '2026-09-13 11:00:00' } : t);
        expect(ids(workChoices(mostRecentFirst, [], today, 1)).slice(0, 2)).toEqual([1, 2]);
        const afterBrowsing = workChoices(tasks, [], today, 3);
        expect(ids(afterBrowsing)).toEqual([2, 1, 3]);
        expect(afterBrowsing.find(choice => choice.task.id === 3).reason).not.toBe('続きから');
        expect(ids(workChoices(tasks, [], today, 999)).slice(0, 2)).toEqual([2, 1]);
    });

    it('日付も分類もない古い200件を切り捨てず、未閲覧の古い記録から再発見できる', () => {
        const tasks = Array.from({ length: 200 }, (_, index) => task(index + 1, { title: '人事データの件', capture_text: `人事データの件\n背景 ${index + 1}` })).reverse();
        tasks.find(t => t.id === 1).last_opened_at = '2026-09-13 10:00:00';
        const before = structuredClone(tasks);
        const choices = workChoices(tasks, [], today, null);
        const revisit = recordsToRevisit(tasks, today);
        expect(choices).toHaveLength(200);
        expect(new Set(ids(choices)).size).toBe(200);
        expect(ids(choices).slice(0, 3)).toEqual([2, 3, 4]);
        expect(revisit.map(t => t.id)).toEqual(ids(choices));
        expect(revisit.at(-1).id).toBe(1);
        expect(tasks).toEqual(before);
    });

    it('見返しから待ち・進行中・完了・取消・保管を除き、未整理のカスタム状態を残す', () => {
        const tasks = [task(1), task(2, { status_code: 2 }), task(3, { status_code: 3 }), task(4, { status_code: 4 }), task(5, { status_code: 5 }), task(6, { archived_at: today }), task(7, { waiting_on: '回答待ち' }), task(8, { status_code: 6 })];
        expect(recordsToRevisit(tasks, today).map(t => t.id)).toEqual([1, 8]);
    });
    it('開始前・未来に予定済みの仕事を見返しで再判断させず、その当日になったら戻す', () => {
        const tasks = [task(1, { start_date: '2026-09-20' }), task(2, { today_date: '2026-09-20' }), task(3, { today_date: today })];
        const before = structuredClone(tasks);
        expect(recordsToRevisit(tasks, today).map(t => t.id)).toEqual([3]);
        expect(recordsToRevisit(tasks, '2026-09-20').map(t => t.id)).toEqual([1, 2, 3]);
        expect(tasks).toEqual(before);
    });
});

describe('候補を再理解する文脈', () => {
    it('同じ仮題でも原文の背景を識別に使い、利用者が付け直した題名なら原文先頭も保つ', () => {
        const first = task(1, { title: '人事データの件', capture_text: '人事データの件\n旧コード移行の例外' });
        const second = task(2, { title: '人事データの件', capture_text: '人事データの件\n採用データとの連携方法' });
        expect(captureExcerpt(first)).toBe('旧コード移行の例外');
        expect(captureExcerpt(second)).toBe('採用データとの連携方法');
        expect(captureExcerpt({ ...first, title: '移行方式を合意する' })).toBe('人事データの件 旧コード移行の例外');
    });

    it('次の一歩と直近の結果を同時に見せ、最新の空メモで結果を消さない', () => {
        const record = task(1, { next_step: '方式Aを比較する', notes: '古いメモ', work_log: JSON.stringify([
            { id: '1', created_at: '2026-09-12', result: '例外11件を特定' },
            { id: '2', created_at: today, result: '', kind: 'pause' },
        ]) });
        expect(workSummary(record)).toMatchObject({ step: '方式Aを比較する', context: '例外11件を特定', result: '例外11件を特定' });
        expect(workSummary({ ...record, next_task_title: '方式Bの見積を確認' }).step).toBe('方式Bの見積を確認');
    });

    it('取り込んだ配列の中に不正な結果型が混ざってもホームを壊さず有効な文脈を表示する', () => {
        const record = task(1, { notes: '原文から復帰できる', work_log: JSON.stringify([
            { created_at: today, result: 123 }, { created_at: today, result: { detail: '型が不正' } },
        ]) });
        expect(workSummary(record).context).toBe('原文から復帰できる');
    });
});
