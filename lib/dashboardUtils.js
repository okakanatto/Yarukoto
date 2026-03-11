/**
 * Velocity text generation for dashboard.
 * Compares this week's completion count against the median of prior weeks.
 */

/**
 * @param {number} thisWeek - This week's completed count
 * @param {number[]} priorWeeks - Prior 4 weeks' completed counts (at same day-of-week)
 * @param {Array<{label: string, completed: number, created: number}>} chartWeeks - 8 weeks of chart data
 * @param {{month: {completed: number}, today: {completed: number}}} summary
 * @returns {string|null}
 */
export function computeVelocityText(thisWeek, priorWeeks, chartWeeks, summary) {
    // Need at least 2 weeks with activity
    const validPrior = priorWeeks.filter(c => c > 0);
    if (validPrior.length < 2) return null;

    const sorted = [...priorWeeks].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    // Special: best in 8 weeks
    const allWeeklyCompleted = chartWeeks.map(w => w.completed);
    const maxEver = Math.max(...allWeeklyCompleted.slice(0, 7)); // exclude current week (incomplete)
    if (thisWeek > maxEver && thisWeek > 0) {
        return '今週は8週間でいちばんのペースです';
    }

    // Special: 3 consecutive weeks above median
    if (chartWeeks.length >= 8 && median > 0) {
        const recent3 = [chartWeeks[5].completed, chartWeeks[6].completed, chartWeeks[7].completed];
        if (recent3.every(c => c >= median)) {
            return '3週連続で調子がいいです';
        }
    }

    // Special: today 3+ completed
    if (summary.today.completed >= 3) {
        return '今日の勢いがあります';
    }

    // Compare to median
    if (median === 0) {
        if (thisWeek > 0) return 'いい流れです';
        return null;
    }

    const ratio = thisWeek / median;

    if (ratio >= 1.3) {
        const msgs = ['いい流れです', '今週は調子が出ています', '勢いがあります'];
        return msgs[Math.floor(Math.random() * msgs.length)];
    }

    if (ratio >= 0.7) {
        const msgs = ['安定したペースです', 'ちゃんと動けています'];
        return msgs[Math.floor(Math.random() * msgs.length)];
    }

    // Low pace: show positive monthly info instead
    if (summary.month.completed > 0) {
        return `今月は${summary.month.completed}件完了しています`;
    }

    return null;
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
 * Generate natural language summary for rhythm data.
 * Only mentions strong days; never mentions weak days.
 * @param {Array<{day: string, rate: number}>} rhythmData
 * @returns {string|null}
 */
export function generateRhythmSummary(rhythmData) {
    const strongDays = rhythmData.filter(d => d.rate >= 0.5);
    if (strongDays.length === 0) return null;

    const sorted = [...strongDays].sort((a, b) => b.rate - a.rate);
    const top = sorted.slice(0, 3);
    const names = top.map(d => d.day);
    return `${names.join('・')}に進みやすい傾向`;
}
