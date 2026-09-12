import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedTasks, seedProject } from '../__helpers__/testDb';
import { importTasksCSV, exportTasksCSV, parseCSV } from '@/lib/csv';
let db;
beforeEach(async () => { db = await createTestDb(); });
describe('実際のCSV入出力', () => {
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
