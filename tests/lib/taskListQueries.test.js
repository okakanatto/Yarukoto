import { describe, it, expect } from 'vitest';
import { buildTaskListQuery, buildArchiveMonthlySummaryQuery } from '@/lib/taskListQueries';

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

    it('searchTerm が指定された場合、タイトルでの LIKE 検索条件が追加される', () => {
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
        expect(result.params).toContain('%会議%');
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
