export function isWaiting(task) {
    return !!task.waiting_on?.trim() || Number(task.status_code) === 4;
}

export function workViews(tasks, todayTasks) {
    const active = tasks.filter(task => !task.archived_at && ![3, 5].includes(Number(task.status_code)));
    return {
        all: [...active, ...todayTasks.filter(task => task.is_routine && ![3, 5].includes(Number(task.status_code)))],
        today: todayTasks.filter(task => ![3, 5].includes(Number(task.status_code))),
        working: active.filter(task => Number(task.status_code) === 2 && !isWaiting(task))
            .sort((a, b) => (b.work_started_at || '').localeCompare(a.work_started_at || '') || b.id - a.id),
        open: active.filter(task => Number(task.status_code) !== 2 && !isWaiting(task)).sort((a, b) => b.id - a.id),
        waiting: active.filter(isWaiting).sort((a, b) => (a.review_date || '9999').localeCompare(b.review_date || '9999')),
    };
}
