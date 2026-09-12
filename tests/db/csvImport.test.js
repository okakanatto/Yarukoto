/**
 * CSVインポートの DB 操作ロジックのユニットテスト
 * DataPanel.js の handleImport が行う3パス処理を直接 DB に対して再現・検証する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { importTasksCSV, readTaskCSV } from '@/lib/csv';
import { createTestDb, seedTags } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
    db = await createTestDb();
});

// Exercise the production importer; inspect assigned IDs for relationship assertions.
async function runImport(db, csvText) {
    const before = (await db.select('SELECT COALESCE(MAX(id), 0) AS id FROM tasks'))[0].id;
    const count = await importTasksCSV(db, csvText);
    const inserted = await db.select('SELECT id FROM tasks WHERE id > $1 ORDER BY id', [before]);
    const idMap = {};
    readTaskCSV(csvText).forEach((row, i) => { if (row.id) idMap[row.id] = inserted[i].id; });
    return { count, idMap };
}

describe('CSVインポート — 基本動作', () => {
    it('title のみの CSV をインポートできる（後方互換）', async () => {
        const csv = 'title\nタスクA\nタスクB';
        const { count } = await runImport(db, csv);
        expect(count).toBe(2);
        const rows = await db.select("SELECT title FROM tasks WHERE title IN ('タスクA','タスクB') ORDER BY title");
        expect(rows.map(r => r.title).sort()).toEqual(['タスクA', 'タスクB']);
    });

    it('空のタイトル行はスキップされる', async () => {
        const csv = 'title\nタスクA\n\nタスクB';
        const { count } = await runImport(db, csv);
        expect(count).toBe(2);
    });

    it('BOM 付き UTF-8 CSV を正しく処理できる', async () => {
        const csv = '\uFEFFtitle\nBOM付きタスク';
        const { count } = await runImport(db, csv);
        expect(count).toBe(1);
        const rows = await db.select("SELECT title FROM tasks WHERE title = 'BOM付きタスク'");
        expect(rows).toHaveLength(1);
    });
});

describe('CSVインポート — フルフィールド', () => {
    it('status_code・importance_level・urgency_level を正しく取り込む', async () => {
        const csv = 'title,status_code,importance_level,urgency_level\n重要タスク,2,3,2';
        await runImport(db, csv);
        const rows = await db.select("SELECT * FROM tasks WHERE title = '重要タスク'");
        expect(rows[0].status_code).toBe(2);
        expect(rows[0].importance_level).toBe(3);
        expect(rows[0].urgency_level).toBe(2);
    });

    it('estimated_minutes・notes・due_date を正しく取り込む', async () => {
        const csv = 'title,estimated_minutes,notes,due_date\n詳細タスク,90,メモ内容,2026-04-01';
        await runImport(db, csv);
        const rows = await db.select("SELECT * FROM tasks WHERE title = '詳細タスク'");
        expect(rows[0].estimated_hours).toBe(90);
        expect(rows[0].notes).toBe('メモ内容');
        expect(rows[0].due_date).toBe('2026-04-01');
    });

    it('completed_at・archived_at を正しく取り込む', async () => {
        const csv = 'title,status_code,completed_at,archived_at\n完了タスク,3,2026-03-10,2026-03-11';
        await runImport(db, csv);
        const rows = await db.select("SELECT * FROM tasks WHERE title = '完了タスク'");
        expect(rows[0].completed_at).toBe('2026-03-10');
        expect(rows[0].archived_at).toBe('2026-03-11');
    });
});

describe('CSVインポート — parent_id リマップ（Pass 2）', () => {
    it('親子関係を正しくリマップして取り込む', async () => {
        // CSV 上の id=1 が親、id=2 が子
        const csv = 'id,title,parent_id\n1,親タスク,\n2,子タスク,1';
        const { idMap } = await runImport(db, csv);

        const parentNewId = idMap['1'];
        const childNewId = idMap['2'];
        expect(parentNewId).toBeGreaterThan(0);
        expect(childNewId).toBeGreaterThan(0);

        const child = await db.select('SELECT parent_id FROM tasks WHERE id = $1', [childNewId]);
        expect(child[0].parent_id).toBe(parentNewId);
    });

    it('parent_id 列がない CSV では親子関係を設定しない', async () => {
        const csv = 'title\n単独タスク';
        await runImport(db, csv);
        const rows = await db.select("SELECT parent_id FROM tasks WHERE title = '単独タスク'");
        expect(rows[0].parent_id).toBeNull();
    });

    it('存在しない parent_id は書き込み前に拒否する', async () => {
        await expect(runImport(db, 'id,title,parent_id\n1,子,99')).rejects.toThrow('親タスク');
        expect(await db.select('SELECT id FROM tasks')).toEqual([]);
    });
});

describe('CSVインポート — タグ関連付け（Pass 3）', () => {
    it('既存タグをタスクに関連付ける', async () => {
        const [tagId] = await seedTags(db, [{ name: '仕事' }]);
        const csv = 'title,tags\nタグ付きタスク,仕事';
        const { idMap } = await runImport(db, csv);
        const newId = Object.values(idMap)[0] || (await db.select("SELECT id FROM tasks WHERE title = 'タグ付きタスク'"))[0].id;
        const links = await db.select('SELECT tag_id FROM task_tags WHERE task_id = $1', [newId]);
        expect(links.map(l => l.tag_id)).toContain(tagId);
    });

    it('未登録のタグは新規作成して関連付ける', async () => {
        const csv = 'title,tags\n新タグタスク,新しいタグ';
        await runImport(db, csv);
        const tags = await db.select("SELECT id FROM tags WHERE name = '新しいタグ'");
        expect(tags).toHaveLength(1);
        const task = await db.select("SELECT id FROM tasks WHERE title = '新タグタスク'");
        const link = await db.select('SELECT * FROM task_tags WHERE task_id = $1 AND tag_id = $2', [task[0].id, tags[0].id]);
        expect(link).toHaveLength(1);
    });

    it('パイプ区切りで複数タグを関連付ける', async () => {
        const csv = 'title,tags\n複数タグタスク,タグA|タグB|タグC';
        await runImport(db, csv);
        const task = await db.select("SELECT id FROM tasks WHERE title = '複数タグタスク'");
        const links = await db.select('SELECT * FROM task_tags WHERE task_id = $1', [task[0].id]);
        expect(links).toHaveLength(3);
    });

    it('タグ列がない CSV ではタグを関連付けない', async () => {
        const csv = 'title\nタグなしタスク';
        await runImport(db, csv);
        const task = await db.select("SELECT id FROM tasks WHERE title = 'タグなしタスク'");
        const links = await db.select('SELECT * FROM task_tags WHERE task_id = $1', [task[0].id]);
        expect(links).toHaveLength(0);
    });
});
