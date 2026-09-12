import { describe, it, expect } from 'vitest';
import { buildTaskListQuery, buildArchiveMonthlySummaryQuery } from '@/lib/taskListQueries';
import { ancestorPath } from '@/lib/taskHierarchy';
import { createTestDb, seedTasks } from '../__helpers__/testDb';

const queryOptions = {
    showArchived: false,
    filterStatuses: [], filterTags: [], filterImportance: [],
    filterUrgency: [], filterProjects: [], projectId: null,
};

describe('原文と参照元からの検索', () => {
    it.each([
        ['未完了', 1, null],
        ['完了', 3, null],
        ['アーカイブ', 3, '2026-09-12 12:00:00'],
    ])('%s の孫タスクを原文の2行目と参照元から再発見できる', async (_label, statusCode, archivedAt) => {
        const db = await createTestDb();
        const [root] = await seedTasks(db, [{ title: '人事データの判断' }]);
        const [parent] = await seedTasks(db, [{ title: '差分の調査', parent_id: root }]);
        const [leaf] = await seedTasks(db, [{ title: '件数を照合する', parent_id: parent, status_code: statusCode }]);
        await db.execute('UPDATE tasks SET capture_text = $1, source_ref = $2, archived_at = $3 WHERE id = $4', [
            '件数を照合する\n雇用区分の集計基準が不明\n次回の会議で確認する',
            "C:/人事/O'Brien/比較表.xlsx", archivedAt, leaf,
        ]);
        for (const searchTerm of ['雇用区分', "O'Brien"]) {
            const query = buildTaskListQuery({
                ...queryOptions, searchTerm, showArchived: Boolean(archivedAt),
                filterStatuses: [statusCode], archiveMonth: archivedAt ? '2026-09' : undefined,
            });
            const rows = await db.select(query.sql, query.params);
            expect(rows.map(task => task.id)).toEqual([leaf]);
            expect(rows[0].parent_title).toBe('差分の調査');
            const graph = await db.select('SELECT id, title, parent_id FROM tasks');
            expect(ancestorPath(graph, rows[0].id).map(task => task.title)).toEqual(['人事データの判断', '差分の調査']);
        }
        const excluded = buildTaskListQuery({ ...queryOptions, searchTerm: '雇用区分', showArchived: !archivedAt });
        expect(await db.select(excluded.sql, excluded.params)).toEqual([]);
    });

    it('LIKE の % と _ は従来どおりワイルドカードとして扱う', async () => {
        const db = await createTestDb();
        const [match] = await seedTasks(db, [{ title: '人事Aデータ照合' }, { title: '人事データ照合' }]);
        const query = buildTaskListQuery({ ...queryOptions, searchTerm: '人事_データ%' });
        expect((await db.select(query.sql, query.params)).map(task => task.id)).toEqual([match]);
    });
});

describe('buildTaskListQuery', () => {
    it('アーカイブのみ表示 (showArchived = true) のクエリを生成する', () => {
        const result = buildTaskListQuery({
            showArchived: true,
            filterStatuses: [],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
        });

        expect(result.sql).toContain('t.archived_at IS NOT NULL');
        expect(result.params).toEqual([]);
    });

    it('通常表示 (showArchived = false) のクエリを生成する', () => {
        const result = buildTaskListQuery({
            showArchived: false,
            filterStatuses: [],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
        });

        expect(result.sql).toContain('t.archived_at IS NULL');
        expect(result.params).toEqual([]);
    });

    it('ステータスフィルタの条件を追加する', () => {
        const result = buildTaskListQuery({
            showArchived: false,
            filterStatuses: [1, 2],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
        });

        expect(result.sql).toContain('t.status_code IN ($1,$2)');
        expect(result.params).toEqual([1, 2]);
    });

    it('複数のフィルタが指定された際に params が順番通りに展開される', () => {
        const result = buildTaskListQuery({
            showArchived: false,
            filterStatuses: [3],
            filterTags: [4, 5],
            filterImportance: [1],
            filterUrgency: [2],
            filterProjects: [6],
            projectId: 99,
        });

        // status(1) -> tags(2) -> importance(1) -> urgency(1) -> projectId(1) -> projects(1)
        expect(result.sql).toContain('t.status_code IN ($1)'); // params[0] = 3
        expect(result.sql).toContain('task_tags WHERE tag_id IN ($2,$3)'); // params[1,2] = 4,5
        expect(result.sql).toContain('t.importance_level IN ($4)'); // params[3] = 1
        expect(result.sql).toContain('t.urgency_level IN ($5)'); // params[4] = 2
        expect(result.sql).toContain('t.project_id = $6'); // params[5] = 99
        expect(result.sql).toContain('t.project_id IN ($7)'); // params[6] = 6

        expect(result.params).toEqual([3, 4, 5, 1, 2, 99, 6]);
    });

    it('GROUP BY と ORDER BY が常に付加される', () => {
        const result = buildTaskListQuery({
            showArchived: false,
            filterStatuses: [],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
        });

        expect(result.sql).toContain('GROUP BY t.id ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC');
    });

    it('archiveMonth が指定された場合、年月の絞り込み条件が追加される', () => {
        const result = buildTaskListQuery({
            showArchived: true,
            filterStatuses: [],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
            archiveMonth: '2026-03'
        });

        expect(result.sql).toContain("strftime('%Y-%m', t.archived_at) = $1");
        expect(result.params).toContain('2026-03');
    });

    it('searchTerm が指定された場合、title・notes・タグ名・原文・参照元のOR検索条件が追加される', () => {
        const result = buildTaskListQuery({
            showArchived: true,
            filterStatuses: [],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
            searchTerm: '会議'
        });

        expect(result.sql).toContain("t.title LIKE $1");
        expect(result.sql).toContain("t.notes LIKE $2");
        expect(result.sql).toContain("tg2.name LIKE $3");
        expect(result.sql).toContain("t.capture_text LIKE $4");
        expect(result.sql).toContain("t.source_ref LIKE $5");
        expect(result.params).toEqual(Array(5).fill('%会議%'));
    });

    it('searchTerm と archiveMonth が同時指定された場合、パラメータが正しくインクリメントされる', () => {
        const result = buildTaskListQuery({
            showArchived: true,
            filterStatuses: [],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
            archiveMonth: '2026-03',
            searchTerm: 'テスト'
        });

        // archiveMonth が $1 を占有 → searchTerm が $2 から $6 になる
        expect(result.sql).toContain("strftime('%Y-%m', t.archived_at) = $1");
        expect(result.sql).toContain("t.title LIKE $2");
        expect(result.sql).toContain("t.notes LIKE $3");
        expect(result.sql).toContain("tg2.name LIKE $4");
        expect(result.sql).toContain("t.capture_text LIKE $5");
        expect(result.sql).toContain("t.source_ref LIKE $6");
        expect(result.params).toEqual(['2026-03', ...Array(5).fill('%テスト%')]);
    });

    it('showArchived = true の場合、ORDER BY は archived_at DESC になる', () => {
        const result = buildTaskListQuery({
            showArchived: true,
            filterStatuses: [],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
        });

        expect(result.sql).toContain('GROUP BY t.id ORDER BY t.archived_at DESC');
    });
});

describe('buildArchiveMonthlySummaryQuery', () => {
    it('アーカイブ済みの月別集計クエリを生成する', () => {
        const result = buildArchiveMonthlySummaryQuery({
            filterStatuses: [],
            filterTags: [],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: null,
        });

        expect(result.sql).toContain('SELECT');
        expect(result.sql).toContain("strftime('%Y-%m', t.archived_at) as month");
        expect(result.sql).toContain('COUNT(*) as count');
        expect(result.sql).toContain('t.archived_at IS NOT NULL');
        expect(result.sql).toContain("GROUP BY strftime('%Y-%m', t.archived_at)");
        expect(result.sql).toContain('ORDER BY month DESC');
        expect(result.params).toEqual([]);
    });

    it('フィルタ条件が正しく適用される', () => {
        const result = buildArchiveMonthlySummaryQuery({
            filterStatuses: [3],
            filterTags: [10],
            filterImportance: [],
            filterUrgency: [],
            filterProjects: [],
            projectId: 5,
        });

        expect(result.sql).toContain('t.status_code IN ($1)');
        expect(result.sql).toContain('task_tags WHERE tag_id IN ($2)');
        expect(result.sql).toContain('t.project_id = $3');
        expect(result.params).toEqual([3, 10, 5]);
    });
});
