import { describe, expect, it } from 'vitest';
import { collectWorkSignals } from '@/lib/workSignals';

const today = '2026-09-13';
const task = patch => ({ id: 1, title: '判断する', status_code: 1, importance_level: 2, ...patch });
const keys = (tasks, projects = []) => collectWorkSignals(tasks, today, projects).map(group => group.key);

describe('全体の約束を見失わない注意集計', () => {
    it('過去の予定を付けただけで重要案件を注意対象から消さない', () => {
        expect(keys([task({ importance_level: 3 })])).toEqual(['important']);
        expect(keys([task({ importance_level: 3, today_date: '2026-09-12' })])).toEqual(['missed-plan', 'important']);
    });
    it('昨日以前の未消化予定を古い順に示し、日付を自動変更しない', () => {
        const tasks = [task({ id: 1, today_date: '2026-09-12' }), task({ id: 2, today_date: '2026-09-01' }), task({ id: 3, today_date: today })];
        const before = structuredClone(tasks);
        expect(collectWorkSignals(tasks, today)[0].tasks.map(t => t.id)).toEqual([2, 1]);
        expect(tasks).toEqual(before);
    });
    it('真の期限・確認日・有効な将来予定は尊重して重要案件の一律催促をしない', () => {
        expect(keys([
            task({ id: 1, importance_level: 3, due_date: '2026-11-01' }),
            task({ id: 2, importance_level: 3, review_date: '2026-10-01' }),
            task({ id: 3, importance_level: 3, today_date: today }),
        ])).toEqual([]);
    });
    it('完了成果の期限は除外するが未完了が再発したらプロジェクトと仕事の期限を戻す', () => {
        const projects = [{ id: 1, name: '合意済み', due_date: '2026-09-01', completed_at: '2026-09-02' }];
        expect(keys([], projects)).toEqual([]);
        const groups = collectWorkSignals([task({ project_id: 1, due_date: '2026-09-12' })], today, projects);
        expect(groups).toHaveLength(1);
        expect(groups[0].tasks.map(t => t.title)).toEqual(['合意済み', '判断する']);
        expect(keys([], [{ ...projects[0], progress: { open: 1 } }])).toEqual(['overdue']);
    });
    it('完了・取消・保管済みは過去予定があっても未消化にしない', () => {
        expect(keys([task({ status_code: 3, today_date: '2026-09-01' }), task({ status_code: 5, today_date: '2026-09-01' }), task({ archived_at: today, today_date: '2026-09-01' })])).toEqual([]);
    });
    it('当日期限と7日境界、確認日、保留の注意を従来どおり扱う', () => {
        const groups = collectWorkSignals([
            task({ id: 1, due_date: today }), task({ id: 2, due_date: '2026-09-20' }), task({ id: 3, due_date: '2026-09-21' }),
            task({ id: 4, review_date: today }), task({ id: 5, status_code: 4 }),
        ], today);
        expect(groups.map(g => [g.key, g.tasks.map(t => t.id)])).toEqual([['due', [1, 2]], ['review', [4]], ['waiting', [5]]]);
    });
});
