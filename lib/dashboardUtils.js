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
