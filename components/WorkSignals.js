'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronDown, ChevronRight, X } from 'lucide-react';
import { collectWorkSignals } from '@/lib/workSignals';
import { setTaskPlan, saveWorkContext } from '@/lib/workspace';
import styles from './WorkSignals.module.css';
export { collectWorkSignals } from '@/lib/workSignals';

const keyOf = task => `${task.is_project ? 'project' : 'task'}:${task.id}`;

export default function WorkSignals({ tasks = [], projects = [], onOpenTask, onOpenProject }) {
    const [today, setToday] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const [expanded, setExpanded] = useState(null);
    const [error, setError] = useState('');
    const [pending, setPending] = useState(null);
    const pendingRef = useRef(false);
    const dialogRef = useRef(null);
    useEffect(() => { if (expanded) dialogRef.current?.showModal?.(); }, [expanded]);
    useEffect(() => {
        const update = () => setToday(new Date().toLocaleDateString('sv-SE'));
        const interval = setInterval(update, 60000);
        window.addEventListener('focus', update);
        return () => { clearInterval(interval); window.removeEventListener('focus', update); };
    }, []);
    const groups = useMemo(() => collectWorkSignals(tasks, today, projects), [tasks, today, projects]);
    const entries = useMemo(() => {
        const unique = new Map();
        for (const group of groups) for (const task of group.tasks) {
            const key = keyOf(task);
            if (!unique.has(key)) unique.set(key, { task, reasons: [] });
            unique.get(key).reasons.push(group);
        }
        return [...unique.values()];
    }, [groups]);
    const visible = expanded === 'all' ? entries : entries.filter(entry => entry.reasons.some(group => group.key === expanded));
    if (!groups.length && !error) return null;
    async function plan(id, date, review = false) {
        if (pendingRef.current) return;
        pendingRef.current = true; setPending(id); setError('');
        try { if (review) await saveWorkContext(id, { review_date: date }); else await setTaskPlan(id, date); }
        catch (failure) { setError(failure.message || '予定を変更できませんでした。'); }
        finally { pendingRef.current = false; setPending(null); }
    }
    return <section className={styles.signals} aria-label="要確認">
        <div className={styles.bar}>
            <button className={styles.total} aria-expanded={expanded === 'all'} onClick={() => setExpanded(expanded === 'all' ? null : 'all')}><AlertCircle size={16} />確認 <strong>{entries.length}</strong><ChevronDown size={14} /></button>
            <div className={styles.groups}>{groups.map(group => <button key={group.key} className={`${styles.group} ${styles[group.tone]}`} aria-expanded={expanded === group.key} onClick={() => setExpanded(expanded === group.key ? null : group.key)}>{group.label}<strong>{group.tasks.length}</strong></button>)}</div>
        </div>
        <div className={styles.deadlinePeek}>{entries.filter(({ task, reasons }) => reasons.some(group => group.key === 'overdue' || group.key === 'due' && task.due_date === today)).slice(0, 1).map(({ task }) => task.is_project && !onOpenProject
            ? <Link key={keyOf(task)} href={`/projects?id=${task.id}`}><span>{task.title}</span><time>期限 {task.due_date}</time><ChevronRight size={13} /></Link>
            : <button key={keyOf(task)} onClick={() => task.is_project ? onOpenProject(task.id) : onOpenTask?.(task.id)}><span>{task.title}</span><time>期限 {task.due_date}</time><ChevronRight size={13} /></button>)}</div>
        {!expanded && error && <p role="alert" className={styles.error}>{error}</p>}
        {expanded && <dialog ref={dialogRef} className={styles.dialog} onClose={() => setExpanded(null)} onCancel={() => setExpanded(null)} aria-label="期限と待ちの確認"><header><h2>{expanded === 'all' ? '期限と待ち' : groups.find(group => group.key === expanded)?.label}</h2><button aria-label="確認を閉じる" onClick={() => setExpanded(null)}><X size={20} /></button></header>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.expanded}><ul aria-label="確認する仕事">{visible.map(({ task, reasons }) => {
            const title = <><span className={styles.title}>{task.is_project && 'プロジェクト · '}{task.title}</span><span className={styles.meta}>{task.due_date && `期限 ${task.due_date}`}{task.review_date && ` · 確認 ${task.review_date}`}{task.waiting_on && ` · ${task.waiting_on}`}{reasons.some(group => group.key === 'missed-plan') && ` · 予定 ${task.today_date}`}</span><span className={styles.reasons}>{reasons.map(reason => <span key={reason.key}>{reason.label}</span>)}</span><ChevronRight size={15} /></>;
            return <li key={keyOf(task)} className={styles.row}>
                {task.is_project && !onOpenProject ? <Link href={`/projects?id=${task.id}`} onClick={() => setExpanded(null)} className={styles.taskButton}>{title}</Link> : <button className={styles.taskButton} onClick={() => { setExpanded(null); if (task.is_project) onOpenProject(task.id); else onOpenTask?.(task.id); }}>{title}</button>}
                {!task.is_project && reasons.some(group => group.key === 'missed-plan') && <div className={styles.planActions}><button disabled={pending === task.id} onClick={() => plan(task.id, today)}>今日に</button><button disabled={pending === task.id} onClick={() => plan(task.id, null)}>予定を外す</button></div>}
                {!task.is_project && <label className={styles.reviewDate}>次の確認<input type="date" aria-label={`${task.title}の次の確認日`} value={task.review_date || ''} disabled={pending === task.id} onChange={event => plan(task.id, event.target.value || null, true)} /></label>}
            </li>;
        })}{visible.length === 0 && <li className={styles.empty}>確認する仕事はありません</li>}</ul></div></dialog>}
    </section>;
}
