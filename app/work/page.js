'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, FolderOpen } from 'lucide-react';
import TaskInput from '@/components/TaskInput';
import WorkRow from '@/components/WorkRow';
import WorkSignals from '@/components/WorkSignals';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useTaskActions } from '@/hooks/useTaskActions';

const VIEWS = [ ['resume', '続きから'], ['today', '今日'], ['capture', '未着手'], ['waiting', '待ち'] ];
const openTask = id => window.dispatchEvent(new CustomEvent('yarukoto:openTask', { detail: { id } }));

export default function WorkPage() {
    const router = useRouter();
    const { tasks, projects, loading, error, reload, setTasks } = useWorkspace();
    const [view, setView] = useState('resume');
    const [search, setSearch] = useState('');
    const [today, setToday] = useState(() => new Date().toLocaleDateString('sv-SE'));
    useEffect(() => {
        const updateDate = () => setToday(new Date().toLocaleDateString('sv-SE'));
        const timer = setInterval(updateDate, 60000);
        window.addEventListener('focus', updateDate);
        return () => { clearInterval(timer); window.removeEventListener('focus', updateDate); };
    }, []);
    const actions = useTaskActions({ setTasks, fetchTasks: reload, refresh: reload, getTasks: () => tasks });
    const groups = useMemo(() => {
        const active = tasks.filter(t => !t.archived_at && ![3, 5].includes(t.status_code));
        return {
            resume: active.filter(t => t.status_code === 2 || t.last_opened_at).sort((a, b) => (b.last_opened_at || '').localeCompare(a.last_opened_at || '')),
            today: active.filter(t => t.today_date === today),
            capture: active.filter(t => t.status_code === 1).sort((a, b) => b.id - a.id),
            waiting: active.filter(t => t.waiting_on || t.status_code === 4).sort((a, b) => (a.review_date || '9999').localeCompare(b.review_date || '9999')),
        };
    }, [tasks, today]);
    const visible = groups[view].filter(t => !search || [t.title, t.notes, t.capture_text, t.source_ref, t.project_name].some(v => v?.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
    return <div className="work-page">
        <header className="work-heading"><div><div className="work-eyebrow">{new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' })}</div><h1>いまの仕事</h1></div><Link href="/tasks" className="work-text-link">すべてのタスク <ArrowUpRight size={16} /></Link></header>
        <section className="work-capture" aria-label="仕事を記録"><TaskInput onTaskAdded={() => { reload(); setView('capture'); setSearch(''); }} /></section>
        {error && <div role="alert" className="work-error">{error}<button onClick={reload}>再読み込み</button></div>}
        {!loading && <WorkSignals tasks={tasks} projects={projects} onOpenTask={openTask} onOpenProject={id => router.push(`/projects?id=${id}`)} />}
        <div className="work-columns"><section className="work-board">
            <div className="work-tabs" role="tablist" aria-label="仕事の見方">{VIEWS.map(([key, label]) => <button id={`work-tab-${key}`} key={key} role="tab" aria-selected={view === key} aria-controls="work-results" onClick={() => setView(key)}>{label}<span>{groups[key].length}</span></button>)}</div>
            <div className="work-list-top"><label><span className="sr-only">この一覧を検索</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="検索" /></label></div>
            <div id="work-results" role="tabpanel" aria-labelledby={`work-tab-${view}`}>
                {loading ? <div className="work-empty">読み込み中…</div> : visible.length ? visible.map(task => <WorkRow key={task.id} task={task} onOpen={openTask} onStatus={actions.handleStatusChange} disabled={actions.processingIds.has(task.id)} />) : <div className="work-empty"><strong>{search ? '一致する仕事がありません' : ({ resume: '着手中の仕事はありません', today: '今日の予定はありません', capture: '未着手の仕事はありません', waiting: '待ちの仕事はありません' }[view])}</strong>{view === 'resume' && !search && <button className="work-button" onClick={() => setView('capture')}>未着手を見る <ArrowRight size={15} /></button>}</div>}
            </div>
            <div className="work-board-footer"><Link href="/today">今日の一覧 <ArrowRight size={14} /></Link><Link href="/done">やったタスク</Link></div>
        </section><aside className="work-projects"><div className="work-aside-title"><h2>プロジェクト</h2><Link href="/projects" aria-label="すべてのプロジェクトを見る"><ArrowUpRight size={17} /></Link></div>
            {projects.filter(p => !p.is_default).map(project => {
                const pending = tasks.filter(t => t.project_id === project.id && ![3, 5].includes(t.status_code));
                const due = pending.filter(t => t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
                return <Link href={`/projects?id=${project.id}`} className="work-project-link" key={project.id}><span className="work-project-icon" style={{ color: project.color }}><FolderOpen size={18} /></span><span><strong>{project.name}</strong>{project.outcome && <small>{project.outcome}</small>}<small>{project.due_date ? `プロジェクト期限 ${project.due_date}` : due ? `次のタスク期限 ${due.due_date}` : `未完了 ${pending.length}件`}</small></span><ArrowUpRight size={14} /></Link>;
            })}
            <Link className="work-text-link" href="/settings?tab=projects">プロジェクト設定 <ArrowRight size={14} /></Link>
        </aside></div>
    </div>;
}
