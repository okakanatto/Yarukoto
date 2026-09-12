'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarDays, ChevronDown, ChevronRight, Clock3, Flag } from 'lucide-react';
import styles from './WorkSignals.module.css';

/** These signals always use the complete active input, independently of list filters. */
export function collectWorkSignals(tasks, today = new Date().toLocaleDateString('sv-SE'), projects = []) {
    const horizon = new Date(`${today}T12:00:00`);
    horizon.setDate(horizon.getDate() + 7);
    const through = horizon.toLocaleDateString('sv-SE');
    const active = tasks.filter(task => !task.archived_at && ![3, 5].includes(Number(task.status_code)));
    const deadlines = [...active, ...projects.filter(project => !project.archived_at && project.due_date).map(project => ({ ...project, title: project.name, is_project: true }))];
    const byDate = field => (a, b) => (a[field] || '').localeCompare(b[field] || '') || Number(a.id) - Number(b.id);
    return [
        { key: 'overdue', label: '期限超過', tone: 'danger', tasks: deadlines.filter(task => task.due_date && task.due_date < today).sort(byDate('due_date')) },
        { key: 'due', label: '期限 7日以内', tone: 'warning', tasks: deadlines.filter(task => task.due_date && task.due_date >= today && task.due_date <= through).sort(byDate('due_date')) },
        { key: 'review', label: '確認日到来', tone: 'warning', tasks: active.filter(task => task.review_date && task.review_date <= today).sort(byDate('review_date')) },
        { key: 'waiting', label: '待ち・保留／確認日なし', tone: 'neutral', tasks: active.filter(task => (task.waiting_on?.trim() || Number(task.status_code) === 4) && !task.review_date) },
        { key: 'important', label: '重要／日付なし', tone: 'neutral', tasks: active.filter(task => Number(task.importance_level) >= 3 && !task.due_date && !task.today_date && !task.review_date) },
    ].filter(group => group.tasks.length);
}

const icons = { overdue: AlertCircle, due: CalendarDays, review: Clock3, waiting: Clock3, important: Flag };

export default function WorkSignals({ tasks = [], projects = [], onOpenTask, onOpenProject }) {
    const [today, setToday] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const [expanded, setExpanded] = useState(null);
    useEffect(() => {
        const interval = setInterval(() => setToday(new Date().toLocaleDateString('sv-SE')), 60000);
        return () => clearInterval(interval);
    }, []);
    const groups = useMemo(() => collectWorkSignals(tasks, today, projects), [tasks, today, projects]);
    const projectNames = useMemo(() => new Map(projects.map(project => [String(project.id), project.name])), [projects]);
    const openedGroup = groups.find(group => group.key === expanded);
    const urgent = groups.find(group => group.key === 'overdue') || groups.find(group => group.key === 'review');
    const preview = !openedGroup && urgent ? urgent.tasks.slice(0, 2) : [];
    if (!groups.length) return null;

    function renderRow(task, kind) {
        const projectName = !task.is_project && (task.project_name || projectNames.get(String(task.project_id)));
        const dateText = kind === 'review' ? `確認日 ${task.review_date}` : task.due_date ? `期限 ${task.due_date}` : kind === 'important' ? '期限・予定・確認日なし' : '確認日なし';
        const contents = <>
                <span className={styles.title}>{task.is_project && 'プロジェクト · '}{task.title}</span>
                <span className={styles.meta}>{dateText}{task.waiting_on ? ` · ${task.waiting_on}` : Number(task.status_code) === 4 ? ' · 保留' : ''}{task.parent_title && ` · ${task.parent_title}`}</span>
                <ChevronRight size={14} aria-hidden="true" />
            </>;
        return <li key={`${kind}-${task.is_project ? 'project' : 'task'}-${task.id}`} className={styles.row}>
            {task.is_project && !onOpenProject ? <Link className={styles.taskButton} href={`/projects?id=${task.id}`}>{contents}</Link> : <button type="button" className={styles.taskButton} onClick={() => task.is_project ? onOpenProject(task.id) : onOpenTask?.(task.id)}>{contents}</button>}
            {projectName && (onOpenProject ? <button className={styles.project} type="button" onClick={() => onOpenProject(task.project_id)}>{projectName}</button> : <span className={styles.projectLabel}>{projectName}</span>)}
        </li>;
    }

    return <section className={styles.signals} aria-label="要確認">
        <div className={styles.heading}><span>要確認</span></div>
        <div className={styles.groups}>{groups.map(group => {
            const Icon = icons[group.key];
            const opened = group.key === expanded;
            return <button key={group.key} type="button" className={`${styles.group} ${styles[group.tone]}`} aria-expanded={opened} onClick={() => setExpanded(opened ? null : group.key)}>
                <Icon size={14} aria-hidden="true" /><span>{group.label}</span><strong>{group.tasks.length}</strong><ChevronDown size={13} className={opened ? styles.rotated : ''} aria-hidden="true" />
            </button>;
        })}</div>
        {openedGroup && <div className={styles.expanded}><ul aria-label={`${openedGroup.label} 全${openedGroup.tasks.length}件`}>{openedGroup.tasks.map(task => renderRow(task, openedGroup.key))}</ul></div>}
        {!openedGroup && preview.length > 0 && <div className={styles.preview}><ul>{preview.map(task => renderRow(task, urgent.key))}</ul>{urgent.tasks.length > preview.length && <button type="button" className={styles.showAll} onClick={() => setExpanded(urgent.key)}>全{urgent.tasks.length}件を表示（残り{urgent.tasks.length - preview.length}件）<ChevronDown size={13} /></button>}</div>}
    </section>;
}
