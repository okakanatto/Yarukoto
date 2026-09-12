/** Risk checks use complete active data, independent from a screen's task filters. */
export function collectWorkSignals(tasks, today = new Date().toLocaleDateString('sv-SE'), projects = []) {
    const horizon = new Date(`${today}T12:00:00`);
    horizon.setDate(horizon.getDate() + 7);
    const through = horizon.toLocaleDateString('sv-SE');
    const active = tasks.filter(task => !task.archived_at && ![3, 5].includes(Number(task.status_code)));
    const activeProjectIds = new Set(active.map(task => Number(task.project_id)));
    const deadlines = [...active, ...projects.filter(project => !project.archived_at && project.due_date &&
        (!project.completed_at || Number(project.progress?.open) > 0 || activeProjectIds.has(Number(project.id))))
        .map(project => ({ ...project, title: project.name, is_project: true }))];
    const byDate = field => (a, b) => (a[field] || '').localeCompare(b[field] || '') || Number(a.id) - Number(b.id);
    return [
        { key: 'overdue', label: '期限超過', tone: 'danger', tasks: deadlines.filter(task => task.due_date && task.due_date < today).sort(byDate('due_date')) },
        { key: 'due', label: '期限 7日以内', tone: 'warning', tasks: deadlines.filter(task => task.due_date && task.due_date >= today && task.due_date <= through).sort(byDate('due_date')) },
        { key: 'review', label: '確認日到来', tone: 'warning', tasks: active.filter(task => task.review_date && task.review_date <= today).sort(byDate('review_date')) },
        { key: 'missed-plan', label: '未消化の予定', tone: 'neutral', tasks: active.filter(task => task.today_date && task.today_date < today).sort(byDate('today_date')) },
        { key: 'waiting', label: '待ち・保留／確認日なし', tone: 'neutral', tasks: active.filter(task => (task.waiting_on?.trim() || Number(task.status_code) === 4) && !task.review_date) },
        { key: 'important', label: '重要／日付なし', tone: 'neutral', tasks: active.filter(task => Number(task.importance_level) >= 3 && !task.due_date && !task.review_date && (!task.today_date || task.today_date < today)) },
    ].filter(group => group.tasks.length);
}
