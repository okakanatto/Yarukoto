/** Risk checks use complete active data, independent from a screen's task filters. */
export function collectWorkSignals(tasks, today = new Date().toLocaleDateString('sv-SE'), projects = []) {
    const horizon = new Date(`${today}T12:00:00`);
    horizon.setDate(horizon.getDate() + 7);
    const through = horizon.toLocaleDateString('sv-SE');
    const active = tasks.filter(task => !task.archived_at && ![3, 5].includes(Number(task.status_code)));
    const byId = new Map(tasks.map(task => [Number(task.id), task]));
    const openAncestorIds = new Set();
    for (const task of active) {
        const visited = new Set([Number(task.id)]);
        let parent = byId.get(Number(task.parent_id));
        while (parent && !visited.has(Number(parent.id))) {
            visited.add(Number(parent.id));
            openAncestorIds.add(Number(parent.id));
            parent = byId.get(Number(parent.parent_id));
        }
    }
    // Reopening a child must not hide the existing deadline on a completed
    // ancestor. Surface the mismatch without changing either task's status.
    const completedParents = tasks.filter(task => !task.archived_at && Number(task.status_code) === 3 && openAncestorIds.has(Number(task.id)));
    const activeProjectIds = new Set([...active, ...completedParents].map(task => Number(task.project_id)));
    const deadlines = [...active, ...completedParents, ...projects.filter(project => !project.archived_at && project.due_date &&
        (!project.completed_at || Number(project.progress?.open) > 0 || activeProjectIds.has(Number(project.id))))
        .map(project => ({ ...project, title: project.name, is_project: true }))];
    const byDate = field => (a, b) => (a[field] || '').localeCompare(b[field] || '') || Number(a.id) - Number(b.id);
    return [
        { key: 'overdue', label: '期限超過', tone: 'danger', tasks: deadlines.filter(task => task.due_date && task.due_date < today).sort(byDate('due_date')) },
        { key: 'due', label: '期限 7日以内', tone: 'warning', tasks: deadlines.filter(task => task.due_date && task.due_date >= today && task.due_date <= through).sort(byDate('due_date')) },
        { key: 'completed-parent', label: '完了した親に未完了あり', tone: 'warning', tasks: completedParents },
        { key: 'review', label: '確認日到来', tone: 'warning', tasks: active.filter(task => task.review_date && task.review_date <= today).sort(byDate('review_date')) },
        { key: 'missed-plan', label: '未消化の予定', tone: 'neutral', tasks: active.filter(task => task.today_date && task.today_date < today).sort(byDate('today_date')) },
        { key: 'waiting', label: '待ち・保留／確認日なし', tone: 'neutral', tasks: active.filter(task => (task.waiting_on?.trim() || Number(task.status_code) === 4) && !task.review_date) },
        { key: 'important', label: '重要／日付なし', tone: 'neutral', tasks: active.filter(task => Number(task.importance_level) >= 3 && !task.due_date && !task.review_date && (!task.today_date || task.today_date < today)) },
    ].filter(group => group.tasks.length);
}
