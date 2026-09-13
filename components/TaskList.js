'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core';
import { Archive, ArrowRight, Columns3, ListFilter, Plus, Search, Undo2, X } from 'lucide-react';
import { useMasterData } from '@/hooks/useMasterData';
import { useFilterOptions } from '@/hooks/useFilterOptions';
import { useTaskActions } from '@/hooks/useTaskActions';
import { useTaskDnD } from '@/hooks/useTaskDnD';
import { fetchDb, parseTags, formatMin } from '@/lib/utils';
import { buildTaskListQuery } from '@/lib/taskListQueries';
import { ancestorPath } from '@/lib/taskHierarchy';
import { SORT_OPTIONS } from '@/lib/taskSorter';
import { tableRows, TABLE_COLUMNS, DEFAULT_TABLE_VIEW, restoreTableView } from '@/lib/taskTable';
import { editTableTasks, undoTableEdit } from '@/lib/taskTableActions';
import { guardWorkNavigation } from '@/lib/workNavigation';
import TaskTableRow, { TableDropGap } from './TaskTableRow';
import WorkDetailPanel from './WorkDetailPanel';
import TaskInput from './TaskInput';
import MultiSelectFilter from './MultiSelectFilter';
import styles from './TaskTable.module.css';

const EMPTY_FILTERS = { filterStatuses: [], filterTags: [], filterImportance: [], filterUrgency: [], filterProjects: [] };
const FILTER_KEYS = ['statuses', 'tags', 'importance', 'urgency', 'projects'];
export default function TaskList({ projectId = null, fullPage = false }) {
    const router = useRouter();
    const [tasks, setTasks] = useState([]), [view, setView] = useState(DEFAULT_TABLE_VIEW);
    const [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
    const [archived, setArchived] = useState(false), [selected, setSelected] = useState([]), [editingId, setEditingId] = useState(null);
    const [capture, setCapture] = useState(null), [focused, setFocused] = useState(false), [pending, setPending] = useState(false), [undo, setUndo] = useState(null);
    const [bulkField, setBulkField] = useState('status_code'), [bulkValue, setBulkValue] = useState('');
    const [savedViews, setSavedViews] = useState([]), [viewName, setViewName] = useState('');
    const navigation = useRef(null), request = useRef(0), busy = useRef(false), scroll = useRef(null), pendingScroll = useRef(null), captureRef = useRef(null);
    const storageKey = `yarukoto:table:v1:${projectId || 'all'}`;
    const { masters, tags, projects } = useMasterData();
    const statuses = useMemo(() => masters.status || [], [masters.status]);
    const importance = useMemo(() => masters.importance || [], [masters.importance]);
    const urgency = useMemo(() => masters.urgency || [], [masters.urgency]);
    const filters = useFilterOptions(statuses, tags, importance, urgency, projects);
    useEffect(() => {
        let active = true;
        Promise.resolve().then(() => {
            if (!active) return;
            try {
                const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
                setView(restoreTableView(saved?.view));
                setSavedViews(Array.isArray(saved?.savedViews) ? saved.savedViews.filter(item => typeof item.name === 'string').map(item => ({ name: item.name, view: restoreTableView(item.view) })) : []);
                pendingScroll.current = saved?.scroll || 0;
            } catch { /* Preferences are optional. */ }
            setReady(true);
        });
        return () => { active = false; };
    }, [storageKey]);
    const persist = useCallback(() => {
        if (!ready) return;
        try { localStorage.setItem(storageKey, JSON.stringify({ view, savedViews, scroll: scroll.current?.scrollTop || 0 })); } catch { /* Core operations do not require localStorage. */ }
    }, [ready, storageKey, view, savedViews]);
    useEffect(() => { persist(); }, [persist]);
    const reload = useCallback(async () => {
        const current = ++request.current; setLoading(true);
        try {
            const db = await fetchDb();
            const query = buildTaskListQuery({ ...EMPTY_FILTERS, showArchived: archived, projectId });
            const rows = await db.select(query.sql, query.params);
            const graph = await db.select('SELECT id, title, parent_id FROM tasks');
            if (current !== request.current) return;
            setTasks(rows.map(task => ({ ...task, tags: parseTags(task), ancestors: ancestorPath(graph, task.id) })));
            setError('');
        } catch (failure) { if (current === request.current) setError(failure.message || 'タスクを読み込めませんでした'); }
        finally { if (current === request.current) setLoading(false); }
    }, [projectId, archived]);
    useEffect(() => {
        const counter = request;
        reload();
        window.addEventListener('yarukoto:tasksChanged', reload); window.addEventListener('yarukoto:taskAdded', reload);
        return () => { counter.current++; window.removeEventListener('yarukoto:tasksChanged', reload); window.removeEventListener('yarukoto:taskAdded', reload); };
    }, [reload]);
    useEffect(() => { if (!loading && ready && pendingScroll.current != null && scroll.current) { scroll.current.scrollTop = pendingScroll.current; pendingScroll.current = null; } }, [loading, ready]);
    const data = useMemo(() => tableRows(tasks, view, statuses), [tasks, view, statuses]);
    const visibleIds = data.rows.filter(row => row.task && !row.contextOnly).map(row => row.task.id);
    const actualSelected = selected.filter(id => data.matches.has(id));
    const estimate = tasks.filter(task => data.matches.has(task.id)).reduce((sum, task) => sum + (Number(task.estimated_hours) || 0), 0);
    const actions = useTaskActions({ setTasks, fetchTasks: reload, refresh: reload, getTasks: () => tasks });
    const getChildren = useCallback(id => tasks.filter(task => task.parent_id === id).sort((a, b) => a.sort_order - b.sort_order), [tasks]);
    const roots = data.rows.filter(row => row.task && row.depth === 0).map(row => row.task);
    const dnd = useTaskDnD({ tasks, setTasks, fetchTasks: reload, sortMode: view.sort === 'manual' ? 'manual' : 'auto', getSortedParentTasks: () => roots, getChildTasks: getChildren });
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
    const dragEnabled = !archived && view.group === 'tree' && !view.search.trim() && !FILTER_KEYS.some(key => view[key].length) && !pending;
    const patchView = patch => { setView(current => ({ ...current, ...((Object.hasOwn(patch, 'search') || FILTER_KEYS.some(key => Object.hasOwn(patch, key))) ? { collapsed: [] } : {}), ...patch })); setSelected([]); };
    useEffect(() => {
        if (!capture) return;
        const previous = document.activeElement;
        const handle = event => {
            if (event.key === 'Escape') { event.preventDefault(); setCapture(null); }
            if (event.key !== 'Tab') return;
            const nodes = [...(captureRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') || [])].filter(node => node.getClientRects().length);
            const first = nodes[0], last = nodes.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener('keydown', handle);
        return () => { document.removeEventListener('keydown', handle); if (previous?.isConnected) previous.focus(); };
    }, [capture]);
    async function open(id) {
        if (busy.current || navigation.current && !await navigation.current()) return;
        persist(); setEditingId(id); setFocused(false);
    }
    async function edit(ids, field, value) {
        if (busy.current) return;
        busy.current = true; setPending(true); setError('');
        try {
            if (navigation.current && !await navigation.current()) return;
            const changes = await editTableTasks(ids, field, value);
            setUndo(changes.length ? changes : null); await reload();
        } catch (failure) { await reload(); setError(failure.message || '変更できませんでした'); }
        finally { busy.current = false; setPending(false); }
    }
    async function undoEdit() {
        if (busy.current) return;
        busy.current = true; setPending(true);
        try { if (navigation.current && !await navigation.current()) return; await undoTableEdit(undo); setUndo(null); await reload(); }
        catch (failure) { setError(failure.message); }
        finally { busy.current = false; setPending(false); }
    }
    const options = field => ({ status_code: statuses.map(item => ({ value: item.code, label: item.label })), project_id: projects.map(item => ({ value: item.id, label: item.name })), importance_level: importance.map(item => ({ value: item.level, label: item.label })), urgency_level: urgency.map(item => ({ value: item.level, label: item.label })) }[field]);
    const toggleSelection = id => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    const startWork = () => guardWorkNavigation(() => { persist(); router.push(`/work?task=${editingId}&start=1`); });
    return <div className={`${styles.workspace} ${fullPage ? styles.fullPage : ''} ${editingId ? styles.withDetail : ''} ${focused ? styles.focused : ''}`}>
        <section className={styles.list} aria-label="タスク管理">
            <div className={styles.heading}><div className={styles.tabs}><button className={!archived ? styles.active : ''} onClick={() => { setArchived(false); setSelected([]); }}>タスク <span>{!archived && tasks.length}</span></button><button className={archived ? styles.active : ''} onClick={() => { setArchived(true); setSelected([]); }}><Archive size={14} />アーカイブ</button></div><button className={styles.add} onClick={() => setCapture({ parentId: null })}><Plus size={16} />追加</button></div>
            <div className={styles.toolbar}>
                <label className={styles.search}><Search size={16} /><input aria-label="タスクを検索" placeholder="検索" value={view.search} onChange={event => patchView({ search: event.target.value })} />{view.search && <button aria-label="検索をクリア" onClick={() => patchView({ search: '' })}><X size={14} /></button>}</label>
                <div className={styles.viewControls}><select aria-label="一覧の構成" value={view.group} onChange={event => patchView({ group: event.target.value })}><option value="tree">階層表示</option><option value="project">プロジェクト別</option><option value="status">状態別</option></select>
                    <select aria-label="並び順" value={view.sort} onChange={event => patchView({ sort: event.target.value })}><option value="manual">手動順</option>{SORT_OPTIONS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
                    <details className={styles.popover}><summary><Columns3 size={15} />列</summary><div className={styles.menu}>{TABLE_COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={view.columns.includes(key)} onChange={() => setView(current => ({ ...current, columns: current.columns.includes(key) ? current.columns.filter(item => item !== key) : [...current.columns, key] }))} />{label}</label>)}</div></details>
                    <details className={styles.popover}><summary>表示を保存</summary><div className={styles.menu}><input aria-label="表示の名前" placeholder="表示の名前" value={viewName} onChange={event => setViewName(event.target.value)} /><button disabled={!viewName.trim()} onClick={event => { setSavedViews(current => [...current.filter(item => item.name !== viewName.trim()), { name: viewName.trim(), view }]); setViewName(''); event.currentTarget.closest('details').open = false; }}>保存</button>{savedViews.map(item => <div className={styles.saved} key={item.name}><button onClick={event => { patchView(restoreTableView(item.view)); event.currentTarget.closest('details').open = false; }}>{item.name}</button><button aria-label={`${item.name}の表示設定を削除`} onClick={() => setSavedViews(current => current.filter(value => value.name !== item.name))}><X size={13} /></button></div>)}</div></details>
                </div>
            </div>
            <div className={styles.filters}><ListFilter size={15} />{[['statuses', '状態', filters.statusOptions], ['projects', 'プロジェクト', filters.projectOptions], ['tags', 'タグ', filters.tagOptions], ['importance', '重要度', filters.importanceOptions], ['urgency', '緊急度', filters.urgencyOptions]].map(([key, label, opts]) => <MultiSelectFilter selectionMode="include" key={key} label={label} options={opts} selected={view[key]} onChange={value => patchView({ [key]: value })} />)}{(view.search || FILTER_KEYS.some(key => view[key].length)) && <button className={styles.clear} onClick={() => patchView({ search: '', statuses: [], projects: [], tags: [], importance: [], urgency: [] })}>解除</button>}</div>
            {error && <div role="alert" className={styles.error}>{error}<button onClick={reload}>再読み込み</button></div>}
            {actualSelected.length > 0 && !archived && <div className={styles.bulk}><strong>{actualSelected.length}件選択</strong><select aria-label="まとめて変更する項目" value={bulkField} disabled={pending} onChange={event => { setBulkField(event.target.value); setBulkValue(''); }}>{TABLE_COLUMNS.filter(([key]) => key !== 'tags').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{options(bulkField) ? <select aria-label="まとめて変更する値" value={bulkValue} disabled={pending} onChange={event => setBulkValue(event.target.value)}><option value="">{bulkField === 'status_code' ? '選択…' : '未設定'}</option>{options(bulkField).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <input aria-label="まとめて変更する値" type={bulkField === 'estimated_hours' ? 'number' : 'date'} min={bulkField === 'estimated_hours' ? 0 : undefined} placeholder={bulkField === 'estimated_hours' ? '分' : ''} value={bulkValue} disabled={pending} onChange={event => setBulkValue(event.target.value)} />}{bulkField === 'estimated_hours' && <span>分</span>}<button disabled={pending || bulkField === 'status_code' && !bulkValue} onClick={() => edit(actualSelected, bulkField, bulkValue)}>適用</button><button aria-label="選択を解除" disabled={pending} onClick={() => setSelected([])}><X size={15} /></button></div>}
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={dnd.handleDragStart} onDragEnd={dnd.handleDragEnd}>
                <div className={styles.scroll} ref={scroll} onScroll={persist}>
                    <table className={styles.table} aria-label={archived ? 'アーカイブ済みタスク' : 'タスク一覧'}><thead><tr><th className={styles.check}>{!archived && <input type="checkbox" aria-label="表示中のタスクをすべて選択" checked={visibleIds.length > 0 && visibleIds.every(id => actualSelected.includes(id))} onChange={() => setSelected(visibleIds.every(id => actualSelected.includes(id)) ? [] : visibleIds)} />}</th><th className={styles.taskHeading}>タスク</th>{view.columns.map(key => <th key={key}>{TABLE_COLUMNS.find(([field]) => field === key)?.[1]}</th>)}<th className={styles.rowActions}><span className="sr-only">操作</span></th></tr></thead><tbody>
                        {data.rows.map((row, index) => row.task ? <TaskTableRow key={row.task.id} row={row} columns={view.columns} selected={actualSelected.includes(row.task.id)} active={editingId === row.task.id} onSelect={toggleSelection} onOpen={open} onToggle={id => patchView({ collapsed: view.collapsed.includes(id) ? view.collapsed.filter(value => value !== id) : [...view.collapsed, id] })} onEdit={edit} options={options} disabled={archived || pending || actions.processingIds.has(row.task.id)} archived={archived} draggable={dragEnabled} dragId={dnd.activeId} manual={view.sort === 'manual'} onAdd={id => setCapture({ parentId: id })} onArchive={actions.handleArchive} onRestore={actions.handleRestore} onDelete={actions.handleDelete} /> : <tr className={styles.group} key={`group-${row.group}-${index}`}><th colSpan={view.columns.length + 3}>{row.label}<span>{row.count}</span></th></tr>)}
                        {dnd.activeId && <TableDropGap id="root" columns={view.columns.length + 3} label="最上位へ移動" />}
                        {!data.rows.length && <tr><td colSpan={view.columns.length + 3} className={styles.empty}>{loading || !ready ? '読み込み中…' : '該当するタスクはありません'}</td></tr>}
                    </tbody></table>
                </div><DragOverlay>{dnd.activeTaskData && <div className={styles.dragOverlay}>{dnd.activeTaskData.title}</div>}</DragOverlay>
            </DndContext>
            <footer className={styles.footer}><span>{data.matches.size}件{estimate > 0 && ` · 見積合計 ${formatMin(estimate)}`}</span>{undo && <button disabled={pending} onClick={undoEdit}><Undo2 size={14} />変更を元に戻す</button>}{loading && tasks.length > 0 && <span>更新中…</span>}</footer>
        </section>
        {editingId && <aside className={styles.detail} aria-label="選んだタスク"><div className={styles.detailTop}><button onClick={startWork}><ArrowRight size={15} />仕事画面で開始</button></div><WorkDetailPanel embedded navigationRef={navigation} taskId={editingId} onClose={() => open(null)} onChanged={reload} onOpenTask={open} onFocusChange={setFocused} /></aside>}
        {capture && <div className={styles.captureBackdrop}><section ref={captureRef} className={styles.capture} role="dialog" aria-modal="true" aria-label={capture.parentId ? '子タスクを追加' : 'タスクを追加'}><header><strong>{capture.parentId ? '子タスクを追加' : 'タスクを追加'}</strong><button aria-label="記録欄を閉じる" onClick={() => setCapture(null)}><X size={18} /></button></header><TaskInput autoFocus predefinedParentId={capture.parentId} defaultProjectId={projectId} draftKey={capture.parentId ? `child:${capture.parentId}` : 'global'} onTaskAdded={reload} /></section></div>}
    </div>;
}
