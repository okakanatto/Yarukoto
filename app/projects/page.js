'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, CalendarDays, FolderOpen } from 'lucide-react';
import TaskInput from '@/components/TaskInput';
import TaskList from '@/components/TaskList';
import { useWorkspace } from '@/hooks/useWorkspace';
import { saveProjectContext } from '@/lib/workspace';
import { useProjectDraft, readProjectDraft } from '@/hooks/useProjectDraft';

export default function ProjectPage() {
    return <Suspense fallback={<p>読み込み中…</p>}><ProjectPageInner /></Suspense>;
}

function ProjectPageInner() {
    const searchParams = useSearchParams();
    const projectId = Number(searchParams.get('id')) || null;
    const { tasks, projects, loading, error, reload } = useWorkspace();
    const [refreshKey, setRefreshKey] = useState(0);
    const refresh = () => { reload(); setRefreshKey(k => k + 1); };
    const project = projects.find(p => p.id === projectId);

    if (loading) return <p className="work-muted">読み込み中…</p>;
    if (error) return <p role="alert" className="work-error">{error}<button onClick={reload}>再読み込み</button></p>;
    if (projectId && !project) return <p className="work-muted">プロジェクトが見つかりません。<Link href="/projects">一覧へ</Link></p>;

    return <div className="work-page">
        <header className="work-heading"><div>{project && <Link className="work-text-link" href="/projects"><ArrowLeft size={14} />プロジェクト一覧</Link>}<h1>{project?.name || 'プロジェクト'}</h1></div><Link className="work-text-link" href="/settings?tab=projects">設定 <ArrowUpRight size={15} /></Link></header>
        {project ? <>
            <ProjectContext key={project.id} project={project} onChanged={reload} />
            <ProjectProgress tasks={tasks.filter(t => t.project_id === projectId)} />
            <TaskInput key={project.id} onTaskAdded={refresh} defaultProjectId={projectId} />
            <div style={{ marginTop: 24 }}><TaskList key={`${projectId}-${refreshKey}`} projectId={projectId} /></div>
        </> : <div className="project-grid">{projects.map(p => {
            const pending = tasks.filter(t => t.project_id === p.id && ![3, 5].includes(t.status_code));
            const waiting = pending.filter(t => t.waiting_on || t.status_code === 4).length;
            const overdue = pending.filter(t => t.due_date && t.due_date < new Date().toLocaleDateString('sv-SE')).length;
            return <Link key={p.id} href={`/projects?id=${p.id}`} className="project-overview-card"><FolderOpen size={21} style={{ color: p.color }} /><h2>{p.name}</h2>{p.outcome && <p>{p.outcome}</p>}<div className="work-row-meta">{p.due_date && <span><CalendarDays size={13} />期限 {p.due_date}</span>}<span>未完了 {pending.length}件</span>{waiting > 0 && <span>待ち {waiting}件</span>}{overdue > 0 && <span className="work-overdue">期限超過 {overdue}件</span>}{Object.keys(readProjectDraft(p.id)).length > 0 && <span>未保存の下書き</span>}</div></Link>;
        })}</div>}
    </div>;
}

function ProjectProgress({ tasks }) {
    const open = tasks.filter(t => ![3, 5].includes(t.status_code));
    const roots = tasks.filter(t => !t.parent_id);
    return <div className="project-progress"><span>主な仕事 {roots.filter(t => t.status_code === 3).length} / {roots.length} 完了</span><span>着手中 {open.filter(t => t.status_code === 2).length}</span><span>待ち {open.filter(t => t.waiting_on || t.status_code === 4).length}</span></div>;
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
    return <section className="project-context" aria-label="プロジェクトの成果と期限">
        <div className="project-context-summary"><div><small>成果</small><p>{project.outcome || '未設定'}</p>{project.due_date && <span className="work-row-meta"><CalendarDays size={14} />期限 {project.due_date}</span>}</div><button className="work-button" disabled={saving} onClick={() => setEditing(!editing)}>{editing ? '閉じる' : dirty ? '下書きを再開' : '編集'}</button></div>
        {dirty && <p role="status" className="work-muted">未保存の変更{!persisted && '（終了前に保存してください）'}{draft.changes.due_date !== undefined && ' · 期限は未反映'}</p>}
        {error && <p role="alert" className="work-error">{error}</p>}
        {editing && <form className="project-context-form" onSubmit={save}>
            <label>成果<textarea rows={2} value={outcome} onChange={event => draft.update('outcome', event.target.value)} disabled={saving} /></label>
            <label>期限<input type="date" value={dueDate} onChange={event => draft.update('due_date', event.target.value)} disabled={saving} /></label>
            <div><button type="submit" className="work-button" disabled={saving || !dirty}>{saving ? '保存中…' : '保存する'}</button>{dirty && <button type="button" className="work-button" disabled={saving} onClick={() => { draft.clear(); setError(''); }}>下書きを破棄</button>}</div>
        </form>}
    </section>;
}
