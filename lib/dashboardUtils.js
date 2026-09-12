/**
 * Factual completion-count comparison for the dashboard.
 * Compares this week's completion count against the median of prior weeks.
 */

/**
 * @param {number} thisWeek - This week's completed count
 * @param {number[]} priorWeeks - Prior 4 weeks' completed counts (at same day-of-week)
 * @returns {string|null}
 */
export function computeVelocityText(thisWeek, priorWeeks) {
    // Need at least 2 weeks with activity
    const validPrior = priorWeeks.filter(c => c > 0);
    if (validPrior.length < 2) return null;

    const sorted = [...priorWeeks].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    const difference = thisWeek - median;
    return `完了件数：直近4週の同曜日までの中央値比 ${difference > 0 ? '+' : ''}${difference}件`;
}

/**
 * Build 90-day heatmap data from daily activity lookup.
 * @param {Object<string, number>} completedByDay - date string -> completed count
 * @param {Object<string, number>} createdByDay - date string -> created count
 * @param {Date} today - reference date
 * @returns {{ days: Array<{dateStr: string, total: number, completed: number, dow: number, isToday: boolean, isFuture: boolean}>, activeDays: number, totalCompleted: number }}
 */
export function buildHeatmapData(completedByDay, createdByDay, today) {
    const todayStr = today.toLocaleDateString('sv-SE');
    const days = [];

    // 89 days ago through today
    for (let i = 89; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const ds = d.toLocaleDateString('sv-SE');
        const completed = completedByDay[ds] || 0;
        const created = createdByDay[ds] || 0;
        days.push({
            dateStr: ds,
            total: completed + created,
            completed,
            dow: d.getDay(),
            isToday: ds === todayStr,
            isFuture: false,
        });
    }

    // Fill remaining days in current week (future)
    for (let i = 1; i <= 6; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        if (d.getDay() === 0) break; // stop before next Sunday (groupIntoWeeks boundary)
        days.push({
            dateStr: d.toLocaleDateString('sv-SE'),
            total: 0,
            completed: 0,
            dow: d.getDay(),
            isToday: false,
            isFuture: true,
        });
    }

    const pastDays = days.filter(d => !d.isFuture);
    const activeDays = pastDays.filter(d => d.total > 0).length;
    const totalCompleted = pastDays.reduce((s, d) => s + d.completed, 0);

    return { days, activeDays, totalCompleted };
}

/**
 * Compute quartile thresholds for heatmap color levels.
 * @param {Array<{total: number, isFuture: boolean}>} days
 * @returns {[number, number]} [q1, q3]
 */
export function heatmapQuartiles(days) {
    const nonZero = days.filter(d => !d.isFuture && d.total > 0).map(d => d.total).sort((a, b) => a - b);
    if (nonZero.length < 4) return [1, 3];
    return [nonZero[Math.floor(nonZero.length * 0.25)], nonZero[Math.floor(nonZero.length * 0.75)]];
}

/**
 * Get heat level (0-3) for a value based on quartiles.
 * @param {number} value
 * @param {number} q1
 * @param {number} q3
 * @returns {number}
 */
export function heatLevel(value, q1, q3) {
    if (value === 0) return 0;
    if (value <= q1) return 1;
    if (value <= q3) return 2;
    return 3;
}

/**
 * Group heatmap days into weeks (Sunday-start columns).
 * @param {Array} days
 * @returns {Array<Array>} weeks
 */
export function groupIntoWeeks(days) {
    const weeks = [];
    let current = [];
    for (const day of days) {
        if (day.dow === 0 && current.length > 0) {
            weeks.push(current);
            current = [];
        }
        current.push(day);
    }
    if (current.length > 0) weeks.push(current);
    return weeks;
}

/**
 * Compute rhythm data: for each day of week (Mon-Sun),
 * the proportion of the last 10 weeks with any activity on that day.
 * @param {Object<string, number>} completedByDay
 * @param {Object<string, number>} createdByDay
 * @param {Date} today
 * @returns {Array<{day: string, rate: number}>}
 */
export function computeRhythmData(completedByDay, createdByDay, today) {
    const todayStr = today.toLocaleDateString('sv-SE');
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(currentWeekStart.getDate() + mondayOffset);

    // Mon(0)..Sun(6) in rhythm index
    const activeWeeks = [0, 0, 0, 0, 0, 0, 0];
    const totalWeeks = [0, 0, 0, 0, 0, 0, 0];

    for (let w = 0; w < 10; w++) {
        const weekStart = new Date(currentWeekStart);
        weekStart.setDate(weekStart.getDate() - w * 7);

        for (let d = 0; d < 7; d++) {
            const dt = new Date(weekStart);
            dt.setDate(dt.getDate() + d);
            const ds = dt.toLocaleDateString('sv-SE');

            if (ds > todayStr) continue;

            totalWeeks[d]++;
            const activity = (completedByDay[ds] || 0) + (createdByDay[ds] || 0);
            if (activity > 0) activeWeeks[d]++;
        }
    }

    const dayNames = ['月', '火', '水', '木', '金', '土', '日'];
    return dayNames.map((name, i) => ({
        day: name,
        rate: totalWeeks[i] > 0 ? activeWeeks[i] / totalWeeks[i] : 0,
    }));
}

/**
 * Summarize observed recording frequency, without inferring work performance.
 * @param {Array<{day: string, rate: number}>} rhythmData
 * @returns {string|null}
 */
export function generateRhythmSummary(rhythmData) {
    const strongDays = rhythmData.filter(d => d.rate >= 0.5);
    if (strongDays.length === 0) return null;

    const sorted = [...strongDays].sort((a, b) => b.rate - a.rate);
    const top = sorted.slice(0, 3);
    const names = top.map(d => d.day);
    return `${names.join('・')}：半数以上の週で記録`;
}
