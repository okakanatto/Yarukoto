import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchDb, parseTags } from '@/lib/utils';
import { taskComparator } from '@/lib/taskSorter';

/**
 * Custom hook that manages today-page task data:
 * - Master data loading (statuses, tags, importance, urgency, settings)
 * - Task + routine fetching, merging and sorting
 * - Sort mode / sort key state
 *
 * Extracted from app/today/page.js (Phase 2-1).
 *
 * @param {string} selectedDate - The currently selected date (YYYY-MM-DD)
 * @param {object} filters - Active filter values
 * @param {number[]} filters.filterStatuses
 * @param {number[]} filters.filterTags
 * @param {number[]} filters.filterImportance
 * @param {number[]} filters.filterUrgency
 */
export function useTodayTasks(selectedDate, { filterStatuses, filterTags, filterImportance, filterUrgency }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const [statuses, setStatuses] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [allImportance, setAllImportance] = useState([]);
    const [allUrgency, setAllUrgency] = useState([]);
    const [showOverdue, setShowOverdue] = useState(true);

    const [sortKey, setSortKey] = useState('priority');
    const [sortMode, setSortMode] = useState('auto');

    // Tracks the most recent async fetch request to prevent tab-switching Race Conditions
    const activeRequestId = useRef(0);

    // Load master data once on mount
    useEffect(() => {
        (async () => {
            try {
                const db = await fetchDb();
                const rows = await db.select('SELECT * FROM status_master ORDER BY sort_order, code');
                setStatuses(rows);

                const tagsRows = await db.select('SELECT * FROM tags ORDER BY sort_order, id');
                setAllTags(tagsRows);

                const importanceRows = await db.select('SELECT * FROM importance_master ORDER BY level');
                setAllImportance(importanceRows);
                const urgencyRows = await db.select('SELECT * FROM urgency_master ORDER BY level');
                setAllUrgency(urgencyRows);

                const settingsRows = await db.select('SELECT value FROM app_settings WHERE key = $1', ['show_overdue_in_today']);
                if (settingsRows.length > 0) {
                    setShowOverdue(settingsRows[0].value === '1');
                }

                const sortModeRows = await db.select('SELECT value FROM app_settings WHERE key = $1', ['sort_mode_today']);
                if (sortModeRows.length > 0) setSortMode(sortModeRows[0].value);
            } catch (e) { console.error('Failed to load statuses/tags:', e); }
        })();
    }, []);

    const loadTasks = useCallback(async (date) => {
        const currentReq = ++activeRequestId.current;
        setLoading(true);
        try {
            const db = await fetchDb();

            const dObj = new Date(date + 'T00:00:00');
            const todayStr = new Date().toLocaleDateString('sv-SE');
            const isViewingToday = (date === todayStr);

            // Build condition strings
            const tConditions = [];
            const rConditions = [];
            const sqlParams = [date, date, date, date];
            let paramIndex = 5;

            if (filterStatuses.length > 0) {
                const tPlaceholders = filterStatuses.map(() => `$${paramIndex++}`).join(',');
                tConditions.push(`t.status_code IN (${tPlaceholders})`);
                sqlParams.push(...filterStatuses);

                // Routine status mapping: routines only have done(3) or not-done(1)
                const showComplete = filterStatuses.includes(3);
                const showIncomplete = filterStatuses.includes(1) || filterStatuses.includes(2);
                if (showComplete && !showIncomplete) {
                    rConditions.push('rc.completion_date IS NOT NULL');
                } else if (!showComplete && showIncomplete) {
                    rConditions.push('rc.completion_date IS NULL');
                } else if (!showComplete && !showIncomplete) {
                    rConditions.push('1 = 0');
                }
            }

            // Routine SQL uses standard args first
            const rSqlParams = [date, date];
            let rParamIndex = 3;

            if (filterTags.length > 0) {
                const tPlaceholders = filterTags.map(() => `$${paramIndex++}`).join(',');
                tConditions.push(`t.id IN (SELECT task_id FROM task_tags WHERE tag_id IN (${tPlaceholders}))`);
                sqlParams.push(...filterTags);

                const rPlaceholders = filterTags.map(() => `$${rParamIndex++}`).join(',');
                rConditions.push(`r.id IN (SELECT routine_id FROM routine_tags WHERE tag_id IN (${rPlaceholders}))`);
                rSqlParams.push(...filterTags);
            }

            if (filterImportance.length > 0) {
                const tPlaceholders = filterImportance.map(() => `$${paramIndex++}`).join(',');
                tConditions.push(`t.importance_level IN (${tPlaceholders})`);
                sqlParams.push(...filterImportance);

                const rPlaceholders = filterImportance.map(() => `$${rParamIndex++}`).join(',');
                rConditions.push(`r.importance_level IN (${rPlaceholders})`);
                rSqlParams.push(...filterImportance);
            }

            if (filterUrgency.length > 0) {
                const tPlaceholders = filterUrgency.map(() => `$${paramIndex++}`).join(',');
                tConditions.push(`t.urgency_level IN (${tPlaceholders})`);
                sqlParams.push(...filterUrgency);

                const rPlaceholders = filterUrgency.map(() => `$${rParamIndex++}`).join(',');
                rConditions.push(`r.urgency_level IN (${rPlaceholders})`);
                rSqlParams.push(...filterUrgency);
            }

            const tConditionStr = tConditions.length > 0 ? ' AND ' + tConditions.join(' AND ') : '';
            const rConditionStr = rConditions.length > 0 ? ' AND ' + rConditions.join(' AND ') : '';

            // Get valid routines for this date
            const routinesSql = `
              SELECT r.*,
                     rc.completion_date,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM routines r
              LEFT JOIN routine_tags rt ON r.id = rt.routine_id
              LEFT JOIN tags tg ON rt.tag_id = tg.id
              LEFT JOIN routine_completions rc ON r.id = rc.routine_id AND rc.completion_date = $1
              WHERE r.enabled = 1
                AND (r.end_date IS NULL OR r.end_date >= $2)
                ${rConditionStr}
              GROUP BY r.id
            `;
            const rawRoutines = await db.select(routinesSql, rSqlParams);

            const { isRoutineActiveOnDate } = await import('@/lib/holidayService');
            const activeRawRoutines = [];
            for (const r of rawRoutines) {
                const isActive = await isRoutineActiveOnDate(db, r, date);
                if (isActive) activeRawRoutines.push(r);
            }

            const routineTasks = activeRawRoutines
                .map(r => ({
                    id: `routine_${r.id}_${date}`,
                    routine_id: r.id,
                    is_routine: true,
                    title: r.title,
                    status_code: r.completion_date ? 3 : 1,
                    importance_level: r.importance_level,
                    urgency_level: r.urgency_level,
                    estimated_hours: r.estimated_hours,
                    due_date: null,
                    today_sort_order: r.today_sort_order || 0,
                    tags: parseTags(r)
                }));

            // Get tasks assigned to this date OR overdue standard tasks
            const tasksSql = `
              SELECT t.*,
                     p.title as parent_title,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM tasks t
              LEFT JOIN tasks p ON t.parent_id = p.id
              LEFT JOIN task_tags tt ON t.id = tt.task_id
              LEFT JOIN tags tg ON tt.tag_id = tg.id
              WHERE t.archived_at IS NULL AND t.status_code != 5
                AND (
                  t.today_date = $1
                  OR t.due_date = $2
                  ${showOverdue && isViewingToday ? 'OR (t.due_date < $3 AND t.status_code NOT IN (3, 5))' : ''}
                  OR (t.status_code = 3 AND date(t.completed_at) = $4)
                )
                ${tConditionStr}
              GROUP BY t.id
            `;
            const rawTasks = await db.select(tasksSql, sqlParams);

            const standardTasks = rawTasks.map(t => ({
                ...t,
                tags: parseTags(t)
            }));

            // Combine and sort
            const unified = [...routineTasks, ...standardTasks];

            if (sortMode === 'manual') {
                unified.sort((a, b) => {
                    const orderDiff = (a.today_sort_order || 0) - (b.today_sort_order || 0);
                    if (orderDiff !== 0) return orderDiff;
                    const aDone = a.status_code === 3;
                    const bDone = b.status_code === 3;
                    if (aDone && !bDone) return 1;
                    if (!aDone && bDone) return -1;
                    return (b.importance_level || 0) - (a.importance_level || 0);
                });
            } else {
                unified.sort(taskComparator(sortKey, statuses));
            }

            if (currentReq === activeRequestId.current) {
                setTasks(unified);
            }
        } catch (e) {
            console.error("Tauri DB fetch today error:", e);
        } finally {
            if (currentReq === activeRequestId.current) {
                setLoading(false);
            }
        }
    }, [filterStatuses, filterTags, filterImportance, filterUrgency, sortKey, sortMode, showOverdue, statuses]);

    // Re-fetch tasks when selectedDate or loadTasks changes; listen for taskAdded events
    useEffect(() => {
        loadTasks(selectedDate);
        const handleTaskAdded = () => loadTasks(selectedDate);
        window.addEventListener('yarukoto:taskAdded', handleTaskAdded);
        return () => window.removeEventListener('yarukoto:taskAdded', handleTaskAdded);
    }, [selectedDate, loadTasks]);

    const toggleSortMode = useCallback(async () => {
        const prevMode = sortMode;
        const newMode = prevMode === 'auto' ? 'manual' : 'auto';
        setSortMode(newMode);
        try {
            const db = await fetchDb();
            await db.execute(
                'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
                ['sort_mode_today', newMode]
            );
        } catch (e) {
            console.error(e);
            setSortMode(prevMode);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: '設定の保存に失敗しました', type: 'error' } }));
        }
    }, [sortMode]);

    return {
        tasks, setTasks, loading, loadTasks,
        statuses, allTags, allImportance, allUrgency,
        showOverdue, sortMode, sortKey, setSortKey,
        toggleSortMode,
    };
}
