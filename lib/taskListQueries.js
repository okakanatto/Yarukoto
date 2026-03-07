/**
 * Builds the SQL query and params for fetching the task list.
 * Extracted from components/TaskList.js (IMP-18).
 *
 * @param {Object} options
 * @param {boolean} options.showArchived
 * @param {number[]} options.filterStatuses
 * @param {number[]} options.filterTags
 * @param {number[]} options.filterImportance
 * @param {number[]} options.filterUrgency
 * @param {number[]} options.filterProjects
 * @param {number|null} options.projectId - Single project filter (via props)
 * @param {string} [options.archiveMonth] - Filter by archive month (YYYY-MM)
 * @param {string} [options.searchTerm] - Search archived tasks by title (LIKE)
 * @returns {{ sql: string, params: any[] }}
 */
export function buildTaskListQuery(options) {
    const {
        showArchived,
        filterStatuses,
        filterTags,
        filterImportance,
        filterUrgency,
        filterProjects,
        projectId,
        archiveMonth,
        searchTerm,
    } = options;

    let sql = `
      SELECT t.*,
             p.title as parent_title,
             pj.name as project_name,
             pj.color as project_color,
             im.label as importance_label, im.color as importance_color,
             um.label as urgency_label, um.color as urgency_color,
             sm.label as status_label, sm.color as status_color,
             json_group_array(tg.name) as tag_names,
             json_group_array(tg.color) as tag_colors,
             json_group_array(tg.id) as tag_ids
      FROM tasks t
      LEFT JOIN tasks p ON t.parent_id = p.id
      LEFT JOIN projects pj ON t.project_id = pj.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      LEFT JOIN importance_master im ON t.importance_level = im.level
      LEFT JOIN urgency_master um ON t.urgency_level = um.level
      LEFT JOIN status_master sm ON t.status_code = sm.code
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by archive status
    if (showArchived) {
        conditions.push('t.archived_at IS NOT NULL');
    } else {
        conditions.push('t.archived_at IS NULL');
    }

    if (filterStatuses.length > 0) {
        const placeholders = filterStatuses.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.status_code IN (${placeholders})`);
        params.push(...filterStatuses);
    }

    if (filterTags.length > 0) {
        const placeholders = filterTags.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.id IN (SELECT task_id FROM task_tags WHERE tag_id IN (${placeholders}))`);
        params.push(...filterTags);
    }

    if (filterImportance.length > 0) {
        const placeholders = filterImportance.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.importance_level IN (${placeholders})`);
        params.push(...filterImportance);
    }

    if (filterUrgency.length > 0) {
        const placeholders = filterUrgency.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.urgency_level IN (${placeholders})`);
        params.push(...filterUrgency);
    }

    // Filter by project (single prop)
    if (projectId) {
        conditions.push(`t.project_id = $${paramIndex++}`);
        params.push(projectId);
    }

    // Filter by projects (multi-select)
    if (filterProjects.length > 0) {
        const placeholders = filterProjects.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.project_id IN (${placeholders})`);
        params.push(...filterProjects);
    }

    // Filter by archive month (IMP-20)
    if (archiveMonth) {
        conditions.push(`strftime('%Y-%m', t.archived_at) = $${paramIndex++}`);
        params.push(archiveMonth);
    }

    // Search by title (IMP-20)
    if (searchTerm) {
        conditions.push(`t.title LIKE $${paramIndex++}`);
        params.push(`%${searchTerm}%`);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Archive views sort by archived_at DESC; normal views by due_date/created_at
    if (showArchived) {
        sql += ' GROUP BY t.id ORDER BY t.archived_at DESC';
    } else {
        sql += ' GROUP BY t.id ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC';
    }

    return { sql, params };
}

/**
 * Builds the SQL query for monthly summary of archived tasks.
 * Returns rows like [{month: '2026-03', count: 12}, ...] ordered by month DESC.
 * Used for the archive accordion view (IMP-20).
 *
 * @param {Object} options - Filter options (same as buildTaskListQuery minus showArchived)
 * @returns {{ sql: string, params: any[] }}
 */
export function buildArchiveMonthlySummaryQuery(options) {
    const {
        filterStatuses = [],
        filterTags = [],
        filterImportance = [],
        filterUrgency = [],
        filterProjects = [],
        projectId,
    } = options;

    const conditions = ['t.archived_at IS NOT NULL'];
    const params = [];
    let paramIndex = 1;

    if (filterStatuses.length > 0) {
        const placeholders = filterStatuses.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.status_code IN (${placeholders})`);
        params.push(...filterStatuses);
    }

    if (filterTags.length > 0) {
        const placeholders = filterTags.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.id IN (SELECT task_id FROM task_tags WHERE tag_id IN (${placeholders}))`);
        params.push(...filterTags);
    }

    if (filterImportance.length > 0) {
        const placeholders = filterImportance.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.importance_level IN (${placeholders})`);
        params.push(...filterImportance);
    }

    if (filterUrgency.length > 0) {
        const placeholders = filterUrgency.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.urgency_level IN (${placeholders})`);
        params.push(...filterUrgency);
    }

    if (projectId) {
        conditions.push(`t.project_id = $${paramIndex++}`);
        params.push(projectId);
    }

    if (filterProjects.length > 0) {
        const placeholders = filterProjects.map(() => `$${paramIndex++}`).join(',');
        conditions.push(`t.project_id IN (${placeholders})`);
        params.push(...filterProjects);
    }

    const sql = `
      SELECT
        strftime('%Y-%m', t.archived_at) as month,
        COUNT(*) as count
      FROM tasks t
      WHERE ${conditions.join(' AND ')}
      GROUP BY strftime('%Y-%m', t.archived_at)
      ORDER BY month DESC
    `;

    return { sql, params };
}
