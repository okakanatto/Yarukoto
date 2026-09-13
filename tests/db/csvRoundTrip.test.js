import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedTasks, seedProject } from '../__helpers__/testDb';
import { importTasksCSV, exportTasksCSV, parseCSV } from '@/lib/csv';
import { collectWorkSignals } from '@/lib/workSignals';
let db;
beforeEach(async () => { db = await createTestDb(); });
describe('実際のCSV入出力', () => {
    it('表計算の年/月/日形式を正規化し、期限・確認日・過去予定を取込直後から抽出できる', async () => {
        await importTasksCSV(db, 'title,start_date,due_date,today_date,review_date\n移行方式を決める, 2026/9/1 ,2026/9/14,2026-9-12,2026/9/13');
        const rows = await db.select('SELECT * FROM tasks');
        expect(rows[0]).toMatchObject({ start_date: '2026-09-01', due_date: '2026-09-14', today_date: '2026-09-12', review_date: '2026-09-13' });
        expect(collectWorkSignals(rows, '2026-09-13').map(g => g.key)).toEqual(['due', 'review', 'missed-plan']);
    });
    it('閏日と空の日付を扱い、空の予定を今日へ補完しない', async () => {
        await importTasksCSV(db, 'title,due_date,today_date,review_date\n確認,2028/2/29,  ,');
        const [task] = await db.select('SELECT due_date, today_date, review_date FROM tasks');
        expect(task).toEqual({ due_date: '2028-02-29', today_date: null, review_date: null });
    });
    it.each([
        ['due_date', '2026-02-29'], ['due_date', '2026/4/31'], ['today_date', '09/14/2026'],
        ['review_date', '2026-13-01'], ['start_date', '2026-09-00'], ['due_date', '46279'],
        ['due_date', '2026-09-14T10:00:00Z'], ['due_date', '2026-9/14'],
    ])('%s の不正値 %s は列名とレコード番号を示して既存データを変えず拒否する', async (field, value) => {
        const [existing] = await seedTasks(db, [{ title: '既存の仕事', due_date: '2026-09-20' }]);
        const csv = `title,${field}\n有効な先頭行,2026-09-14\n日付が不正な行,${value}`;
        await expect(importTasksCSV(db, csv)).rejects.toThrow(`データ2件目の${field}`);
        expect(await db.select('SELECT id, title, due_date FROM tasks')).toEqual([{ id: existing, title: '既存の仕事', due_date: '2026-09-20' }]);
    });
    it('作業履歴のJSONを原文のままラウンドトリップし、旧CSVには空の履歴を適用する', async () => {
        const log = JSON.stringify([{ id: 'step-1', result: '例外は11件\n方式比較へ', consumed_step: '件数を確認', created_at: '2026-09-13T12:00:00.000Z', kind: 'step' }], null, 2);
        const csv = exportTasksCSV([{ title: '移行方式', work_log: log }]);
        await importTasksCSV(db, csv);
        await importTasksCSV(db, 'title\n旧CSV');
        expect((await db.select('SELECT work_log FROM tasks ORDER BY id')).map(t => t.work_log)).toEqual([log, '[]']);
    });
    it.each(['{}', 'null', 'not JSON'])('作業履歴 %s は配列でなければ一件も追加する前に拒否する', async workLog => {
        const csv = exportTasksCSV([{ title: '有効な行', work_log: '[]' }, { title: '不正な行', work_log: workLog }]);
        await expect(importTasksCSV(db, csv)).rejects.toThrow('データ2件目のwork_log');
        expect(await db.select('SELECT id FROM tasks')).toEqual([]);
    });
    it('先頭へ追加して負数になった並び順をそのまま再取込できる', async () => {
        const csv = exportTasksCSV([{ id: 1, title: '先頭の仕事', status_code: 1, sort_order: -4, today_sort_order: -2, estimated_hours: 30 }]);
        await importTasksCSV(db, csv);
        const [task] = await db.select('SELECT sort_order, today_sort_order, estimated_hours FROM tasks');
        expect(task).toEqual({ sort_order: -4, today_sort_order: -2, estimated_hours: 30 });
    });
    it('別DBの同じIDへ誤分類せずCSVのプロジェクト名で照合する', async () => {
        const correct = await seedProject(db, { name: '人事データ' });
        await importTasksCSV(db, 'title,project_id,project\nデータ照合,1,人事データ');
        expect((await db.select('SELECT project_id FROM tasks'))[0].project_id).toBe(correct);
        await expect(importTasksCSV(db, 'title,project_id,project\n別の仕事,1,存在しない名前')).rejects.toThrow('プロジェクト');
        expect(await db.select('SELECT id FROM tasks')).toHaveLength(1);
    });
    it('改行・引用符・空行・空白・孫・次の一手をラウンドトリップしIDを再割当する', async () => {
        const original = '  人事,データ\r\n\r\n"件数"が違う\n  ';
        const [root] = await seedTasks(db, [{ title: '判断', notes: original }]);
        const [child] = await seedTasks(db, [{ title: '調査', parent_id: root }]);
        const [leaf] = await seedTasks(db, [{ title: '照合', parent_id: child }]);
        await db.execute('UPDATE tasks SET capture_text = $1, source_ref = $2, waiting_on = $3, review_date = $4, next_task_id = $5, last_opened_at = $6 WHERE id = $7', [original, 'local/path\n資料', '田中さん', '2026-10-01', leaf, '2026-09-12 12:00:00', root]);
        await db.execute('UPDATE tasks SET next_step = $1, work_started_at = $2 WHERE id = $3', ['比較表の見出しだけ\n最初の1件', '2026-09-13 09:12:03.456', root]);
        const rows = await db.select('SELECT * FROM tasks ORDER BY id');
        const csv = exportTasksCSV(rows);
        expect(parseCSV(csv)).toHaveLength(4);
        expect(await importTasksCSV(db, csv)).toBe(3);
        const imported = await db.select('SELECT * FROM tasks WHERE id > $1 ORDER BY id', [leaf]);
        expect(imported[0].notes).toBe(original);
        expect(imported[0].capture_text).toBe(original);
        expect(imported[0].source_ref).toBe('local/path\n資料');
        expect(imported[0].waiting_on).toBe('田中さん');
        expect(imported[0].review_date).toBe('2026-10-01');
        expect(imported[0].last_opened_at).toBe('2026-09-12 12:00:00');
        expect(imported[0].next_step).toBe('比較表の見出しだけ\n最初の1件');
        expect(imported[0].work_started_at).toBe('2026-09-13 09:12:03.456');
        expect(imported[0].next_task_id).toBe(imported[2].id);
        expect(imported[1].parent_id).toBe(imported[0].id);
        expect(imported[2].parent_id).toBe(imported[1].id);
    });
    it('タイトルだけの既存CSVも取り込む', async () => {
        expect(await importTasksCSV(db, 'title\nメモ')).toBe(1);
        const [row] = await db.select('SELECT * FROM tasks');
        expect(row.status_code).toBe(1);
        expect(row.capture_text).toBe('');
        expect(row.created_at).toBeTruthy();
    });
    it.each([
        ['title\n"閉じていない', '引用符'],
        ['id,title,parent_id\n1,A,2\n2,B,1', '循環'],
        ['id,title,parent_id\n1,A,\n1,B,', '重複'],
        ['id,title,parent_id\n1,A,99', '親タスク'],
        ['id,title,parent_id,next_task_id\n1,A,,2\n2,B,,', '子孫'],
    ])('不正なCSVは一件も書く前に拒否する: %s', async (text, error) => {
        await expect(importTasksCSV(db, text)).rejects.toThrow(error);
        expect(await db.select('SELECT id FROM tasks')).toEqual([]);
    });
});
