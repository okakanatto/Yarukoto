import { isWaiting, workViews } from '@/lib/workViews';

/** An explicit, inspectable shortlist. Selection never reschedules any work. */
export function workChoices(tasks, todayTasks, today, previousId) {
    const groups = workViews(tasks, todayTasks);
    const active = tasks.filter(task => !task.archived_at && ![3, 5].includes(Number(task.status_code)));
    const canStart = task => !isWaiting(task) && (!task.start_date || task.start_date <= today) && (!task.today_date || task.today_date <= today);
    const ready = active.filter(canStart);
    const choices = new Map();
    function add(task, reason) { if (task && !choices.has(task.id)) choices.set(task.id, { task, reason }); }
    ready.filter(task => task.due_date && task.due_date <= today)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id)
        .forEach(task => add(task, task.due_date === today ? '今日が期限' : '期限を確認'));
    const working = groups.working.filter(canStart);
    const remembered = working.find(task => task.id === Number(previousId));
    if (remembered && (!working[0]?.work_started_at || (remembered.work_started_at || '') >= working[0].work_started_at)) add(remembered, '続きから');
    working.forEach(task => add(task, '続きから'));
    groups.today.filter(canStart).forEach(task => add(task, task.is_routine ? '今日のルーティン' : '今日に選んだ仕事'));
    ready.filter(task => task.due_date && task.due_date > today)
        .sort((a, b) => a.due_date.localeCompare(b.due_date)).forEach(task => add(task, '期限のある仕事'));
    ready.filter(task => Number(task.importance_level) >= 3).forEach(task => add(task, '重要な仕事'));
    ready.filter(task => task.next_step || task.next_task_id).forEach(task => add(task, '次の一歩あり'));
    // Unknown work remains reachable. An older record is not deemed unimportant.
    [...ready].sort((a, b) => (a.last_opened_at || a.created_at || '').localeCompare(b.last_opened_at || b.created_at || '') || a.id - b.id)
        .forEach(task => add(task, '記録から選ぶ'));
    return [...choices.values()];
}

export function recordsToRevisit(tasks, today = new Date().toLocaleDateString('sv-SE')) {
    return tasks.filter(task => !task.archived_at && ![2, 3, 5].includes(Number(task.status_code)) && !isWaiting(task)
        && (!task.start_date || task.start_date <= today) && (!task.today_date || task.today_date <= today))
        .sort((a, b) => (a.last_opened_at || a.created_at || '').localeCompare(b.last_opened_at || b.created_at || '') || a.id - b.id);
}
