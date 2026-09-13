import { describe, expect, it } from 'vitest';
import { workChoices, recordsToRevisit } from '@/lib/workChoices';
import { captureExcerpt, workSummary } from '@/lib/workEntries';
import { collectWorkSignals } from '@/lib/workSignals';

const today = '2026-09-13';
const task = (id, changes = {}) => ({ id, title: `仕事 ${id}`, status_code: 1, importance_level: 2, created_at: '2026-09-01 09:00:00', ...changes });
const ids = choices => choices.map(choice => choice.task.id);

describe('取りかかる候補と記録の見返し', () => {
    it('再開と本日期限を並べ、超過の件数で再開を押し出さず、元の予定・状態を変えない', () => {
        const tasks = [
            task(1, { due_date: '2026-09-12', today_date: '2026-09-10' }),
            task(2, { due_date: today, status_code: 2, work_started_at: '2026-09-13 09:00:00' }),
            task(3, { status_code: 2, work_started_at: '2026-09-13 10:00:00' }),
        ];
        const before = structuredClone(tasks);
        const choices = workChoices(tasks, [tasks[1]], today, 3);
        expect(ids(choices)).toEqual([3, 2, 1]);
        expect(choices.map(choice => choice.reason)).toEqual(['続きから', '今日が期限', '期限を確認']);
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
        expect(revisit.map(t => t.id)).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
        expect(tasks).toEqual(before);
    });

    it('見返しから待ち・完了・取消・保管を除き、放置された進行中と未整理のカスタム状態を残す', () => {
        const tasks = [task(1), task(2, { status_code: 2 }), task(3, { status_code: 3 }), task(4, { status_code: 4 }), task(5, { status_code: 5 }), task(6, { archived_at: today }), task(7, { waiting_on: '回答待ち' }), task(8, { status_code: 6 })];
        expect(recordsToRevisit(tasks, today).map(t => t.id)).toEqual([1, 2, 8]);
    });
    it('進行中は実作業から7日空いた時だけ古い順に戻し、閲覧・未来予定・待ちは作業と混同しない', () => {
        const tasks = [
            task(1, { status_code: 2, work_started_at: '2026-09-05 10:00:00', last_opened_at: '2026-09-13 12:00:00' }),
            task(2, { status_code: 2, work_started_at: '2026-09-06 10:00:00' }),
            task(3, { status_code: 2, work_started_at: '2026-09-07 10:00:00' }),
            task(4, { status_code: 2, work_started_at: '2026-09-01 10:00:00', work_log: JSON.stringify([{ created_at: '2026-09-12 09:00:00', kind: 'pause', result: '' }]) }),
            task(5, { status_code: 2, work_started_at: '2026-09-01 10:00:00', today_date: '2026-09-20' }),
            task(6, { status_code: 2, work_started_at: '2026-09-01 10:00:00', waiting_on: '返答待ち' }),
        ];
        expect(recordsToRevisit(tasks, today).map(t => t.id)).toEqual([1, 2]);
        expect(tasks[0].last_opened_at).toBe('2026-09-13 12:00:00');
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
        expect(workSummary(record)).toMatchObject({ step: '方式Aを比較する', context: '例外11件を特定', contextKind: 'result', memo: '古いメモ', result: '例外11件を特定', background: { kind: 'memo', text: '古いメモ' } });
        expect(workSummary({ ...record, next_task_title: '方式Bの見積を確認' }).step).toBe('方式Bの見積を確認');
    });

    it('取り込んだ配列の中に不正な結果型が混ざってもホームを壊さず有効な文脈を表示する', () => {
        const record = task(1, { notes: '原文から復帰できる', work_log: JSON.stringify([
            { created_at: today, result: 123 }, { created_at: today, result: { detail: '型が不正' } },
        ]) });
        expect(workSummary(record).context).toBe('原文から復帰できる');
    });

    it('keeps an undated legacy memo as background beside a dated result', () => {
        const record = task(1, { notes: '現在の判断\n次回も参照する詳細', capture_text: '取り込み原文', work_log: JSON.stringify([
            { created_at: '2026-09-10', result: '以前の作業結果' },
        ]) });
        expect(workSummary(record)).toMatchObject({
            context: '以前の作業結果', contextKind: 'result',
            memo: '現在の判断\n次回も参照する詳細', result: '以前の作業結果',
            latestUpdate: { kind: 'result', text: '以前の作業結果', created_at: '2026-09-10' },
            background: { kind: 'memo', text: '現在の判断\n次回も参照する詳細' },
        });
        expect(workSummary({ ...record, notes: '' })).toMatchObject({ context: '以前の作業結果', contextKind: 'result' });
        expect(workSummary({ ...record, notes: '', work_log: '[]' })).toMatchObject({ context: '取り込み原文', contextKind: 'capture' });
    });

    it('orders a logged memo and result by their real events in both directions', () => {
        const base = task(1, { notes: '合意後の補足', capture_text: '取り込み原文' });
        const memoThenResult = { ...base, work_log: JSON.stringify([
            { created_at: '2026-09-10 09:00:00', kind: 'memo', memo: '合意後の補足' },
            { created_at: '2026-09-11 09:00:00', kind: 'step', result: '方式Aで合意済み' },
        ]) };
        expect(workSummary(memoThenResult)).toMatchObject({
            context: '方式Aで合意済み', contextKind: 'result',
            latestUpdate: { kind: 'result', text: '方式Aで合意済み' },
            background: { kind: 'memo', text: '合意後の補足' },
        });
        const resultThenMemo = { ...base, work_log: JSON.stringify([
            { created_at: '2026-09-10 09:00:00', kind: 'step', result: '方式Aで合意済み' },
            { created_at: '2026-09-11 09:00:00', kind: 'memo', memo: '合意後の補足' },
        ]) };
        expect(workSummary(resultThenMemo)).toMatchObject({
            context: '合意後の補足', contextKind: 'memo',
            latestUpdate: { kind: 'memo', text: '合意後の補足' },
            result: '方式Aで合意済み',
        });
    });
});

describe('100件と前提不足からの候補', () => {
    it('超過が12件あっても再開・本日期限・重要な無期限仕事を先頭で比較できる', () => {
        const tasks = Array.from({ length: 100 }, (_, i) => task(i + 1, i < 12 ? { due_date: '2026-09-01' } : {}));
        Object.assign(tasks[12], { status_code: 2, work_started_at: '2026-09-13 10:00:00' });
        Object.assign(tasks[13], { importance_level: 3 });
        Object.assign(tasks[14], { due_date: today });
        Object.assign(tasks[15], { due_date: '2027-01-01', importance_level: 1 });
        const before = structuredClone(tasks);
        const choices = ids(workChoices(tasks, [], today, 13));
        expect(choices.slice(0, 3)).toEqual([13, 15, 14]);
        expect(choices.indexOf(14)).toBeLessThan(choices.indexOf(16));
        expect(choices).toHaveLength(100);
        expect(tasks).toEqual(before);
        expect(collectWorkSignals(tasks, today).find(group => group.key === 'overdue').tasks).toHaveLength(12);
    });
    it('一歩に選んだ子が待ち・未来予定なら親の期限は残し着手候補から外す', () => {
        const tasks = [task(1, { due_date: today, next_task_id: 2 }), task(2, { parent_id: 1, waiting_on: '回答待ち' }), task(3, { next_task_id: 4 }), task(4, { parent_id: 3, today_date: '2026-09-20' }), task(5)];
        expect(ids(workChoices(tasks, [], today))).toEqual([5]);
        expect(collectWorkSignals(tasks, today).find(group => group.key === 'due').tasks[0].id).toBe(1);
    });
});
