/**
 * CSVインポートの DB 操作ロジックのユニットテスト
 * DataPanel.js の handleImport が行う3パス処理を直接 DB に対して再現・検証する。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, seedTags } from '../__helpers__/testDb.js';

let db;

beforeEach(async () => {
    db = await createTestDb();
});

// parseCSVLine の実装（DataPanel.js と同一）
const parseCSVLine = (line) => {
    const cols = [];
    let cur = '', inQ = false, i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (inQ) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    cur += '"'; i += 2;
                } else { inQ = false; i++; }
            } else { cur += ch; i++; }
        } else {
            if (ch === '"') { inQ = true; i++; }
            else if (ch === ',') { cols.push(cur); cur = ''; i++; }
            else { cur += ch; i++; }
        }
    }
    cols.push(cur);
    return cols;
};

/**
 * handleImport の3パス処理を DB に対して再現するヘルパー。
 * @param {object} db - テスト用 DB インスタンス
 * @param {string} csvText - BOM なし CSV テキスト
 * @returns {Promise<{count: number, idMap: object}>}
 */
async function runImport(db, csvText) {
    const lines = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSVにデータ行がありません');

    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const titleIdx = headers.indexOf('title');
    if (titleIdx === -1) throw new Error('title列が見つかりません');

    const col = (name) => headers.indexOf(name);
    const getVal = (cols, name) => {
        const idx = col(name);
        if (idx < 0 || idx >= cols.length) return null;
        const v = cols[idx].trim();
        return v || null;
    };

    // Load master data for label→code lookups
    const statusMap = {};
    const importanceMap = {};
    const urgencyMap = {};
    const projectMap = {};

    if (col('status') >= 0 && col('status_code') < 0) {
        (await db.select('SELECT code, label FROM status_master')).forEach(s => { statusMap[s.label] = s.code; });
    }
    if (col('importance') >= 0 && col('importance_level') < 0) {
        (await db.select('SELECT level, label FROM importance_master')).forEach(r => { importanceMap[r.label] = r.level; });
    }
    if (col('urgency') >= 0 && col('urgency_level') < 0) {
        (await db.select('SELECT level, label FROM urgency_master')).forEach(r => { urgencyMap[r.label] = r.level; });
    }
    if (col('project') >= 0 && col('project_id') < 0) {
        (await db.select('SELECT id, name FROM projects WHERE archived_at IS NULL')).forEach(p => { projectMap[p.name] = p.id; });
    }

    // Parse all data rows
    const parsed = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const title = cols[titleIdx]?.trim();
        if (!title) continue;
        parsed.push({ cols, title, csvId: getVal(cols, 'id') });
    }

    // Pass 1: Insert tasks, build old→new id mapping
    const idMap = {};
    let count = 0;

    for (const row of parsed) {
        const { cols, title, csvId } = row;

        let statusCode = getVal(cols, 'status_code');
        if (!statusCode) {
            const label = getVal(cols, 'status');
            statusCode = label ? statusMap[label] : null;
        }
        statusCode = statusCode ? parseInt(statusCode) : 1;

        let impLevel = getVal(cols, 'importance_level');
        if (!impLevel) {
            const label = getVal(cols, 'importance');
            impLevel = label ? importanceMap[label] : null;
        }
        impLevel = impLevel ? parseInt(impLevel) : null;

        let urgLevel = getVal(cols, 'urgency_level');
        if (!urgLevel) {
            const label = getVal(cols, 'urgency');
            urgLevel = label ? urgencyMap[label] : null;
        }
        urgLevel = urgLevel ? parseInt(urgLevel) : null;

        let projectId = getVal(cols, 'project_id');
        if (!projectId) {
            const name = getVal(cols, 'project');
            projectId = name ? projectMap[name] : null;
        }
        projectId = projectId ? parseInt(projectId) : null;

        const estMin = getVal(cols, 'estimated_minutes');
        const sortOrder = getVal(cols, 'sort_order');

        const result = await db.execute(
            `INSERT INTO tasks (title, status_code, importance_level, urgency_level,
             start_date, due_date, estimated_hours, today_date, notes,
             project_id, sort_order, created_at, updated_at, completed_at, archived_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [title, statusCode, impLevel, urgLevel,
             getVal(cols, 'start_date'), getVal(cols, 'due_date'),
             estMin ? parseInt(estMin) : null, getVal(cols, 'today_date'), getVal(cols, 'notes'),
             projectId, sortOrder ? parseInt(sortOrder) : null,
             getVal(cols, 'created_at'), getVal(cols, 'updated_at'),
             getVal(cols, 'completed_at'), getVal(cols, 'archived_at')]
        );

        const newId = result.lastInsertId;
        if (csvId) idMap[csvId] = newId;
        row.newId = newId;
        count++;
    }

    // Pass 2: Update parent_id references
    if (col('parent_id') >= 0) {
        for (const row of parsed) {
            const parentCsvId = getVal(row.cols, 'parent_id');
            if (parentCsvId && idMap[parentCsvId] && row.newId) {
                await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [idMap[parentCsvId], row.newId]);
            }
        }
    }

    // Pass 3: Insert tags
    if (col('tags') >= 0) {
        const existingTags = await db.select('SELECT id, name FROM tags');
        const tagNameToId = {};
        existingTags.forEach(t => { tagNameToId[t.name] = t.id; });

        for (const row of parsed) {
            const tagStr = getVal(row.cols, 'tags');
            if (!tagStr || !row.newId) continue;
            const tagNames = tagStr.split('|').map(t => t.trim()).filter(Boolean);
            for (const tagName of tagNames) {
                let tagId = tagNameToId[tagName];
                if (!tagId) {
                    const r = await db.execute('INSERT INTO tags (name) VALUES ($1)', [tagName]);
                    tagId = r.lastInsertId;
                    tagNameToId[tagName] = tagId;
                }
                await db.execute('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [row.newId, tagId]);
            }
        }
    }

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

    it('存在しない parent_id の参照は無視される', async () => {
        // id=99 は CSV に存在しない
        const csv = 'id,title,parent_id\n2,子タスク,99';
        await runImport(db, csv);
        const rows = await db.select("SELECT parent_id FROM tasks WHERE title = '子タスク'");
        expect(rows[0].parent_id).toBeNull();
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
