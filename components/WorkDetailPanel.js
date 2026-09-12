'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronRight, FileText, Pause, Play, Plus, Save, Settings2, X } from 'lucide-react';
import TaskEditModal from './TaskEditModal';
import { useStatusActions } from '@/hooks/useStatusActions';
import { createCapturedTask, loadTaskContext, rememberTask, saveWorkContext } from '@/lib/workspace';
import styles from './WorkDetailPanel.module.css';

// A parent changing taskId must not erase an unsaved edit. Drafts stay in this
// process only; successful persistence clears them. Normal navigation saves first.
const drafts = new Map();
const fieldsFrom = task => ({
    notes: task.notes || '', source_ref: task.source_ref || '',
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

function WorkDetailSession({ taskId, onClose, onChanged, onOpenTask }) {
    const [currentId, setCurrentId] = useState(taskId);
    return <WorkDetailContent key={currentId} taskId={currentId} onClose={onClose} onChanged={onChanged}
        onOpenTask={onOpenTask || setCurrentId} />;
}

function WorkDetailContent({ taskId, onClose, onChanged, onOpenTask }) {
    const [context, setContext] = useState(null);
    const [draft, setDraft] = useState(null);
    const [baseline, setBaseline] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [childText, setChildText] = useState(drafts.get(taskId)?.childText || '');
    const [childOpen, setChildOpen] = useState(!!drafts.get(taskId)?.childText);
    const [selectedText, setSelectedText] = useState('');
    const panelRef = useRef(null);
    const notesRef = useRef(null);
    const originalRef = useRef(null);
    const attributesRef = useRef(null);
    const wasEditing = useRef(false);
    const pendingRef = useRef(false);
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
    const ignoreOptimisticUpdate = useCallback(() => {}, []);
    const statusFailed = useCallback(() => { statusFailedRef.current = true; }, []);
    const { handleStatusChange } = useStatusActions({ setTasks: ignoreOptimisticUpdate, fetchTasks: statusFailed, refresh: ignoreOptimisticUpdate });

    const load = useCallback(async (replaceDraft = false) => {
        try {
            const result = await loadTaskContext(taskId);
            if (!aliveRef.current) return;
            if (!result?.task) throw new Error('仕事が見つかりません。削除されている可能性があります。');
            setContext(result);
            const fields = fieldsFrom(result.task);
            setBaseline(fields);
            setDraft(current => replaceDraft || !current ? (drafts.get(taskId)?.fields || fields) : current);
            setError('');
        } catch (failure) {
            if (aliveRef.current) setError(failure.message || '仕事を読み込めませんでした。');
        } finally {
            if (aliveRef.current) setLoading(false);
        }
    }, [taskId]);

    useEffect(() => {
        aliveRef.current = true;
        load();
        Promise.resolve().then(() => rememberTask(taskId)).catch(() => {
            // Opening the work remains useful if recording its recent position fails.
        });
        return () => { aliveRef.current = false; };
    }, [taskId, load]);

    useEffect(() => {
        const previous = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            if (previous?.isConnected) previous.focus();
        };
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
        const next = { ...draft, [key]: value };
        setDraft(next);
        setSaved(false);
        drafts.set(taskId, { fields: next, childText });
    }

    function changeChild(value) {
        setChildText(value);
        drafts.set(taskId, { fields: draft, childText: value });
    }

    async function persist() {
        if (pendingRef.current) return false;
        const changes = changedFields(draft, baseline);
        if (!Object.keys(changes).length) return true;
        const snapshot = { ...draft };
        if ('next_task_id' in changes) changes.next_task_id = changes.next_task_id ? Number(changes.next_task_id) : null;
        pendingRef.current = true;
        setSaving(true);
        setError('');
        try {
            await saveWorkContext(taskId, changes);
            if (!aliveRef.current) return true;
            setBaseline(snapshot);
            setContext(current => ({ ...current, task: { ...current.task, ...snapshot } }));
            if (childText.trim()) drafts.set(taskId, { fields: snapshot, childText });
            else drafts.delete(taskId);
            setSaved(true);
            callbacks.current.onChanged?.();
            return true;
        } catch (failure) {
            if (aliveRef.current) setError(`保存できませんでした。入力はこの画面に残っています。${failure.message ? ` ${failure.message}` : ''}`);
            return false;
        } finally {
            pendingRef.current = false;
            if (aliveRef.current) setSaving(false);
        }
    }

    async function leave(action) {
        if (pendingRef.current) return;
        if (childText.trim()) {
            setError('子タスクが未追加です。追加または取消を選んでください。');
            return;
        }
        if (await persist()) action();
    }

    const keyboardRef = useRef(null);
    useEffect(() => {
        keyboardRef.current = event => {
            if (editOpen) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); leave(() => callbacks.current.onClose?.()); }
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
            drafts.delete(taskId);
            callbacks.current.onChanged?.();
            await load();
        } catch (failure) {
            if (aliveRef.current) setError(`子タスクを追加できませんでした。入力は残っています。${failure.message ? ` ${failure.message}` : ''}`);
        } finally {
            pendingRef.current = false;
            if (aliveRef.current) setSaving(false);
        }
    }

    async function openAttributes() {
        if (pendingRef.current || !await persist()) return;
        setEditOpen(true);
    }

    async function attributesSaved() {
        pendingRef.current = true;
        setSaving(true);
        if (childText.trim()) drafts.set(taskId, { childText });
        else drafts.delete(taskId);
        try {
            await load(true);
            callbacks.current.onChanged?.();
        } finally {
            pendingRef.current = false;
            if (aliveRef.current) setSaving(false);
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
            if (childText.trim()) drafts.set(taskId, { fields, childText });
            else drafts.delete(taskId);
            callbacks.current.onChanged?.();
            if (statusFailedRef.current || Number(result.task.status_code) !== code) throw new Error('状態の更新を確認できませんでした。');
        } catch (failure) {
            if (aliveRef.current) setError(`状態の更新中にエラーが発生しました。保存済みのメモは保持しています。${failure.message ? ` ${failure.message}` : ''}`);
        } finally {
            pendingRef.current = false;
            if (aliveRef.current) setSaving(false);
        }
    }

    return <>
        <div className={styles.backdrop} onClick={() => leave(() => callbacks.current.onClose?.())} aria-hidden="true" />
        <section className={styles.panel} ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={`work-heading-${taskId}`} aria-hidden={editOpen || undefined}>
            <header className={styles.header}>
                <span className={styles.headerLabel}><FileText size={16} /> 仕事の内容</span>
                <button ref={closeRef} type="button" className={styles.iconButton} aria-label="仕事の内容を閉じる" disabled={saving} onClick={() => leave(() => callbacks.current.onClose?.())}><X size={20} /></button>
            </header>
            <div className={styles.body}>
                {loading && <p role="status" className={styles.muted}>読み込み中…</p>}
                {error && <div className={styles.error} role="alert">{error}{!task && <button type="button" onClick={() => load()}>再読み込み</button>}</div>}
                {task && draft && <>
                    <nav className={styles.breadcrumb} aria-label="仕事の階層">
                        <span>{task.project_name || 'プロジェクト'}</span>
                        {ancestors.map(parent => <span className={styles.crumb} key={parent.id}><ChevronRight size={12} /><button type="button" disabled={saving} onClick={() => leave(() => callbacks.current.onOpenTask(parent.id))}>{parent.title}</button></span>)}
                    </nav>
                    <h2 id={`work-heading-${taskId}`} className={styles.title}>{task.title}</h2>
                    <div className={styles.metadata}>
                        <span className={styles.status}>{statusName(task)}</span>
                        {task.due_date && <span className={styles.deadline}><CalendarDays size={13} /> 期限 {task.due_date}</span>}
                        {task.today_date && <span className={styles.status}>予定 {task.today_date}</span>}
                        {task.importance_level != null && <span className={styles.status}>重要度 {task.importance_label || task.importance_level}</span>}
                    </div>
                    {ancestors.some(parent => parent.due_date) && <div className={styles.ancestorDates}>{ancestors.filter(parent => parent.due_date).map(parent => <div key={parent.id}><CalendarDays size={13} /><span>{parent.title}：{parent.due_date}</span></div>)}</div>}
                    {!task.archived_at && ![3, 5].includes(Number(task.status_code)) && <div className={styles.workActions}>
                        {Number(task.status_code) !== 2 && <button type="button" className={styles.primaryButton} disabled={saving} onClick={() => changeStatus(2)}><Play size={14} /> 着手</button>}
                        <button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => changeStatus(3)}><Check size={14} /> 完了</button>
                        {descendants.some(item => !item.archived_at && ![3, 5].includes(Number(item.status_code))) && <span className={styles.hint}>子タスク 未完了 {descendants.filter(item => !item.archived_at && ![3, 5].includes(Number(item.status_code))).length}件</span>}
                    </div>}
                    <button ref={attributesRef} type="button" className={styles.attributeButton} onClick={openAttributes} disabled={saving}><Settings2 size={14} /> 属性を編集</button>

                    <details className={styles.section} open={!task.notes || undefined}>
                        <summary>最初の記録</summary>
                        <p className={styles.original} ref={originalRef} onMouseUp={selectOriginal} onKeyUp={selectOriginal}>{task.capture_text || task.title}</p>
                        <label className={styles.sourceLabel} htmlFor={`work-source-${taskId}`}>出どころ</label>
                        <input id={`work-source-${taskId}`} value={draft.source_ref} disabled={saving} onChange={event => changeField('source_ref', event.target.value)} />
                    </details>

                    <section className={styles.section}>
                        <div className={styles.sectionHeading}><label htmlFor={`work-notes-${taskId}`}>作業メモ</label></div>
                        <textarea id={`work-notes-${taskId}`} ref={notesRef} rows={4} value={draft.notes} onChange={event => changeField('notes', event.target.value)} onSelect={selectNotes} disabled={saving} />
                        {selectedText && <div className={styles.selectionActions}><button type="button" className={styles.textButton} disabled={saving} onClick={() => startChild(selectedText)}><Plus size={13} /> 子タスクにする</button></div>}
                    </section>

                    {(descendants.length > 0 || draft.next_task_id) && <section className={styles.section}>
                        <label className={styles.sectionLabel} htmlFor={`work-next-${taskId}`}>次の作業</label>
                        <div className={styles.nextRow}><select id={`work-next-${taskId}`} value={draft.next_task_id} disabled={saving} onChange={event => changeField('next_task_id', event.target.value)}>
                            <option value="">未選択</option>
                            {draft.next_task_id && !nextTask && <option value={draft.next_task_id}>参照先なし</option>}
                            {descendants.filter(item => !item.archived_at || String(item.id) === draft.next_task_id).map(item => <option value={item.id} key={item.id} disabled={!!item.archived_at || [3, 5].includes(Number(item.status_code))}>{'› '.repeat(Math.min(Math.max((item.depth || 1) - 1, 0), 5))}{item.title}{Number(item.status_code) === 3 ? '（完了）' : Number(item.status_code) === 5 ? '（キャンセル）' : item.archived_at ? '（アーカイブ済み）' : ''}</option>)}
                        </select><button type="button" className={styles.openButton} disabled={!nextTask || saving} onClick={() => leave(() => callbacks.current.onOpenTask(nextTask.id))} aria-label="次の作業を開く"><ArrowRight size={18} /></button></div>
                    </section>}

                    <section className={styles.section}>
                        <div className={styles.sectionHeading}><h3>子タスク</h3>{!childOpen && <button type="button" className={styles.textButton} aria-label="子タスクを追加" disabled={saving || !!task.archived_at} onClick={() => startChild()}><Plus size={14} /> 追加</button>}</div>
                        {descendants.length > 0 && <ul className={styles.tree}>{descendants.map(item => <li key={item.id} style={{ '--work-depth': Math.min(Math.max((item.depth || 1) - 1, 0), 5) }}><button type="button" disabled={saving} onClick={() => leave(() => callbacks.current.onOpenTask(item.id))}><span className={styles.treeTitle}>{item.title}</span><span className={styles.treeMeta}>{statusName(item)}{item.due_date && ` · 期限 ${item.due_date}`}{item.waiting_on && ` · 待ち ${item.waiting_on}`}</span><ChevronRight size={14} /></button></li>)}</ul>}
                        {childOpen && <form className={styles.childForm} onSubmit={addChild}><label htmlFor={`work-child-${taskId}`}>子タスク</label><textarea id={`work-child-${taskId}`} rows={3} value={childText} onChange={event => changeChild(event.target.value)} disabled={saving} /><div className={styles.childActions}><button type="submit" disabled={!childText.trim() || saving} className={styles.primaryButton}>追加</button><button type="button" className={styles.textButton} disabled={saving} onClick={() => { changeChild(''); setChildOpen(false); setError(''); }}>取消</button></div></form>}
                    </section>

                    <details className={styles.section} open={!!task.waiting_on || !!task.review_date || undefined}>
                        <summary>待ち</summary>
                        <div className={styles.waitFields}><label>相手・条件<input value={draft.waiting_on} onChange={event => changeField('waiting_on', event.target.value)} disabled={saving} /></label><label>確認日<input type="date" value={draft.review_date} onChange={event => changeField('review_date', event.target.value)} disabled={saving} /></label></div>
                    </details>

                </>}
            </div>
            <footer className={styles.footer}><span role="status" className={dirty ? styles.unsaved : styles.muted}>{saving ? '保存中…' : dirty ? '未保存' : saved ? '保存しました' : '保存済み'}</span><div className={styles.footerActions}>{Number(task?.status_code) === 2 && <button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => leave(() => callbacks.current.onClose?.())}><Pause size={14} /> 保存して中断</button>}<button type="button" className={styles.primaryButton} disabled={!dirty || saving || !task} onClick={persist}><Save size={14} /> 保存</button></div></footer>
        </section>
        {editOpen && task && <TaskEditModal task={{ ...task, ...draft }} onClose={() => setEditOpen(false)} onSaved={attributesSaved} />}
    </>;
}
