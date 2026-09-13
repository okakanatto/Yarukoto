import { isWaiting, workViews } from '@/lib/workViews';
import { readWorkEntries } from '@/lib/workEntries';

export const REVISIT_STALE_DAYS = 7;

function activityAt(task) {
    return [task.created_at || '', task.work_started_at || '', ...readWorkEntries(task).map(entry => entry.created_at || '')]
        .reduce((latest, value) => value > latest ? value : latest, '');
}

function daysBefore(date, days) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - days);
    return value.toISOString().slice(0, 10);
}

/** An explicit, inspectable shortlist. Selection never reschedules any work. */
export function workChoices(tasks, todayTasks, today, previousId) {
    const groups = workViews(tasks, todayTasks);
    const active = tasks.filter(task => !task.archived_at && ![3, 5].includes(Number(task.status_code)));
    const byId = new Map(tasks.map(task => [Number(task.id), task]));
    const available = task => !isWaiting(task) && !task.archived_at && ![3, 5].includes(Number(task.status_code)) && (!task.start_date || task.start_date <= today) && (!task.today_date || task.today_date <= today);
    const canStart = task => available(task) && (!task.next_task_id || available(byId.get(Number(task.next_task_id)) || { status_code: 3 }));
    const ready = active.filter(canStart);
    const choices = new Map();
    function add(task, reason) { if (task && !choices.has(task.id)) choices.set(task.id, { task, reason: task.is_routine ? '今日のルーティン' : reason }); }
    const working = groups.working.filter(canStart);
    const remembered = working.find(task => task.id === Number(previousId));
    if (remembered && (!working[0]?.work_started_at || (remembered.work_started_at || '') >= working[0].work_started_at)) {
        working.splice(working.indexOf(remembered), 1);
        working.unshift(remembered);
    }
    const byDue = (a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id;
    const buckets = [
        [working, '続きから'],
        [ready.filter(task => task.due_date === today), '今日が期限'],
        [groups.today.filter(canStart), '今日に選んだ仕事'],
        [ready.filter(task => Number(task.importance_level) >= 3), '重要な仕事'],
        [recordsToRevisit(tasks, today).filter(task => Number(task.status_code) === 2 && canStart(task)), 'しばらく止まっている仕事'],
        [ready.filter(task => task.due_date && task.due_date < today).sort(byDue), '期限を確認'],
        [ready.filter(task => task.next_step || task.next_task_id), '次の行動あり'],
        [ready.filter(task => task.due_date && task.due_date > today).sort(byDue), '期限のある仕事'],
    ];
    // Offer different reasons for acting before filling the remainder of any one queue.
    for (const [items, reason] of buckets) add(items.find(task => !choices.has(task.id)), reason);
    for (const [items, reason] of buckets) items.forEach(task => add(task, task.is_routine ? '今日のルーティン' : reason));
    // Unknown work remains reachable. An older record is not deemed unimportant.
    [...ready].sort((a, b) => (a.last_opened_at || a.created_at || '').localeCompare(b.last_opened_at || b.created_at || '') || a.id - b.id)
        .forEach(task => add(task, '記録から選ぶ'));
    return [...choices.values()];
}

export function recordsToRevisit(tasks, today = new Date().toLocaleDateString('sv-SE')) {
    const staleBefore = daysBefore(today, REVISIT_STALE_DAYS);
    return tasks.filter(task => {
        const status = Number(task.status_code);
        if (task.archived_at || [3, 5].includes(status) || isWaiting(task)) return false;
        if ((task.start_date && task.start_date > today) || (task.today_date && task.today_date > today)) return false;
        return status !== 2 || activityAt(task).slice(0, 10) <= staleBefore;
    }).sort((a, b) => activityAt(a).localeCompare(activityAt(b)) || a.id - b.id);
}
