'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, FileText, Plus, Search, X } from 'lucide-react';
import TaskInput from '@/components/TaskInput';
import WorkRow from '@/components/WorkRow';
import WorkDetailPanel from '@/components/WorkDetailPanel';
import WorkSignals from '@/components/WorkSignals';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useTodayTasks } from '@/hooks/useTodayTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { workViews } from '@/lib/workViews';
import { formatMin } from '@/lib/utils';

const FILTERS = { filterStatuses: [], filterTags: [], filterImportance: [], filterUrgency: [] };
const VIEWS = [['today', '今日'], ['working', '進行中'], ['open', '未着手'], ['waiting', '待ち']];

export default function WorkPage() {
    const router = useRouter();
    const workspace = useWorkspace();
    const [today, setToday] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const day = useTodayTasks(today, FILTERS);
    const [view, setView] = useState('today');
    const [search, setSearch] = useState('');
    const [capture, setCapture] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [limit, setLimit] = useState(50);
    const navigationRef = useRef(null);
    const restoreRef = useRef(false);
    const selectRequest = useRef(0);
    const navigationPromise = useRef(null);
    const groups = useMemo(() => workViews(workspace.tasks, day.tasks), [workspace.tasks, day.tasks]);
    const { reload: reloadWorkspace, setTasks: setWorkspaceTasks } = workspace;
    const { loadTasks: loadDay, setTasks: setDayTasks } = day;
    const reload = useCallback(() => { reloadWorkspace(); loadDay(today); }, [reloadWorkspace, loadDay, today]);
    const setTasks = useCallback(update => { setWorkspaceTasks(update); setDayTasks(update); }, [setWorkspaceTasks, setDayTasks]);
    const actions = useTaskActions({ setTasks, fetchTasks: reload, refresh: reload, getTasks: () => workspace.tasks });

    const selectTask = useCallback(async id => {
        const request = ++selectRequest.current;
        if (!navigationPromise.current) {
            navigationPromise.current = Promise.resolve().then(() => navigationRef.current ? navigationRef.current() : true)
                .finally(() => { navigationPromise.current = null; });
        }
        if (!await navigationPromise.current) return;
        if (request !== selectRequest.current) return;
        setSelectedId(id);
        if (id) setCapture(false);
        // Closing the pane keeps the last work available for the next launch.
        try { if (id) localStorage.setItem('yarukoto:work-selection', String(id)); } catch { /* Optional selection; task data is saved separately. */ }
    }, []);
    useEffect(() => {
        const updateDate = () => setToday(new Date().toLocaleDateString('sv-SE'));
        const timer = setInterval(updateDate, 60000);
        const open = event => { if (Number(event.detail?.id)) selectTask(Number(event.detail.id)); };
        const capture = () => setCapture(true);
        window.addEventListener('focus', updateDate);
        window.addEventListener('yarukoto:openTask', open);
        window.addEventListener('yarukoto:openFab', capture);
        return () => { clearInterval(timer); window.removeEventListener('focus', updateDate); window.removeEventListener('yarukoto:openTask', open); window.removeEventListener('yarukoto:openFab', capture); };
    }, [selectTask]);
    useEffect(() => {
        if (workspace.loading || restoreRef.current) return;
        let previous;
        try { previous = Number(localStorage.getItem('yarukoto:work-selection')); } catch { /* Optional. */ }
        const candidate = groups.working.find(task => task.id === previous && (!task.today_date || task.today_date <= today));
        const timer = setTimeout(() => {
            restoreRef.current = true;
            if (candidate && selectRequest.current === 0) { setSelectedId(candidate.id); setView('working'); }
        }, 0);
        return () => clearTimeout(timer);
    }, [workspace.loading, groups.working, today]);
    function changeView(value) { setView(value); setSearch(''); setLimit(50); }
    const visible = groups[view].filter(task => !search || [task.title, task.notes, task.next_step, task.capture_text, task.source_ref, task.project_name].some(value => value?.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
    const minutes = visible.reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0);
    const busy = workspace.loading || (view === 'today' && day.loading);
    async function changeStatus(id, code) {
        const routine = day.tasks.find(task => task.id === id && task.is_routine);
        if (routine) await actions.handleRoutineStatusChange(id, code, { routineId: routine.routine_id, completionDate: today });
        else await actions.handleStatusChange(id, code);
    }

    return <div className={`desk ${selectedId ? 'desk-has-selection' : ''} ${capture ? 'desk-capture-open' : ''}`}>
        <header className="desk-heading"><div><h1>仕事</h1><time dateTime={today}>{new Date(`${today}T12:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</time></div><Link href="/today"><CalendarDays size={17} />予定表</Link></header>
        <WorkSignals tasks={workspace.tasks} projects={workspace.projects} onOpenTask={selectTask} onOpenProject={id => router.push(`/projects?id=${id}`)} />
        {workspace.error && <div role="alert" className="work-error">{workspace.error}<button onClick={reload}>再読み込み</button></div>}
        {day.error && <div role="alert" className="work-error">{day.error}<button onClick={day.retry}>再読み込み</button></div>}
        <div className="desk-panes">
            <section className="desk-list" aria-label="仕事の一覧">
                <div className="desk-capture">
                    {capture ? <><div className="desk-capture-top"><span>記録</span><button aria-label="記録欄を閉じる" onClick={() => setCapture(false)}><X size={18} /></button></div><TaskInput draftKey="global" autoFocus onTaskAdded={() => { reload(); changeView('open'); }} /></> : <button className="desk-capture-trigger" onClick={() => setCapture(true)}><Plus size={19} /><span>書き留める</span><kbd>Ctrl ⇧ K</kbd></button>}
                </div>
                <div className="desk-tabs" role="tablist" aria-label="仕事の一覧">{VIEWS.map(([key, label]) => <button key={key} id={`desk-tab-${key}`} role="tab" aria-selected={view === key} aria-controls="desk-results" onClick={() => changeView(key)}>{label}<span>{groups[key].length}</span></button>)}</div>
                <div className="desk-list-tools"><label><Search size={15} /><span className="sr-only">この一覧を検索</span><input value={search} onChange={event => { setSearch(event.target.value); setLimit(50); }} placeholder="検索" /></label>{minutes > 0 && <span title="見積を入力した仕事の合計">見積 {formatMin(minutes)}</span>}</div>
                <div className="desk-results" id="desk-results" role="tabpanel" aria-labelledby={`desk-tab-${view}`}>
                    {day.error && view === 'today' ? null : busy ? <p className="desk-empty">読み込み中…</p> : visible.length ? <>{visible.slice(0, limit).map(task => <WorkRow key={task.id} task={task} selected={task.id === selectedId} onOpen={task.is_routine ? () => router.push('/routines') : selectTask} onStatus={changeStatus} onToday={task.is_routine ? undefined : actions.handleTodayToggle} disabled={actions.processingIds.has(task.id)} />)}{visible.length > limit && <button className="desk-more" onClick={() => setLimit(value => value + 50)}>残り {visible.length - limit}件を表示</button>}</> : <div className="desk-empty">{search ? '一致する仕事がありません' : ({ today: '今日の仕事はありません', working: '進行中の仕事はありません', open: '未着手の仕事はありません', waiting: '待ちの仕事はありません' }[view])}{view === 'today' && !search && <button onClick={() => changeView('open')}>仕事を選ぶ</button>}</div>}
                </div>
                <footer className="desk-list-footer"><Link href="/tasks">すべてのタスク</Link><Link href="/done">完了した仕事</Link></footer>
            </section>
            <section className="desk-work" aria-label="選んだ仕事">
                {selectedId ? <WorkDetailPanel embedded navigationRef={navigationRef} taskId={selectedId} onClose={() => selectTask(null)} onOpenTask={selectTask} onChanged={reload} /> : <div className="desk-idle"><FileText size={32} strokeWidth={1} /><span>仕事を選ぶ</span></div>}
            </section>
        </div>
    </div>;
}
