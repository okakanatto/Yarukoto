export const WORK_REVIEW_KEY = 'yarukoto:work-review:v1';

// A review cursor is navigation state, never a task status or rescheduled date.
export const reviewToken = task => JSON.stringify([task.id, task.created_at, task.updated_at || '', task.status_code, task.due_date, task.review_date, task.today_date]);
export function readWorkReview() {
    try {
        const value = JSON.parse(localStorage.getItem(WORK_REVIEW_KEY) || 'null');
        if (value && Array.isArray(value.seen)) return { open: !!value.open, current: typeof value.current === 'string' ? value.current : null, seen: value.seen.filter(item => typeof item === 'string') };
    } catch { /* Optional navigation state; no task data is changed. */ }
    return { open: false, current: null, seen: [] };
}
export function writeWorkReview(value) {
    try { localStorage.setItem(WORK_REVIEW_KEY, JSON.stringify(value)); return true; }
    catch { return false; }
}
