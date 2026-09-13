'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Plus, Search, X } from 'lucide-react';
import TaskInput from '@/components/TaskInput';
import WorkRow from '@/components/WorkRow';
import WorkDetailPanel from '@/components/WorkDetailPanel';
import WorkSignals from '@/components/WorkSignals';
import WorkLaunch from '@/components/WorkLaunch';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useTodayTasks } from '@/hooks/useTodayTasks';
import { useTaskActions } from '@/hooks/useTaskActions';
import { workViews } from '@/lib/workViews';
import { formatMin } from '@/lib/utils';
import { guardWorkNavigation } from '@/lib/workNavigation';

const FILTERS = { filterStatuses: [], filterTags: [], filterImportance: [], filterUrgency: [] };
const VIEWS = [['all', '未完了'], ['today', '今日'], ['working', '進行中'], ['open', '未着手'], ['waiting', '待ち']];

export default function WorkPage() {
    const router = useRouter();
    const params = useSearchParams();
    const workspace = useWorkspace();
    const [today, setToday] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const day = useTodayTasks(today, FILTERS);
    const [view, setView] = useState('today');
    const [browse, setBrowse] = useState(false);
    const [focused, setFocused] = useState(false);
    const [startRequested, setStartRequested] = useState(null);
    const [lastWorkedId, setLastWorkedId] = useState(null);
    const [search, setSearch] = useState('');
    const [capture, setCapture] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [limit, setLimit] = useState(50);
    const navigationRef = useRef(null);
    const startToken = useRef(0);
    const selectRequest = useRef(0);
    const navigationPromise = useRef(null);
    const groups = useMemo(() => workViews(workspace.tasks, day.tasks), [workspace.tasks, day.tasks]);
    const { reload: reloadWorkspace, setTasks: setWorkspaceTasks } = workspace;
    const { loadTasks: loadDay, setTasks: setDayTasks } = day;
    const reload = useCallback(() => { reloadWorkspace(); loadDay(today); }, [reloadWorkspace, loadDay, today]);
    const setTasks = useCallback(update => { setWorkspaceTasks(update); setDayTasks(update); }, [setWorkspaceTasks, setDayTasks]);
    const actions = useTaskActions({ setTasks, fetchTasks: reload, refresh: reload, getTasks: () => workspace.tasks });

    const selectTask = useCallback(async (id, start = null) => {
        const request = ++selectRequest.current;
        if (!navigationPromise.current) {
            navigationPromise.current = Promise.resolve().then(() => navigationRef.current ? navigationRef.current() : true)
                .finally(() => { navigationPromise.current = null; });
        }
        if (!await navigationPromise.current) return;
        if (request !== selectRequest.current) return;
        setSelectedId(id);
        setStartRequested(start ? { token: ++startToken.current, minutes: start.minutes, openReference: !!start.openReference, help: !!start.help } : null);
        if (id) setCapture(false);
        // Viewing another task must not replace the actual work to return to.
    }, []);
    useEffect(() => {
        const id = Number(params.get('task'));
        if (!Number.isInteger(id) || id <= 0) return;
        const timer = setTimeout(() => selectTask(id, params.get('start') === '1' ? {} : null), 0);
        return () => clearTimeout(timer);
    }, [params, selectTask]);
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
        const timer = setTimeout(() => {
            try { setLastWorkedId(Number(localStorage.getItem('yarukoto:work-selection')) || null); } catch { /* DB work timestamps provide a fallback. */ }
        }, 0);
        return () => clearTimeout(timer);
    }, []);
    const rememberWork = useCallback(id => {
        setLastWorkedId(id);
        try { localStorage.setItem('yarukoto:work-selection', String(id)); } catch { /* Optional; DB work start is persisted. */ }
        reload();
    }, [reload]);
    const go = path => guardWorkNavigation(() => router.push(path));
    function changeView(value) { setView(value); setLimit(50); }
    const searchTasks = [...workspace.tasks, ...day.tasks.filter(task => task.is_routine)];
    const visible = search.trim() ? searchTasks.filter(task => [task.title, task.notes, task.next_step, task.capture_text, task.source_ref, task.project_name, task.work_log, task.waiting_on].some(value => value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))) : groups[view];
    const minutes = visible.reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0);
    const busy = workspace.loading || (view === 'today' && !search.trim() && day.loading);
    async function changeStatus(id, code) {
        const routine = day.tasks.find(task => task.id === id && task.is_routine);
        if (routine) await actions.handleRoutineStatusChange(id, code, { routineId: routine.routine_id, completionDate: today });
        else await actions.handleStatusChange(id, code);
    }

    return <div className={`desk launch-desk ${selectedId ? 'desk-has-selection' : ''} ${focused ? 'desk-focused' : ''} ${capture ? 'desk-capture-open' : ''}`}>
        <header className="desk-heading"><div><h1>いま</h1><time dateTime={today}>{new Date(`${today}T12:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</time></div><div className="desk-heading-actions"><button onClick={() => setCapture(value => !value)} aria-expanded={capture}><Plus size={18} />書き留める</button><Link href="/today"><CalendarDays size={17} />予定表</Link></div></header>
        <WorkSignals tasks={workspace.tasks} projects={workspace.projects} onOpenTask={selectTask} onOpenProject={id => go(`/projects?id=${id}`)} />
        {workspace.error && <div role="alert" className="work-error">{workspace.error}<button onClick={reload}>再読み込み</button></div>}
        {day.error && <div role="alert" className="work-error">{day.error}<button onClick={day.retry}>再読み込み</button></div>}
        <div className={`desk-panes ${!browse ? 'desk-home-panes' : ''}`}>
            <section className="desk-list" aria-label="仕事の一覧">
                <div className="desk-capture">
                    {capture && <><div className="desk-capture-top"><span>記録</span><button aria-label="記録欄を閉じる" onClick={() => setCapture(false)}><X size={18} /></button></div><TaskInput draftKey="global" autoFocus onTaskAdded={() => { reload(); changeView('open'); }} /></>}
                </div>
                {!browse ? <div className="desk-launch-scroll"><WorkLaunch tasks={workspace.tasks} todayTasks={day.tasks} today={today} previousId={lastWorkedId} loading={workspace.loading || day.loading} onOpen={selectTask} onStart={(id, minutes = null, openReference = false) => selectTask(id, { minutes, openReference })} onCapture={() => setCapture(true)} onBrowse={value => { setBrowse(true); changeView(value); }} /></div> : <>
                <button className="desk-back-home" onClick={() => setBrowse(false)}><ArrowLeft size={15} />いまに戻る</button>
                <div className="desk-tabs" role="tablist" aria-label="仕事の一覧">{VIEWS.map(([key, label]) => <button key={key} id={`desk-tab-${key}`} role="tab" aria-selected={view === key} aria-controls="desk-results" onClick={() => changeView(key)}>{label}<span>{groups[key].length}</span></button>)}</div>
                <div className="desk-list-tools"><label><Search size={15} /><span className="sr-only">仕事を検索</span><input value={search} onChange={event => { setSearch(event.target.value); setLimit(50); }} placeholder="仕事を検索" /></label>{search.trim() ? <span>全状態 · {visible.length}件</span> : minutes > 0 && <span title="見積を入力した仕事の合計">見積 {formatMin(minutes)}</span>}</div>
                <div className="desk-results" id="desk-results" role="tabpanel" aria-labelledby={`desk-tab-${view}`}>
                    {day.error && view === 'today' && !search.trim() ? null : busy ? <p className="desk-empty">読み込み中…</p> : visible.length ? <>{visible.slice(0, limit).map(task => <WorkRow key={task.id} task={task} selected={task.id === selectedId} onOpen={task.is_routine ? () => go('/routines') : selectTask} onStatus={changeStatus} onToday={task.is_routine ? undefined : actions.handleTodayToggle} disabled={actions.processingIds.has(task.id)} />)}{visible.length > limit && <button className="desk-more" onClick={() => setLimit(value => value + 50)}>残り {visible.length - limit}件を表示</button>}</> : <div className="desk-empty">{search ? '一致する仕事がありません' : ({ all: '未完了の仕事はありません', today: '今日の仕事はありません', working: '進行中の仕事はありません', open: '未着手の仕事はありません', waiting: '待ちの仕事はありません' }[view])}{view === 'today' && !search && <button onClick={() => changeView('open')}>仕事を選ぶ</button>}</div>}
                </div>
                </>}
                <footer className="desk-list-footer"><Link href="/tasks">すべてのタスク</Link><Link href="/done">完了した仕事</Link></footer>
            </section>
            {selectedId && <section className="desk-work" aria-label="選んだ仕事"><WorkDetailPanel embedded navigationRef={navigationRef} taskId={selectedId} startRequested={startRequested} onWorkStarted={rememberWork} onFocusChange={setFocused} onClose={() => selectTask(null)} onOpenTask={selectTask} onChanged={reload} /></section>}
        </div>
    </div>;
}
