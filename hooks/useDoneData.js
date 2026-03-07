import { useState, useEffect, useMemo, useCallback } from 'react';
import { toDateStr } from '@/lib/dateUtils';
import { parseTags } from '@/lib/utils';
import { useDbOperation } from '@/hooks/useDbOperation';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function useDoneData() {
    const dbOp = useDbOperation();
    const today = useMemo(() => toDateStr(new Date()), []);

    const [viewMode, setViewMode] = useState('monthly');
    const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
    const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
    const [viewWeekStart, setViewWeekStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    });
    const [selectedDay, setSelectedDay] = useState(today);

    const [summaryLoading, setSummaryLoading] = useState(true);
    const [dayCounts, setDayCounts] = useState({});
    const [periodStats, setPeriodStats] = useState({ tasks: 0, routines: 0 });

    const [detailLoading, setDetailLoading] = useState(false);
    const [dayTasks, setDayTasks] = useState([]);

    // Date range for summary query
    const dateRange = useMemo(() => {
        if (viewMode === 'monthly') {
            const start = toDateStr(new Date(viewYear, viewMonth, 1));
            const end = toDateStr(new Date(viewYear, viewMonth + 1, 0));
            return { start, end };
        }
        if (viewMode === 'weekly') {
            const start = toDateStr(viewWeekStart);
            const endD = new Date(viewWeekStart);
            endD.setDate(endD.getDate() + 6);
            return { start, end: toDateStr(endD) };
        }
        return { start: selectedDay, end: selectedDay };
    }, [viewMode, viewYear, viewMonth, viewWeekStart, selectedDay]);

    // Load summary counts for the period
    const loadSummary = useCallback(async () => {
        setSummaryLoading(true);
        try {
            await dbOp(async (db) => {
                const { start, end } = dateRange;

                const taskRes = await db.select(`
                    SELECT date(completed_at) as date, COUNT(*) as count
                    FROM tasks WHERE status_code = 3 AND completed_at IS NOT NULL
                    AND date(completed_at) >= $1 AND date(completed_at) <= $2
                    GROUP BY date(completed_at)
                `, [start, end]);

                const routineRes = await db.select(`
                    SELECT completion_date as date, COUNT(*) as count
                    FROM routine_completions
                    WHERE completion_date >= $1 AND completion_date <= $2
                    GROUP BY completion_date
                `, [start, end]);

                const counts = {};
                let totalT = 0, totalR = 0;
                for (const r of taskRes) {
                    if (!counts[r.date]) counts[r.date] = { tasks: 0, routines: 0 };
                    counts[r.date].tasks = r.count;
                    totalT += r.count;
                }
                for (const r of routineRes) {
                    if (!counts[r.date]) counts[r.date] = { tasks: 0, routines: 0 };
                    counts[r.date].routines = r.count;
                    totalR += r.count;
                }

                setDayCounts(counts);
                setPeriodStats({ tasks: totalT, routines: totalR });
            }, { error: 'データの読み込みに失敗しました' });
        } catch { /* handled by dbOp */ }
        finally {
            setSummaryLoading(false);
        }
    }, [dateRange, dbOp]);

    // Load day detail tasks
    const loadDayDetail = useCallback(async (date) => {
        setDetailLoading(true);
        try {
            await dbOp(async (db) => {
                const tasks = await db.select(`
                    SELECT t.id, t.title, t.completed_at, t.parent_id, t.estimated_hours,
                           t.archived_at, p.title as parent_title,
                           json_group_array(tg.id) as tag_ids,
                           json_group_array(tg.name) as tag_names,
                           json_group_array(tg.color) as tag_colors
                    FROM tasks t
                    LEFT JOIN tasks p ON t.parent_id = p.id
                    LEFT JOIN task_tags tt ON t.id = tt.task_id
                    LEFT JOIN tags tg ON tt.tag_id = tg.id
                    WHERE t.status_code = 3 AND t.completed_at IS NOT NULL
                    AND date(t.completed_at) = $1
                    GROUP BY t.id
                    ORDER BY t.completed_at DESC
                `, [date]);

                const routines = await db.select(`
                    SELECT r.id, r.title, rc.completion_date
                    FROM routine_completions rc
                    JOIN routines r ON rc.routine_id = r.id
                    WHERE rc.completion_date = $1
                `, [date]);

                const items = [
                    ...tasks.map(t => ({ ...t, tags: parseTags(t), is_routine: false })),
                    ...routines.map(r => ({
                        id: `routine_${r.id}`, title: r.title,
                        completed_at: r.completion_date, is_routine: true, tags: [],
                    })),
                ];

                setDayTasks(items);
            }, { error: 'データの読み込みに失敗しました' });
        } catch { /* handled by dbOp */ }
        finally {
            setDetailLoading(false);
        }
    }, [dbOp]);

    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { loadDayDetail(selectedDay); }, [selectedDay, loadDayDetail]);

    // View mode switch
    const switchViewMode = useCallback((mode) => {
        setViewMode(mode);
        const d = new Date(selectedDay + 'T00:00:00');
        if (mode === 'monthly') {
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
        } else if (mode === 'weekly') {
            const ws = new Date(d);
            ws.setDate(ws.getDate() - ws.getDay());
            setViewWeekStart(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate()));
        }
    }, [selectedDay]);

    // Navigation
    const navigatePrev = useCallback(() => {
        if (viewMode === 'monthly') {
            let newYear = viewYear;
            let newMonth = viewMonth - 1;
            if (newMonth < 0) { newYear--; newMonth = 11; }
            setViewYear(newYear);
            setViewMonth(newMonth);
            setSelectedDay(toDateStr(new Date(newYear, newMonth, 1)));
        } else if (viewMode === 'weekly') {
            const prev = new Date(viewWeekStart);
            prev.setDate(prev.getDate() - 7);
            const ws = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate());
            setViewWeekStart(ws);
            setSelectedDay(toDateStr(ws));
        } else {
            const d = new Date(selectedDay + 'T00:00:00');
            d.setDate(d.getDate() - 1);
            setSelectedDay(toDateStr(d));
        }
    }, [viewMode, viewYear, viewMonth, viewWeekStart, selectedDay]);

    const navigateNext = useCallback(() => {
        if (viewMode === 'monthly') {
            let newYear = viewYear;
            let newMonth = viewMonth + 1;
            if (newMonth > 11) { newYear++; newMonth = 0; }
            setViewYear(newYear);
            setViewMonth(newMonth);
            setSelectedDay(toDateStr(new Date(newYear, newMonth, 1)));
        } else if (viewMode === 'weekly') {
            const next = new Date(viewWeekStart);
            next.setDate(next.getDate() + 7);
            const ws = new Date(next.getFullYear(), next.getMonth(), next.getDate());
            setViewWeekStart(ws);
            setSelectedDay(toDateStr(ws));
        } else {
            const d = new Date(selectedDay + 'T00:00:00');
            d.setDate(d.getDate() + 1);
            setSelectedDay(toDateStr(d));
        }
    }, [viewMode, viewYear, viewMonth, viewWeekStart, selectedDay]);

    const goToToday = useCallback(() => {
        const now = new Date();
        const ts = toDateStr(now);
        setSelectedDay(ts);
        setViewYear(now.getFullYear());
        setViewMonth(now.getMonth());
        const ws = new Date(now);
        ws.setDate(ws.getDate() - ws.getDay());
        setViewWeekStart(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate()));
    }, []);

    // Period label
    const periodLabel = useMemo(() => {
        if (viewMode === 'monthly') return `${viewYear}年${viewMonth + 1}月`;
        if (viewMode === 'weekly') {
            const endD = new Date(viewWeekStart);
            endD.setDate(endD.getDate() + 6);
            return `${viewWeekStart.getMonth() + 1}/${viewWeekStart.getDate()} 〜 ${endD.getMonth() + 1}/${endD.getDate()}`;
        }
        const d = new Date(selectedDay + 'T00:00:00');
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
    }, [viewMode, viewYear, viewMonth, viewWeekStart, selectedDay]);

    // Calendar cells for monthly view
    const calCells = useMemo(() => {
        if (viewMode !== 'monthly') return [];
        const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
        const fdow = new Date(viewYear, viewMonth, 1).getDay();
        const cells = [];
        for (let i = 0; i < fdow; i++) cells.push(null);
        for (let d = 1; d <= dim; d++) {
            const ds = toDateStr(new Date(viewYear, viewMonth, d));
            const c = dayCounts[ds];
            cells.push({ day: d, date: ds, total: c ? c.tasks + c.routines : 0 });
        }
        return cells;
    }, [viewMode, viewYear, viewMonth, dayCounts]);

    // Week days for weekly view
    const weekDays = useMemo(() => {
        if (viewMode !== 'weekly') return [];
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(viewWeekStart);
            d.setDate(d.getDate() + i);
            const ds = toDateStr(d);
            const c = dayCounts[ds];
            days.push({
                date: ds,
                wd: WEEKDAYS[d.getDay()],
                dom: d.getDate(),
                month: d.getMonth() + 1,
                total: c ? c.tasks + c.routines : 0,
                isWeekend: d.getDay() === 0 || d.getDay() === 6,
            });
        }
        return days;
    }, [viewMode, viewWeekStart, dayCounts]);

    const selectedDayLabel = useMemo(() => {
        const d = new Date(selectedDay + 'T00:00:00');
        return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
    }, [selectedDay]);

    return {
        today,
        viewMode,
        summaryLoading,
        periodStats,
        periodLabel,
        selectedDay,
        setSelectedDay,
        detailLoading,
        dayTasks,
        calCells,
        weekDays,
        selectedDayLabel,
        switchViewMode,
        navigatePrev,
        navigateNext,
        goToToday,
    };
}
