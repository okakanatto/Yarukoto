'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, Paperclip, Pause, Pencil, Play, Plus, Save, Settings2, Sun, X } from 'lucide-react';
import TaskEditModal from './TaskEditModal';
import { useStatusActions } from '@/hooks/useStatusActions';
import { createCapturedTask, loadTaskContext, rememberTask, resolveWaiting, saveWorkContext, setTaskPlan } from '@/lib/workspace';
import { classifyWorkReference, openWorkReference } from '@/lib/workReferences';
import { clearWorkDraft, readWorkDraft, writeWorkDraft } from '@/lib/workDrafts';
import styles from './WorkDetailPanel.module.css';

// Navigation saves first; a local recovery copy also survives an unexpected close.
const fieldsFrom = task => ({
    notes: task.notes || '', source_ref: task.source_ref || '', next_step: task.next_step || '',
    waiting_on: task.waiting_on || '', review_date: task.review_date || '',
    next_task_id: task.next_task_id == null ? '' : String(task.next_task_id),
});
const changedFields = (draft, baseline) => Object.fromEntries(
    Object.entries(draft || {}).filter(([key, value]) => value !== baseline?.[key])
);
const statusName = task => task.status_label || ({ 1: '未着手', 2: '着手中', 3: '完了', 4: '保留', 5: 'キャンセル' }[task.status_code]) || '未設定';

export default function WorkDetailPanel(props) {
    return <WorkDetailSession key={props.taskId} {...props} />;
}

function WorkDetailSession({ taskId, onClose, onChanged, onOpenTask, embedded = false, navigationRef }) {
    const [currentId, setCurrentId] = useState(taskId);
    return <WorkDetailContent key={currentId} taskId={currentId} onClose={onClose} onChanged={onChanged}
        onOpenTask={onOpenTask || setCurrentId} embedded={embedded} navigationRef={navigationRef} />;
}

function WorkDetailContent({ taskId, onClose, onChanged, onOpenTask, embedded, navigationRef }) {
    const [context, setContext] = useState(null);
    const [draft, setDraft] = useState(null);
    const [baseline, setBaseline] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [childText, setChildText] = useState(() => readWorkDraft(taskId)?.childText || '');
    const [childOpen, setChildOpen] = useState(() => !!readWorkDraft(taskId)?.childText);
    const [draftWarning, setDraftWarning] = useState('');
    const [selectedText, setSelectedText] = useState('');
    const [sourceEditing, setSourceEditing] = useState(false);
    const [today, setToday] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const panelRef = useRef(null);
    const notesRef = useRef(null);
    const originalRef = useRef(null);
    const attributesRef = useRef(null);
    const wasEditing = useRef(false);
    const pendingRef = useRef(false);
    const reloadQueuedRef = useRef(false);
    const loadRequestRef = useRef(0);
    const draftRef = useRef(draft);
    const baselineRef = useRef(baseline);
    draftRef.current = draft;
    baselineRef.current = baseline;
    const statusFailedRef = useRef(false);
    const closeRef = useRef(null);
    const aliveRef = useRef(true);
    const callbacks = useRef({ onClose, onChanged, onOpenTask });
    useEffect(() => { callbacks.current = { onClose, onChanged, onOpenTask }; }, [onClose, onChanged, onOpenTask]);

    const dirty = Object.keys(changedFields(draft, baseline)).length > 0;
    const task = context?.task;
    const descendants = context?.descendants || [];
    const ancestors = context?.ancestors || [];
    const nextTask = descendants.find(item => String(item.id) === draft?.next_task_id);
    const reference = classifyWorkReference(draft?.source_ref || '');
    const unfinished = descendants.filter(item => !item.archived_at && ![3, 5].includes(Number(item.status_code)));
    const active = task && !task.archived_at && ![3, 5].includes(Number(task.status_code));
    const ignoreOptimisticUpdate = useCallback(() => {}, []);
    const statusFailed = useCallback(() => { statusFailedRef.current = true; }, []);
    const { handleStatusChange } = useStatusActions({ setTasks: ignoreOptimisticUpdate, fetchTasks: statusFailed, refresh: ignoreOptimisticUpdate });

    const load = useCallback(async (replaceDraft = false, external = false) => {
        const request = ++loadRequestRef.current;
        try {
            const result = await loadTaskContext(taskId);
            if (!aliveRef.current || request !== loadRequestRef.current) return;
            if (external && pendingRef.current) { reloadQueuedRef.current = true; return; }
            if (!result?.task) throw new Error('仕事が見つかりません。削除されている可能性があります。');
            setContext(result);
            const fields = fieldsFrom(result.task);
            const edited = changedFields(draftRef.current, baselineRef.current);
            const next = replaceDraft || !draftRef.current ? { ...fields, ...readWorkDraft(taskId)?.fields } : { ...fields, ...edited };
            baselineRef.current = fields;
            draftRef.current = next;
            setBaseline(fields);
            setDraft(next);
            if (!external) setError('');
        } catch (failure) {
            if (aliveRef.current && request === loadRequestRef.current) setError(failure.message || '仕事を読み込めませんでした。');
        } finally {
            if (aliveRef.current && request === loadRequestRef.current) setLoading(false);
        }
    }, [taskId]);

    function finishPending() {
        pendingRef.current = false;
        if (!aliveRef.current) return;
        setSaving(false);
        if (reloadQueuedRef.current) {
            reloadQueuedRef.current = false;
            load(false, true);
        }
    }

    useEffect(() => {
        aliveRef.current = true;
        load();
        Promise.resolve().then(() => rememberTask(taskId)).catch(() => {
            // Opening the work remains useful if recording its recent position fails.
        });
        return () => { aliveRef.current = false; };
    }, [taskId, load]);

    useEffect(() => {
        const refresh = () => {
            if (pendingRef.current) { reloadQueuedRef.current = true; return; }
            load(false, true);
        };
        window.addEventListener('yarukoto:tasksChanged', refresh);
        return () => window.removeEventListener('yarukoto:tasksChanged', refresh);
    }, [load]);

    useEffect(() => {
        if (embedded) return;
        const previous = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            if (previous?.isConnected) previous.focus();
        };
    }, [embedded]);

    useEffect(() => {
        const updateDate = () => setToday(new Date().toLocaleDateString('sv-SE'));
        const timer = setInterval(updateDate, 60000);
        window.addEventListener('focus', updateDate);
        return () => { clearInterval(timer); window.removeEventListener('focus', updateDate); };
    }, []);

    useEffect(() => {
        if (editOpen) wasEditing.current = true;
        else if (wasEditing.current && !saving) {
            attributesRef.current?.focus();
            wasEditing.current = false;
        }
    }, [editOpen, saving]);

    useEffect(() => {
        const beforeUnload = event => {
            if (!dirty && !childText.trim()) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [dirty, childText]);

    function changeField(key, value) {
        const next = { ...draftRef.current, [key]: value };
        draftRef.current = next;
        setDraft(next);
        setSaved(false);
        storeDraft({ fields: changedFields(next, baseline), childText });
    }

    function storeDraft(value) {
        const stored = writeWorkDraft(taskId, value);
        setDraftWarning(stored ? '' : '下書きの控えを保存できません。終了前に保存してください。');
    }

    function clearDraft() {
        if (!clearWorkDraft(taskId)) setDraftWarning('保存済みですが、下書きの控えを消せませんでした。');
        else setDraftWarning('');
    }

    function changeChild(value) {
        setChildText(value);
        storeDraft({ fields: changedFields(draft, baseline), childText: value });
    }

    async function persist() {
        if (pendingRef.current) return false;
        const changes = changedFields(draftRef.current, baselineRef.current);
        if (!Object.keys(changes).length) return true;
        const snapshot = { ...draftRef.current };
        if ('next_task_id' in changes) changes.next_task_id = changes.next_task_id ? Number(changes.next_task_id) : null;
        pendingRef.current = true;
        setSaving(true);
        setError('');
        try {
            await saveWorkContext(taskId, changes);
            if (!aliveRef.current) return true;
            setBaseline(snapshot);
            baselineRef.current = snapshot;
            setContext(current => ({ ...current, task: { ...current.task, ...snapshot } }));
            if (childText.trim()) storeDraft({ fields: {}, childText });
            else clearDraft();
            setSaved(true);
            callbacks.current.onChanged?.();
            return true;
        } catch (failure) {
            if (aliveRef.current) setError(`保存できませんでした。入力はこの画面に残っています。${failure.message ? ` ${failure.message}` : ''}`);
            return false;
        } finally {
            finishPending();
        }
    }

    async function canLeave() {
        if (pendingRef.current) return false;
        if (childText.trim()) {
            setError('子タスクが未追加です。追加または取消を選んでください。');
            return false;
        }
        return persist();
    }

    async function leave(action) {
        if (await canLeave()) action();
    }

    useEffect(() => {
        if (!navigationRef) return;
        navigationRef.current = canLeave;
        return () => { navigationRef.current = null; };
    });

    const keyboardRef = useRef(null);
    useEffect(() => {
        keyboardRef.current = event => {
            if (editOpen) return;
            if (embedded && !panelRef.current?.contains(event.target)) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); leave(() => callbacks.current.onClose?.()); }
            if (embedded) return;
            if (event.key !== 'Tab') return;
            const items = [...(panelRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary') || [])]
                .filter(item => !item.closest('details:not([open])') || item.tagName === 'SUMMARY');
            const first = items[0], last = items[items.length - 1];
            if (!first) return;
            if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        };
    });
    useEffect(() => {
        const handler = event => keyboardRef.current?.(event);
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    function selectNotes() {
        const field = notesRef.current;
        setSelectedText(field ? field.value.slice(field.selectionStart, field.selectionEnd).trim() : '');
    }

    function selectOriginal() {
        const selection = window.getSelection();
        setSelectedText(selection && originalRef.current?.contains(selection.anchorNode) ? selection.toString().trim() : '');
    }

    function startChild(text = '') {
        changeChild(text);
        setChildOpen(true);
        setError('');
    }

    async function addChild(event) {
        event.preventDefault();
        if (!childText.trim() || pendingRef.current || !task) return;
        if (!await persist()) return;
        pendingRef.current = true;
        setSaving(true);
        setError('');
        try {
            await createCapturedTask({ text: childText, source_ref: draft.source_ref, parent_id: taskId, project_id: task.project_id });
            if (!aliveRef.current) return;
            setChildText('');
            setChildOpen(false);
            setSelectedText('');
            clearDraft();
            callbacks.current.onChanged?.();
            await load();
        } catch (failure) {
            if (aliveRef.current) setError(`子タスクを追加できませんでした。入力は残っています。${failure.message ? ` ${failure.message}` : ''}`);
        } finally {
            finishPending();
        }
    }

    async function openAttributes() {
        if (pendingRef.current || !await persist()) return;
        setEditOpen(true);
    }

    async function attributesSaved() {
        pendingRef.current = true;
        setSaving(true);
        if (childText.trim()) storeDraft({ childText });
        else clearDraft();
        try {
            await load(true);
            callbacks.current.onChanged?.();
        } finally {
            finishPending();
        }
    }

    async function changeStatus(code) {
        if (!task || pendingRef.current || !await persist()) return;
        pendingRef.current = true;
        statusFailedRef.current = false;
        setSaving(true);
        setError('');
        try {
            // Retain the established ancestor-completion and reference-cleanup rules.
            await handleStatusChange(taskId, code);
            const result = await loadTaskContext(taskId);
            if (!aliveRef.current) return;
            if (!result?.task) throw new Error('更新後の仕事が見つかりません。');
            setContext(result);
            const fields = fieldsFrom(result.task);
            setDraft(fields);
            setBaseline(fields);
            draftRef.current = fields;
            baselineRef.current = fields;
            if (childText.trim()) storeDraft({ fields: {}, childText });
            else clearDraft();
            callbacks.current.onChanged?.();
            if (statusFailedRef.current || Number(result.task.status_code) !== code) throw new Error('状態の更新を確認できませんでした。');
        } catch (failure) {
            if (aliveRef.current) setError(`状態の更新中にエラーが発生しました。保存済みのメモは保持しています。${failure.message ? ` ${failure.message}` : ''}`);
        } finally {
            finishPending();
        }
    }

    async function updateWork(action) {
        if (!task || pendingRef.current || !await persist()) return;
        pendingRef.current = true;
        setSaving(true);
        setError('');
        try {
            await action();
            if (!aliveRef.current) return;
            await load(true);
            callbacks.current.onChanged?.();
        } catch (failure) {
            if (aliveRef.current) setError(`変更できませんでした。${failure.message || ''}`);
        } finally {
            finishPending();
        }
    }

    async function openReference() {
        if (!await persist()) return;
        try { await openWorkReference(draft.source_ref); }
        catch (failure) { setError(`資料を開けませんでした。${failure.message || ''}`); }
    }

    function useSelectionAsStep() {
        changeField('next_step', selectedText);
        setSelectedText('');
    }

    function renderOriginal() {
        return <details className={styles.originalSection} open={!task.notes && task.capture_text !== task.title || undefined}>
            <summary>最初の記録{task.created_at && <time>{task.created_at.slice(0, 16)}</time>}</summary>
            <p className={styles.original} ref={originalRef} onMouseUp={selectOriginal} onKeyUp={selectOriginal}>{task.capture_text || task.title}</p>
        </details>;
    }

    return <>
        {!embedded && <div className={styles.backdrop} onClick={() => leave(() => callbacks.current.onClose?.())} aria-hidden="true" />}
        <section className={`${styles.panel} ${embedded ? styles.embedded : ''}`} ref={panelRef} role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby={`work-heading-${taskId}`} aria-hidden={editOpen || undefined}>
            <header className={styles.header}>
                <nav className={styles.breadcrumb} aria-label="仕事の階層">
                    <span>{task?.project_name || '仕事'}</span>
                    {ancestors.map(parent => <span className={styles.crumb} key={parent.id}><ChevronRight size={12} /><button type="button" disabled={saving} onClick={() => leave(() => callbacks.current.onOpenTask(parent.id))}>{parent.title}</button></span>)}
                </nav>
                <button ref={closeRef} type="button" className={styles.iconButton} aria-label="仕事の内容を閉じる" disabled={saving} onClick={() => leave(() => callbacks.current.onClose?.())}><X size={20} /></button>
            </header>
            <div className={styles.body}>
                {loading && <p role="status" className={styles.muted}>読み込み中…</p>}
                {error && <div className={styles.error} role="alert">{error}{!task && <button type="button" onClick={() => load()}>再読み込み</button>}</div>}
                {draftWarning && <p className={styles.warning} role="alert">{draftWarning}</p>}
                {task && draft && <>
                    <div className={styles.titleRow}><h2 id={`work-heading-${taskId}`} className={styles.title}>{task.title}</h2><button ref={attributesRef} type="button" className={styles.iconButton} aria-label="属性を編集" title="属性を編集" onClick={openAttributes} disabled={saving}><Settings2 size={18} /></button></div>
                    <div className={styles.metadata}>
                        <span className={styles.status}>{statusName(task)}</span>
                        {task.due_date && <span className={styles.deadline}><CalendarDays size={13} />期限 {task.due_date}</span>}
                        {task.today_date && task.today_date !== today && <span className={styles.status}>予定 {task.today_date}</span>}
                        {Number(task.importance_level) >= 3 && <span className={styles.status}>重要</span>}
                    </div>
                    {ancestors.some(parent => parent.due_date) && <div className={styles.ancestorDates}>{ancestors.filter(parent => parent.due_date).map(parent => <div key={parent.id}><CalendarDays size={13} /><span>{parent.title}：{parent.due_date}</span></div>)}</div>}
                    {active && <div className={styles.workActions}>
                        {Number(task.status_code) !== 2 ? <button type="button" className={styles.primaryButton} disabled={saving} onClick={() => changeStatus(2)}><Play size={14} />着手</button> : <button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => leave(() => callbacks.current.onClose?.())}><Pause size={14} />保存して中断</button>}
                        <button type="button" className={`${styles.secondaryButton} ${task.today_date === today ? styles.selected : ''}`} aria-pressed={task.today_date === today} disabled={saving} onClick={() => updateWork(() => setTaskPlan(taskId, task.today_date === today ? null : today))}><Sun size={14} />{task.today_date === today ? '今日から外す' : '今日やる'}</button>
                        <button type="button" className={styles.completionButton} disabled={saving} onClick={() => changeStatus(3)}><Check size={14} />完了</button>
                    </div>}
                    {active && unfinished.length > 0 && <p className={styles.childCount}>子タスク 未完了 {unfinished.length}件</p>}

                    <div className={styles.referenceLine}>
                        <Paperclip size={15} aria-hidden="true" />
                        {sourceEditing ? <><input aria-label="出どころ" autoFocus value={draft.source_ref} disabled={saving} placeholder="資料の場所・URL" onChange={event => changeField('source_ref', event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setSourceEditing(false); } }} /><button className={styles.iconButton} aria-label="資料の編集を終える" type="button" disabled={saving} onClick={() => setSourceEditing(false)}><Check size={16} /></button></> : draft.source_ref ? <>{reference.kind !== 'text' ? <button type="button" className={styles.referenceLink} disabled={saving} onClick={openReference} title={draft.source_ref}>{reference.label}<ArrowUpRight size={14} /></button> : <span className={styles.referenceText}>{draft.source_ref}</span>}<button type="button" className={styles.iconButton} aria-label="資料を編集" title="資料を編集" disabled={saving} onClick={() => setSourceEditing(true)}><Pencil size={14} /></button></> : <button type="button" className={styles.textButton} disabled={saving} onClick={() => setSourceEditing(true)}>資料を追加</button>}
                    </div>

                    <section className={styles.nextStep}>
                        <label htmlFor={`work-step-${taskId}`}>今する一歩</label>
                        <textarea id={`work-step-${taskId}`} rows={1} value={draft.next_step} placeholder="次にすること" disabled={saving} onChange={event => changeField('next_step', event.target.value)} />
                        {nextTask && <button type="button" className={styles.nextTaskLink} disabled={saving} onClick={() => leave(() => callbacks.current.onOpenTask(nextTask.id))}><span>次の子タスク</span>{nextTask.title}<ArrowRight size={16} /></button>}
                    </section>

                    {!task.notes && renderOriginal()}
                    <section className={styles.notesSection}>
                        <label htmlFor={`work-notes-${taskId}`}>作業メモ</label>
                        <textarea id={`work-notes-${taskId}`} ref={notesRef} rows={Math.min(14, Math.max(4, (draft.notes.match(/\n/g)?.length || 0) + 2))} value={draft.notes} placeholder="メモ…" onChange={event => changeField('notes', event.target.value)} onSelect={selectNotes} disabled={saving} />
                        {selectedText && <div className={styles.selectionActions}><span>選択した文</span><button type="button" className={styles.textButton} disabled={saving} onClick={useSelectionAsStep}><ArrowRight size={13} />今する一歩に</button><button type="button" className={styles.textButton} disabled={saving} onClick={() => startChild(selectedText)}><Plus size={13} />子タスクにする</button></div>}
                    </section>
                    {task.notes && renderOriginal()}

                    <details className={styles.section} open={!!task.waiting_on || !!task.review_date || Number(task.status_code) === 4 || undefined}>
                        <summary>待ち{task.waiting_on && <span className={styles.summaryHint}>{task.waiting_on}</span>}</summary>
                        <div className={styles.waitFields}><label>相手・条件<input value={draft.waiting_on} onChange={event => changeField('waiting_on', event.target.value)} disabled={saving} /></label><label>確認日<input type="date" value={draft.review_date} onChange={event => changeField('review_date', event.target.value)} disabled={saving} /></label></div>
                        {(draft.waiting_on || draft.review_date || Number(task.status_code) === 4) && <button type="button" className={styles.textButton} disabled={saving} onClick={() => updateWork(() => resolveWaiting(taskId))}><Check size={14} />待ちを解消</button>}
                    </details>

                    <details className={styles.section} open={childOpen || undefined}>
                        <summary>子タスク{descendants.length > 0 && <span className={styles.summaryHint}>{unfinished.length} / {descendants.length} 未完了</span>}</summary>
                        <div className={styles.childTools}>{!childOpen && <button type="button" className={styles.textButton} aria-label="子タスクを追加" disabled={saving || !!task.archived_at} onClick={() => startChild()}><Plus size={14} />追加</button>}</div>
                        {(descendants.length > 0 || draft.next_task_id) && <div className={styles.nextRow}><label htmlFor={`work-next-${taskId}`}>次の子タスク</label><select id={`work-next-${taskId}`} value={draft.next_task_id} disabled={saving} onChange={event => changeField('next_task_id', event.target.value)}>
                            <option value="">未選択</option>
                            {draft.next_task_id && !nextTask && <option value={draft.next_task_id}>参照先なし</option>}
                            {descendants.filter(item => !item.archived_at || String(item.id) === draft.next_task_id).map(item => <option value={item.id} key={item.id} disabled={!!item.archived_at || [3, 5].includes(Number(item.status_code))}>{'› '.repeat(Math.min(Math.max((item.depth || 1) - 1, 0), 5))}{item.title}{Number(item.status_code) === 3 ? '（完了）' : Number(item.status_code) === 5 ? '（キャンセル）' : item.archived_at ? '（アーカイブ済み）' : ''}</option>)}
                        </select></div>}
                        {descendants.length > 0 && <ul className={styles.tree}>{descendants.map(item => <li key={item.id} style={{ '--work-depth': Math.min(Math.max((item.depth || 1) - 1, 0), 5) }}><button type="button" disabled={saving} onClick={() => leave(() => callbacks.current.onOpenTask(item.id))}><span className={styles.treeTitle}>{item.title}</span><span className={styles.treeMeta}>{statusName(item)}{item.due_date && ` · 期限 ${item.due_date}`}{item.waiting_on && ` · 待ち ${item.waiting_on}`}</span><ChevronRight size={14} /></button></li>)}</ul>}
                        {childOpen && <form className={styles.childForm} onSubmit={addChild}><label htmlFor={`work-child-${taskId}`}>子タスク</label><textarea id={`work-child-${taskId}`} rows={3} value={childText} onChange={event => changeChild(event.target.value)} disabled={saving} /><div className={styles.childActions}><button type="submit" disabled={!childText.trim() || saving} className={styles.primaryButton}>追加</button><button type="button" className={styles.textButton} disabled={saving} onClick={() => { changeChild(''); setChildOpen(false); setError(''); }}>取消</button></div></form>}
                    </details>
                </>}
            </div>
            <footer className={styles.footer}><span role="status" className={dirty ? styles.unsaved : styles.muted}>{saving ? '保存中…' : dirty ? '未保存' : saved ? '保存しました' : ''}</span><button type="button" className={styles.saveButton} disabled={!dirty || saving || !task} onClick={persist}><Save size={14} />保存</button></footer>
        </section>
        {editOpen && task && <TaskEditModal task={{ ...task, ...draft }} onClose={() => setEditOpen(false)} onSaved={attributesSaved} />}
    </>;
}
