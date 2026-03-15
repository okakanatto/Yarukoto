import { fetchDb } from '@/lib/utils';
import { computeVelocityText, buildHeatmapData, computeRhythmData } from '@/lib/dashboardUtils';

export async function loadDashboard() {
    const db = await fetchDb();
    const today = new Date().toLocaleDateString('sv-SE');

    // Get the start of the current week (Monday)
    const nowDate = new Date();
    const dow = nowDate.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const weekStart = new Date(nowDate);
    weekStart.setDate(weekStart.getDate() + mondayOffset);
    const weekStartStr = weekStart.toLocaleDateString('sv-SE');

    // Get the start of the current month
    const monthStart = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-01`;

    // --- Summary: completed & created counts for month/week/today ---
    const summaryRows = await db.select(`
        SELECT
            SUM(CASE WHEN date(completed_at) >= $1 THEN 1 ELSE 0 END) as month_completed,
            SUM(CASE WHEN date(created_at) >= $2 THEN 1 ELSE 0 END) as month_created,
            SUM(CASE WHEN date(completed_at) >= $3 THEN 1 ELSE 0 END) as week_completed,
            SUM(CASE WHEN date(created_at) >= $4 THEN 1 ELSE 0 END) as week_created,
            SUM(CASE WHEN date(completed_at) = $5 THEN 1 ELSE 0 END) as today_completed,
            SUM(CASE WHEN date(created_at) = $6 THEN 1 ELSE 0 END) as today_created
        FROM tasks
        WHERE status_code != 5
    `, [monthStart, monthStart, weekStartStr, weekStartStr, today, today]);

    // Routine completions for summary
    const routineSummaryRows = await db.select(`
        SELECT
            SUM(CASE WHEN completion_date >= $1 THEN 1 ELSE 0 END) as month_completed,
            SUM(CASE WHEN completion_date >= $2 THEN 1 ELSE 0 END) as week_completed,
            SUM(CASE WHEN completion_date = $3 THEN 1 ELSE 0 END) as today_completed
        FROM routine_completions
    `, [monthStart, weekStartStr, today]);

    const s = summaryRows[0] || {};
    const rs = routineSummaryRows[0] || {};

    const summary = {
        month: { completed: (s.month_completed || 0) + (rs.month_completed || 0), created: s.month_created || 0 },
        week: { completed: (s.week_completed || 0) + (rs.week_completed || 0), created: s.week_created || 0 },
        today: { completed: (s.today_completed || 0) + (rs.today_completed || 0), created: s.today_created || 0 },
    };

    // --- Project breakdown ---
    const projectRows = await db.select(`
        SELECT
            p.id, p.name, p.color,
            SUM(CASE WHEN date(t.completed_at) >= $1 THEN 1 ELSE 0 END) as month_completed,
            SUM(CASE WHEN date(t.created_at) >= $2 THEN 1 ELSE 0 END) as month_created,
            SUM(CASE WHEN date(t.completed_at) >= $3 THEN 1 ELSE 0 END) as week_completed,
            SUM(CASE WHEN date(t.created_at) >= $4 THEN 1 ELSE 0 END) as week_created,
            SUM(CASE WHEN date(t.completed_at) = $5 THEN 1 ELSE 0 END) as today_completed,
            SUM(CASE WHEN date(t.created_at) = $6 THEN 1 ELSE 0 END) as today_created
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id AND t.status_code != 5
        WHERE p.archived_at IS NULL
        GROUP BY p.id
    `, [monthStart, monthStart, weekStartStr, weekStartStr, today, today]);

    // Sort by month activity (completed + created) descending, take top 5
    const projectsWithActivity = projectRows.map(p => ({
        ...p,
        monthActivity: (p.month_completed || 0) + (p.month_created || 0),
    })).filter(p => p.monthActivity > 0).sort((a, b) => b.monthActivity - a.monthActivity);

    const topProjects = projectsWithActivity.slice(0, 5);
    const otherProjects = projectsWithActivity.slice(5);

    let projects = topProjects.map(p => ({
        name: p.name,
        color: p.color,
        month: { completed: p.month_completed || 0, created: p.month_created || 0 },
        week: { completed: p.week_completed || 0, created: p.week_created || 0 },
        today: { completed: p.today_completed || 0, created: p.today_created || 0 },
    }));

    if (otherProjects.length > 0) {
        const other = { name: 'その他', color: '#9CA3AF', month: { completed: 0, created: 0 }, week: { completed: 0, created: 0 }, today: { completed: 0, created: 0 } };
        for (const p of otherProjects) {
            other.month.completed += p.month_completed || 0;
            other.month.created += p.month_created || 0;
            other.week.completed += p.week_completed || 0;
            other.week.created += p.week_created || 0;
            other.today.completed += p.today_completed || 0;
            other.today.created += p.today_created || 0;
        }
        projects.push(other);
    }

    // --- Weekly data for cumulative chart (8 weeks) ---
    // Calculate 8 weeks of Monday starts going back from current week
    const weeksData = [];
    for (let w = 7; w >= 0; w--) {
        const wkStart = new Date(weekStart);
        wkStart.setDate(wkStart.getDate() - w * 7);
        const wkEnd = new Date(wkStart);
        wkEnd.setDate(wkEnd.getDate() + 6);
        const wkStartStr = wkStart.toLocaleDateString('sv-SE');
        const wkEndStr = wkEnd.toLocaleDateString('sv-SE');
        const label = `${wkStart.getMonth() + 1}/${wkStart.getDate()}`;
        weeksData.push({ wkStartStr, wkEndStr, label });
    }

    const chartStart = weeksData[0].wkStartStr;
    const chartEnd = weeksData[weeksData.length - 1].wkEndStr;

    // Heatmap needs 90 days back; use the earlier of chartStart and 89 days ago
    const heatmapStart = new Date(nowDate);
    heatmapStart.setDate(heatmapStart.getDate() - 89);
    const heatmapStartStr = heatmapStart.toLocaleDateString('sv-SE');
    const dataStart = heatmapStartStr < chartStart ? heatmapStartStr : chartStart;

    // Batch query: daily completed tasks in the extended range
    const dailyCompletedRows = await db.select(`
        SELECT date(completed_at) as d, COUNT(*) as c
        FROM tasks
        WHERE status_code != 5 AND date(completed_at) >= $1 AND date(completed_at) <= $2
        GROUP BY date(completed_at)
    `, [dataStart, chartEnd]);

    const dailyCreatedRows = await db.select(`
        SELECT date(created_at) as d, COUNT(*) as c
        FROM tasks
        WHERE status_code != 5 AND date(created_at) >= $1 AND date(created_at) <= $2
        GROUP BY date(created_at)
    `, [dataStart, chartEnd]);

    const dailyRoutineCompRows = await db.select(`
        SELECT completion_date as d, COUNT(*) as c
        FROM routine_completions
        WHERE completion_date >= $1 AND completion_date <= $2
        GROUP BY completion_date
    `, [dataStart, chartEnd]);

    // Build day-level lookup
    const completedByDay = {};
    for (const r of dailyCompletedRows) { completedByDay[r.d] = (completedByDay[r.d] || 0) + r.c; }
    for (const r of dailyRoutineCompRows) { completedByDay[r.d] = (completedByDay[r.d] || 0) + r.c; }
    const createdByDay = {};
    for (const r of dailyCreatedRows) { createdByDay[r.d] = (createdByDay[r.d] || 0) + r.c; }

    // Aggregate into weekly buckets
    const chartWeeks = weeksData.map(wk => {
        let completed = 0, created = 0;
        const start = new Date(wk.wkStartStr + 'T00:00:00');
        for (let d = 0; d < 7; d++) {
            const dt = new Date(start);
            dt.setDate(dt.getDate() + d);
            const ds = dt.toLocaleDateString('sv-SE');
            if (ds > wk.wkEndStr) break;
            completed += completedByDay[ds] || 0;
            created += createdByDay[ds] || 0;
        }
        return { label: wk.label, completed, created };
    });

    // --- Velocity: compare this week vs median of prior 4 weeks same-day-count ---
    const currentDow = nowDate.getDay() === 0 ? 7 : nowDate.getDay();
    const thisWeekCompleted = summary.week.completed;

    // For prior 4 weeks, compute completed up to same day
    const priorWeekCompletions = [];
    for (let w = 1; w <= 4; w++) {
        const priorWkStart = new Date(weekStart);
        priorWkStart.setDate(priorWkStart.getDate() - w * 7);
        let count = 0;
        for (let d = 0; d < currentDow; d++) {
            const dt = new Date(priorWkStart);
            dt.setDate(dt.getDate() + d);
            const ds = dt.toLocaleDateString('sv-SE');
            count += completedByDay[ds] || 0;
        }
        priorWeekCompletions.push(count);
    }

    // Compute velocity text
    const velocity = computeVelocityText(thisWeekCompleted, priorWeekCompletions, chartWeeks, summary);

    // --- Heatmap: 90-day footprint data ---
    const heatmap = buildHeatmapData(completedByDay, createdByDay, nowDate);

    // --- Rhythm: day-of-week activity rates (10 weeks) ---
    const rhythm = computeRhythmData(completedByDay, createdByDay, nowDate);

    // --- Basecamp: first in-progress task ---
    const basecampRows = await db.select(`
        SELECT id, title FROM tasks
        WHERE status_code = 2 AND archived_at IS NULL
        ORDER BY sort_order ASC, id ASC
        LIMIT 1
    `);
    const basecampTask = basecampRows.length > 0 ? basecampRows[0] : null;

    return { summary, projects, chartWeeks, velocity, heatmap, rhythm, basecampTask };
}
