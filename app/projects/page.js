'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowUpRight, CalendarDays, Check, Circle, FolderOpen, Play, RotateCcw } from 'lucide-react';
import TaskList from '@/components/TaskList';
import { useWorkspace } from '@/hooks/useWorkspace';
import { saveProjectContext, setProjectCompletion } from '@/lib/workspace';
import { useProjectDraft, readProjectDraft } from '@/hooks/useProjectDraft';
import styles from './projects.module.css';

const openTask = id => window.dispatchEvent(new CustomEvent('yarukoto:openTask', { detail: { id } }));
const isOpen = task => ![3, 5].includes(Number(task.status_code));
const hasOpenWork = task => isOpen(task) || Number(task.openDescendants) > 0;
const statusName = task => task.status_label || ({ 1: '未着手', 2: '着手中', 3: '完了', 4: '保留', 5: 'キャンセル' }[task.status_code]) || '未設定';
const projectViews = [['progress', '進行'], ['tasks', 'タスク']];

export default function ProjectPage() {
    return <Suspense fallback={<p>読み込み中…</p>}><ProjectPageInner /></Suspense>;
}

function ProjectPageInner() {
    const searchParams = useSearchParams();
    const projectId = Number(searchParams.get('id')) || null;
    const { tasks, projects, loading, error, reload } = useWorkspace();
    const project = projects.find(p => p.id === projectId);

    if (loading) return <p className="work-muted">読み込み中…</p>;
    if (error) return <p role="alert" className="work-error">{error}<button onClick={reload}>再読み込み</button></p>;
    if (projectId && !project) return <p className="work-muted">プロジェクトが見つかりません。<Link href="/projects">一覧へ</Link></p>;

    return <div className="work-page">
        <header className="work-heading"><div>{project && <Link className="work-text-link" href="/projects"><ArrowLeft size={14} />プロジェクト一覧</Link>}<h1>{project?.name || 'プロジェクト'}</h1></div><Link className="work-text-link" href="/settings?tab=projects">設定 <ArrowUpRight size={15} /></Link></header>
        {project ? <ProjectWorkspace key={project.id} project={project} tasks={tasks.filter(task => task.project_id === projectId)} reload={reload} />
            : <div className="project-grid">{projects.map(p => {
                const pending = tasks.filter(task => task.project_id === p.id && isOpen(task));
                const overdue = pending.filter(task => task.due_date && task.due_date < new Date().toLocaleDateString('sv-SE')).length;
                const progress = p.progress || {};
                return <Link key={p.id} href={`/projects?id=${p.id}`} className={`project-overview-card ${p.completed_at ? styles.completedProject : ''}`}>
                    <FolderOpen size={21} style={{ color: p.color }} /><h2>{p.name}</h2>{p.outcome && <p>{p.outcome}</p>}
                    <div className="work-row-meta">
                        {p.completed_at && <span><Check size={13} />完了 {p.completed_at.slice(0, 10)}</span>}
                        {(!p.completed_at || progress.open > 0) && <>
                            {p.due_date && <span><CalendarDays size={13} />期限 {p.due_date}</span>}
                            <span>{p.completed_at ? '完了後の未完了' : '未完了'} {progress.open ?? pending.length}件</span>
                            {progress.waiting > 0 && <span>待ち {progress.waiting}件</span>}
                            {overdue > 0 && <span className="work-overdue">期限超過 {overdue}件</span>}
                        </>}
                        {Object.keys(readProjectDraft(p.id)).length > 0 && <span>未保存の下書き</span>}
                    </div>
                </Link>;
            })}</div>}
    </div>;
}

function ProjectWorkspace({ project, tasks, reload }) {
    const [view, setView] = useState('progress');
    const milestones = project.milestones || tasks.filter(task => !task.parent_id);
    const ongoing = milestones.filter(hasOpenWork);
    const finished = milestones.filter(task => !hasOpenWork(task));
    return <>
        <ProjectContext project={project} onChanged={reload} />
        <div className={styles.tabs} role="tablist" aria-label="プロジェクトの見方">
            {projectViews.map(([key, label], index) => <button key={key} id={`project-tab-${key}`} role="tab" tabIndex={view === key ? 0 : -1} aria-selected={view === key} aria-controls="project-panel" onClick={() => setView(key)} onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? projectViews.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + projectViews.length) % projectViews.length;
                setView(projectViews[next][0]);
                document.getElementById(`project-tab-${projectViews[next][0]}`)?.focus();
            }}>{label}</button>)}
        </div>
        {view === 'progress' ? <section id="project-panel" role="tabpanel" aria-labelledby="project-tab-progress">
            <div className={project.recentEntries?.length ? styles.progressColumns : undefined}>
            <div>
            {milestones.length ? <>
                <h2 className={styles.sectionTitle}>主な仕事</h2>
                <MilestoneList tasks={ongoing} />
                {finished.length > 0 && <details className={styles.finishedWork} open={!ongoing.length || undefined}><summary>完了・キャンセル {finished.length}件</summary><MilestoneList tasks={finished} /></details>}
            </> : <div className={styles.empty}><FolderOpen size={24} /><p>まだ仕事がありません</p></div>}
            </div>
            <RecentEntries entries={project.recentEntries || []} />
            </div>
            <div className={styles.progressFooter}><ProjectProgress progress={project.progress} /><button className="work-button" onClick={() => setView('tasks')}>タスクを管理 <ArrowUpRight size={14} /></button></div>
        </section> : <section id="project-panel" role="tabpanel" aria-labelledby="project-tab-tasks">
            <div className={styles.taskList}><TaskList key={project.id} projectId={project.id} /></div>
        </section>}
    </>;
}

function RecentEntries({ entries }) {
    const visible = entries.map(entry => ({ ...entry, text: ['note', 'memo'].includes(entry.kind)
        ? (entry.result || '').trim()
        : (entry.result || entry.consumed_step || '').trim(),
    })).filter(entry => entry.text).slice(0, 6);
    if (!visible.length) return null;
    return <section className={styles.recentWork} aria-label="最近の記録">
        <h2 className={styles.sectionTitle}>最近の記録</h2>
        <ul className={styles.entries}>{visible.map((entry, index) => <li key={`${entry.task_id}-${entry.id || entry.created_at}-${index}`}>
            <button className={styles.entry} onClick={() => openTask(entry.task_id)}>
                <span className={styles.entryBody}>
                    <span className={styles.entryResult}>{entry.text}</span>
                    <span className={styles.entrySource}>{entry.task_title}<span className={styles.meta}>{['note', 'memo'].includes(entry.kind) ? '現在のメモ' : entry.kind === 'step' ? '一歩完了' : entry.kind === 'pause' ? '中断' : '記録'}{entry.created_at && ` · ${entry.created_at.slice(0, 10)}`}{entry.archived_at && ' · アーカイブ'}</span></span>
                </span>
                <ArrowUpRight size={15} className={styles.openIcon} aria-hidden="true" />
            </button>
        </li>)}</ul>
    </section>;
}

function MilestoneList({ tasks }) {
    if (!tasks.length) return null;
    return <ul className={styles.milestones}>{tasks.map(task => {
        const legacyNote = !Object.hasOwn(task, 'branchSummaries') && (task.notes || '').trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ');
        const inconsistent = !isOpen(task) && Number(task.openDescendants) > 0;
        const Icon = inconsistent ? AlertCircle : Number(task.status_code) === 3 ? Check : Number(task.status_code) === 2 ? Play : Circle;
        return <li key={task.id}><button className={styles.milestone} onClick={() => openTask(task.id)}>
            <Icon size={17} className={inconsistent ? styles.unfinishedIcon : Number(task.status_code) === 3 ? styles.finishedIcon : styles.taskIcon} aria-hidden="true" />
            <span className={styles.milestoneBody}><strong>{task.title}</strong>{legacyNote && <span className={styles.note}>{legacyNote}</span>}<BranchSummaries branches={task.branchSummaries || []} /><span className={styles.meta}>{statusName(task)}{task.due_date && ` · 期限 ${task.due_date}`}{task.completed_at && ` · ${task.completed_at.slice(0, 10)}`}{task.archived_at && ' · アーカイブ'}</span>{inconsistent && <span className={styles.unfinished}>配下に未完了 {task.openDescendants}件</span>}</span>
            <ArrowUpRight size={15} className={styles.openIcon} aria-hidden="true" />
        </button></li>;
    })}</ul>;
}

function BranchSummaries({ branches }) {
    const visible = branches.filter(branch => branch.latestResult || branch.waiting?.length || branch.nextSteps?.length);
    if (!visible.length) return null;
    return <span className={styles.branchSummaries}>{visible.map(branch => <span key={branch.task_id} className={styles.branchSummary}>
        {branches.length > 1 && <span className={styles.branchTitle}>{branch.task_title}</span>}
        {branch.latestResult && <span className={styles.branchLine}>結果: {branch.latestResult.result}<small>{branch.latestResult.task_title}{branch.latestResult.created_at && ` · ${branch.latestResult.created_at.slice(0, 10)}`}{branch.latestResult.archived_at && ' · アーカイブ'}</small></span>}
        {branch.waiting?.map(item => <span key={`waiting-${item.task_id}`} className={styles.branchLine}>待ち: {item.waiting_on}{item.review_date && ` · 確認 ${item.review_date}`}<small>{item.task_title}</small></span>)}
        {branch.nextSteps?.map(item => <span key={`next-${item.task_id}`} className={styles.branchLine}>次: {item.next_step}<small>{item.task_title}</small></span>)}
    </span>)}</span>;
}

function ProjectProgress({ progress }) {
    if (!progress) return null;
    return <div className={styles.counts} aria-label="タスク件数"><span>タスク {progress.completed} / {progress.total} 完了</span>{progress.inProgress > 0 && <span>着手中 {progress.inProgress}</span>}{progress.waiting > 0 && <span>待ち {progress.waiting}</span>}</div>;
}

function ProjectContext({ project, onChanged }) {
    const draft = useProjectDraft(project);
    const { outcome, dueDate, dirty, persisted } = draft;
    const [editing, setEditing] = useState(() => Object.keys(readProjectDraft(project.id)).length > 0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const handler = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);
    async function save(event) {
        event?.preventDefault();
        if (saving) return;
        setSaving(true); setError('');
        try { await saveProjectContext(project.id, draft.changes); draft.clear(); await onChanged(); setEditing(false); }
        catch (failure) { setError(`保存できませんでした。${failure.message}`); }
        finally { setSaving(false); }
    }
    async function changeCompletion() {
        if (saving) return;
        setSaving(true); setError('');
        try {
            // Save the edited outcome first. A failed save must not complete the project.
            if (dirty) { await saveProjectContext(project.id, draft.changes); draft.clear(); await onChanged(); }
            await setProjectCompletion(project.id, !project.completed_at);
            await onChanged();
            setEditing(false);
        } catch (failure) { setError(failure.message || '状態を変更できませんでした。'); }
        finally { setSaving(false); }
    }
    return <section className="project-context" aria-label="プロジェクトの成果と期限">
        <div className="project-context-summary"><div><small>成果</small><p>{project.outcome || '未設定'}</p><div className="work-row-meta">{project.due_date && <span><CalendarDays size={14} />期限 {project.due_date}</span>}{project.completed_at && <span className={styles.completeStatus}><Check size={14} />完了 {project.completed_at.slice(0, 10)}</span>}{project.completed_at && project.progress?.open > 0 && <span>完了後の未完了 {project.progress.open}件</span>}</div></div>
            <div className={styles.contextActions}><button className="work-button" disabled={saving} onClick={() => setEditing(!editing)}>{editing ? '閉じる' : dirty ? '下書きを再開' : '編集'}</button>
                {!project.is_default && <button className="work-button" disabled={saving} onClick={changeCompletion}>{project.completed_at ? <><RotateCcw size={14} />再開</> : <><Check size={14} />完了にする</>}</button>}
            </div>
        </div>
        {dirty && <p role="status" className="work-muted">未保存の変更{!persisted && '（終了前に保存してください）'}{draft.changes.due_date !== undefined && ' · 期限は未反映'}</p>}
        {error && <p role="alert" className="work-error">{error}</p>}
        {editing && <form className="project-context-form" onSubmit={save}>
            <label>成果<textarea rows={2} value={outcome} onChange={event => draft.update('outcome', event.target.value)} disabled={saving} /></label>
            <label>期限<input type="date" value={dueDate} onChange={event => draft.update('due_date', event.target.value)} disabled={saving} /></label>
            <div><button type="submit" className="work-button" disabled={saving || !dirty}>{saving ? '保存中…' : '保存する'}</button>{dirty && <button type="button" className="work-button" disabled={saving} onClick={() => { draft.clear(); setError(''); }}>下書きを破棄</button>}</div>
        </form>}
    </section>;
}
