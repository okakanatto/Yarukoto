import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchDb, parseTags } from '@/lib/utils';
import { taskComparator } from '@/lib/taskSorter';
import { ancestorPath } from '@/lib/taskHierarchy';

/**
 * Custom hook that manages today-page task data:
 * - Master data loading (statuses, tags, importance, urgency, settings)
 * - Task + routine fetching, merging and sorting
 * - Sort mode / sort key state
 * - Unfiltered stats for progress ring (BUG-12 fix)
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
    // allTasks: unfiltered data from DB (used for stats + as source for filtering)
    const [allTasks, setAllTasks] = useState([]);
    const [dataDate, setDataDate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [statuses, setStatuses] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [allImportance, setAllImportance] = useState([]);
    const [allUrgency, setAllUrgency] = useState([]);
    const [showOverdue, setShowOverdue] = useState(false); // DB default is '0' (disabled)

    const [sortKey, setSortKey] = useState('priority');
    const [sortMode, setSortMode] = useState('auto');

    // Tracks the most recent async fetch request to prevent tab-switching Race Conditions
    const activeRequestId = useRef(0);
    const masterRequestId = useRef(0);
    const selectedDateRef = useRef(selectedDate);
    const invalidateTaskRequests = useCallback(() => { activeRequestId.current++; }, []);
    const invalidateAllRequests = useCallback(() => { masterRequestId.current++; activeRequestId.current++; }, []);
    // Guards against fetching tasks before master data (statuses, settings) is loaded
    const [masterDataReady, setMasterDataReady] = useState(false);

    const loadMasterData = useCallback(async () => {
        const currentRequest = ++masterRequestId.current;
        activeRequestId.current++;
        setLoading(true);
        setError('');
        setMasterDataReady(false);
        try {
            const db = await fetchDb();
            const [rows, tagsRows, importanceRows, urgencyRows, settingsRows, sortModeRows] = await Promise.all([
                db.select('SELECT * FROM status_master ORDER BY sort_order, code'),
                db.select('SELECT * FROM tags ORDER BY sort_order, id'),
                db.select('SELECT * FROM importance_master ORDER BY level'),
                db.select('SELECT * FROM urgency_master ORDER BY level'),
                db.select('SELECT value FROM app_settings WHERE key = $1', ['show_overdue_in_today']),
                db.select('SELECT value FROM app_settings WHERE key = $1', ['sort_mode_today']),
            ]);
            if (currentRequest !== masterRequestId.current) return;
            setStatuses(rows);
            setAllTags(tagsRows);
            setAllImportance(importanceRows);
            setAllUrgency(urgencyRows);
            setShowOverdue(settingsRows[0]?.value === '1');
            setSortMode(sortModeRows[0]?.value || 'auto');
            setMasterDataReady(true);
        } catch (failure) {
            if (currentRequest !== masterRequestId.current) return;
            console.error('Failed to load today settings:', failure);
            setAllTasks([]);
            setDataDate(null);
            setError('予定の設定を読み込めませんでした。');
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMasterData();
        return invalidateAllRequests;
    }, [loadMasterData, invalidateAllRequests]);

    // Fetch all tasks/routines for the date WITHOUT filter conditions.
    // Filtering is applied in useMemo below (BUG-12 fix).
    const loadTasks = useCallback(async (date) => {
        // Skip fetching until master data (statuses, settings) is loaded.
        if (!masterDataReady || date !== selectedDateRef.current) return;

        const currentReq = ++activeRequestId.current;
        setLoading(true);
        setError('');
        try {
            const db = await fetchDb();

            const todayStr = new Date().toLocaleDateString('sv-SE');
            const isViewingToday = (date === todayStr);

            // Get valid routines for this date (no filter conditions in SQL)
            const routinesSql = `
              SELECT r.*,
                     rc.completion_date,
                     pj.name as project_name,
                     pj.color as project_color,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM routines r
              LEFT JOIN routine_tags rt ON r.id = rt.routine_id
              LEFT JOIN tags tg ON rt.tag_id = tg.id
              LEFT JOIN routine_completions rc ON r.id = rc.routine_id AND rc.completion_date = $1
              LEFT JOIN projects pj ON r.project_id = pj.id
              WHERE r.enabled = 1
                AND (r.end_date IS NULL OR r.end_date >= $2)
              GROUP BY r.id
            `;
            const rawRoutines = await db.select(routinesSql, [date, date]);

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
                    project_name: r.project_name,
                    project_color: r.project_color,
                    tags: parseTags(r)
                }));

            // Get tasks assigned to this date (no filter conditions in SQL)
            // IMP-14: Include archived completed tasks (archived_at IS NULL OR status=3)
            const tasksSql = `
              SELECT t.*,
                     p.title as parent_title,
                     pj.name as project_name,
                     pj.color as project_color,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM tasks t
              LEFT JOIN tasks p ON t.parent_id = p.id
              LEFT JOIN projects pj ON t.project_id = pj.id
              LEFT JOIN task_tags tt ON t.id = tt.task_id
              LEFT JOIN tags tg ON tt.tag_id = tg.id
              WHERE (t.archived_at IS NULL OR t.status_code = 3) AND t.status_code != 5
                AND (
                  t.today_date = $1
                  OR t.due_date = $2
                  ${showOverdue && isViewingToday ? 'OR (t.due_date < $3 AND t.status_code NOT IN (3, 5))' : ''}
                  OR (t.status_code = 3 AND date(t.completed_at) = $4)
                )
              GROUP BY t.id
            `;
            const rawTasks = await db.select(tasksSql, [date, date, date, date]);
            const graph = await db.select('SELECT id, title, parent_id FROM tasks');

            const standardTasks = rawTasks.map(t => ({
                ...t,
                ancestors: ancestorPath(graph, t.id),
                is_archived: !!t.archived_at,
                tags: parseTags(t)
            }));

            // Combine (unfiltered)
            const unified = [...routineTasks, ...standardTasks];

            if (currentReq === activeRequestId.current) {
                setAllTasks(unified);
                setDataDate(date);
            }
        } catch (e) {
            if (currentReq !== activeRequestId.current) return;
            console.error("Tauri DB fetch today error:", e);
            setAllTasks([]);
            setDataDate(null);
            setError('予定を読み込めませんでした。');
        } finally {
            if (currentReq === activeRequestId.current) {
                setLoading(false);
            }
        }
    }, [showOverdue, masterDataReady]);

    // Re-fetch tasks when selectedDate or loadTasks changes; listen for taskAdded events
    useEffect(() => {
        selectedDateRef.current = selectedDate;
        loadTasks(selectedDate);
        const handleTaskAdded = () => loadTasks(selectedDate);
        window.addEventListener('yarukoto:taskAdded', handleTaskAdded);
        window.addEventListener('yarukoto:tasksChanged', handleTaskAdded);
        return () => {
            invalidateTaskRequests();
            window.removeEventListener('yarukoto:taskAdded', handleTaskAdded);
            window.removeEventListener('yarukoto:tasksChanged', handleTaskAdded);
        };
    }, [selectedDate, loadTasks, invalidateTaskRequests]);

    const retry = useCallback(() => masterDataReady ? loadTasks(selectedDate) : loadMasterData(), [masterDataReady, loadTasks, selectedDate, loadMasterData]);

    // A different date must never borrow the previous date's successful result,
    // including the render before the date-change effect has started its fetch.
    const datedTasks = useMemo(() => dataDate === selectedDate ? allTasks : [], [allTasks, dataDate, selectedDate]);

    // BUG-12 fix: Apply filters + sort in useMemo (reactive to filter/sort changes).
    // allTasks is the unfiltered source, ensuring stats are computed from all data.
    const tasks = useMemo(() => {
        let filtered = [...datedTasks];

        // Status filter
        if (filterStatuses.length > 0) {
            const showComplete = filterStatuses.includes(3);
            const showIncomplete = filterStatuses.includes(1) || filterStatuses.includes(2);
            filtered = filtered.filter(t => {
                if (t.is_routine) {
                    if (t.status_code === 3) return showComplete;
                    return showIncomplete;
                }
                return filterStatuses.includes(t.status_code);
            });
        }

        // Tag filter
        if (filterTags.length > 0) {
            filtered = filtered.filter(t =>
                t.tags && t.tags.some(tag => filterTags.includes(tag.id))
            );
        }

        // Importance filter
        if (filterImportance.length > 0) {
            filtered = filtered.filter(t => filterImportance.includes(t.importance_level));
        }

        // Urgency filter
        if (filterUrgency.length > 0) {
            filtered = filtered.filter(t => filterUrgency.includes(t.urgency_level));
        }

        // Sort
        if (sortMode === 'manual') {
            // BUG-13 fix: Use only today_sort_order + stable ID tie-breaker.
            // Avoid status-based secondary sort which causes completed tasks to
            // jump to the end when today_sort_order values are equal (e.g. 0).
            filtered.sort((a, b) => {
                const orderDiff = (a.today_sort_order || 0) - (b.today_sort_order || 0);
                if (orderDiff !== 0) return orderDiff;
                // Stable tie-breaker by ID (numeric compare for tasks, string for routines)
                if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id;
                return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
            });
        } else {
            filtered.sort(taskComparator(sortKey, statuses));
        }

        return filtered;
    }, [datedTasks, filterStatuses, filterTags, filterImportance, filterUrgency, sortKey, sortMode, statuses]);

    // BUG-12 fix: Stats computed from unfiltered allTasks, independent of active filters.
    const unfilteredStats = useMemo(() => {
        const total = datedTasks.length;
        const completed = datedTasks.filter(t => t.status_code === 3).length;
        const remaining = datedTasks.filter(t => t.status_code !== 3 && t.status_code !== 5);
        const remainingMin = remaining.reduce((s, t) => s + (t.estimated_hours || 0), 0);
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, remaining: remaining.length, remainingMin, pct };
    }, [datedTasks]);

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
        tasks, setTasks: setAllTasks, loading: loading || (!error && dataDate !== selectedDate), loadTasks, error, retry, dataDate,
        unfilteredStats,
        statuses, allTags, allImportance, allUrgency,
        showOverdue, sortMode, sortKey, setSortKey,
        toggleSortMode,
    };
}
