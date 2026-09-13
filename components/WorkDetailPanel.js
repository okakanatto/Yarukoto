'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, Clock3, Paperclip, Pause, Pencil, Play, Plus, Save, Settings2, Sun, X } from 'lucide-react';
import TaskEditModal from './TaskEditModal';
import { useStatusActions } from '@/hooks/useStatusActions';
import { createCapturedTask, finishWorkStep, loadTaskContext, rememberTask, resolveWaiting, saveWorkContext, setTaskPlan, stampWorkStarted } from '@/lib/workspace';
import { useWorkNavigationGuard } from '@/hooks/useWorkNavigationGuard';
import { classifyWorkReference, openWorkReference } from '@/lib/workReferences';
import { clearWorkDraft, readWorkDraft, writeWorkDraft } from '@/lib/workDrafts';
import { isWaiting } from '@/lib/workViews';
import { workSummary } from '@/lib/workEntries';
import styles from './WorkDetailPanel.module.css';

// Navigation saves first; a local recovery copy also survives an unexpected close.
const fieldsFrom = task => ({
    title: task.title || '', notes: task.notes || '', source_ref: task.source_ref || '', next_step: task.next_step || '',
    waiting_on: task.waiting_on || '', review_date: task.review_date || '',
    next_task_id: task.next_task_id == null ? '' : String(task.next_task_id),
});
const changedFields = (draft, baseline) => Object.fromEntries(
    Object.entries(draft || {}).filter(([key, value]) => value !== baseline?.[key])
);
const statusName = task => task.status_label || ({ 1: '未着手', 2: '着手中', 3: '完了', 4: '保留', 5: 'キャンセル' }[task.status_code]) || '未設定';
const SMALL_STARTS = [
    ['不明点を一つ書く', () => '分からない点を一つ書き出す'],
    ['送らずに下書きする', () => '下書きを一文だけ書く（まだ送らない）'],
    ['一つだけ試す', () => '一件だけ試し、続け方を決める'],
];

export default function WorkDetailPanel(props) {
    return <WorkDetailSession key={props.taskId} {...props} />;
}

function WorkDetailSession({ taskId, onClose, onChanged, onOpenTask, embedded = false, navigationRef, ...props }) {
    const [currentId, setCurrentId] = useState(taskId);
    return <WorkDetailContent key={currentId} taskId={currentId} onClose={onClose} onChanged={onChanged}
        onOpenTask={onOpenTask || setCurrentId} embedded={embedded} navigationRef={navigationRef} {...props} />;
}

function WorkDetailContent({ taskId, onClose, onChanged, onOpenTask, embedded, navigationRef, onWorkStarted, onFocusChange, startRequested }) {
    const [context, setContext] = useState(null);
    const [draft, setDraft] = useState(null);
    const [baseline, setBaseline] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [autosaving, setAutosaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [childText, setChildText] = useState(() => readWorkDraft(taskId)?.childText || '');
    const [childOpen, setChildOpen] = useState(() => !!readWorkDraft(taskId)?.childText);
    const [draftWarning, setDraftWarning] = useState('');
    const [selectedText, setSelectedText] = useState('');
    const [sourceEditing, setSourceEditing] = useState(false);
    const [titleEditing, setTitleEditing] = useState(false);
    const [focused, setFocused] = useState(false);
    const [startHelp, setStartHelp] = useState(false);
    const [smallStarting, setSmallStarting] = useState(false);
    const [entryStep, setEntryStep] = useState('');
    const [customEntry, setCustomEntry] = useState('');
    const smallStartRef = useRef(false);
    const [sessionStarted, setSessionStarted] = useState(null);
    const [sessionMinutes, setSessionMinutes] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const [checkpoint, setCheckpoint] = useState(() => readWorkDraft(taskId)?.checkpoint || null);
    const [checkpointSaving, setCheckpointSaving] = useState(false);
    const [today, setToday] = useState(() => new Date().toLocaleDateString('sv-SE'));
    const panelRef = useRef(null);
    const notesRef = useRef(null);
    const originalRef = useRef(null);
    const attributesRef = useRef(null);
    const wasEditing = useRef(false);
    const pendingRef = useRef(false);
    const savePromiseRef = useRef(null);
    const checkpointSaveRef = useRef(null);
    const checkpointClosesRef = useRef(false);
    const checkpointInputRef = useRef(null);
    const bodyRef = useRef(null);
    const autosaveTimer = useRef(null);
    const persistRef = useRef(null);
    const childTextRef = useRef(childText);
    const checkpointRef = useRef(checkpoint);
    childTextRef.current = childText;
    checkpointRef.current = checkpoint;
    const startTokenRef = useRef(null);
    const reloadQueuedRef = useRef(false);
    const loadRequestRef = useRef(0);
    const draftRef = useRef(draft);
    const baselineRef = useRef(baseline);
    draftRef.current = draft;
    baselineRef.current = baseline;
    const statusFailedRef = useRef(false);
    const closeRef = useRef(null);
    const aliveRef = useRef(true);
    const callbacks = useRef({ onClose, onChanged, onOpenTask, onWorkStarted, onFocusChange });
    useEffect(() => { callbacks.current = { onClose, onChanged, onOpenTask, onWorkStarted, onFocusChange }; }, [onClose, onChanged, onOpenTask, onWorkStarted, onFocusChange]);

    const dirty = Object.keys(changedFields(draft, baseline)).length > 0;
    const task = context?.task;
    const descendants = context?.descendants || [];
    const ancestors = context?.ancestors || [];
    const nextTask = descendants.find(item => String(item.id) === draft?.next_task_id);
    const reference = classifyWorkReference(draft?.source_ref || '');
    const unfinished = descendants.filter(item => !item.archived_at && ![3, 5].includes(Number(item.status_code)));
    const active = task && !task.archived_at && ![3, 5].includes(Number(task.status_code));
    const nextBlocked = nextTask && (isWaiting(nextTask) || nextTask.archived_at || [3, 5].includes(Number(nextTask.status_code)) || nextTask.start_date > today || nextTask.today_date > today);
    useEffect(() => {
        if (focused && !startHelp) { notesRef.current?.focus(); const end = notesRef.current?.value.length || 0; notesRef.current?.setSelectionRange(end, end); }
    }, [focused, startHelp]);
    const ignoreOptimisticUpdate = useCallback(() => {}, []);
    const statusFailed = useCallback(() => { statusFailedRef.current = true; }, []);
    const { handleStatusChange } = useStatusActions({ setTasks: ignoreOptimisticUpdate, fetchTasks: statusFailed, refresh: ignoreOptimisticUpdate });

    const load = useCallback(async (replaceDraft = false, external = false) => {
        const request = ++loadRequestRef.current;
        try {
            const result = await loadTaskContext(taskId);
            if (!aliveRef.current || request !== loadRequestRef.current) return;
            if (external && (pendingRef.current || savePromiseRef.current)) { reloadQueuedRef.current = true; return; }
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
        return () => { aliveRef.current = false; clearTimeout(autosaveTimer.current); callbacks.current.onFocusChange?.(false); };
    }, [taskId, load]);

    useEffect(() => {
        const refresh = () => {
            if (pendingRef.current || savePromiseRef.current) { reloadQueuedRef.current = true; return; }
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
            if (!dirty && !childText.trim() && !checkpoint) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [dirty, childText, checkpoint]);

    useEffect(() => {
        if (!sessionStarted) return;
        const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - sessionStarted) / 1000)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [sessionStarted]);

    const checkpointOpen = !!checkpoint;
    useEffect(() => {
        if (!checkpointOpen) return;
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
        checkpointInputRef.current?.focus({ preventScroll: true });
        callbacks.current.onFocusChange?.(true);
    }, [checkpointOpen]);

    function changeFields(values) {
        const next = { ...draftRef.current, ...values };
        draftRef.current = next;
        setDraft(next);
        setSaved(false);
        storeDraft({ fields: changedFields(next, baselineRef.current), childText: childTextRef.current, checkpoint: checkpointRef.current });
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(() => persistRef.current?.(), 650);
    }

    function changeField(key, value) { changeFields({ [key]: value }); }

    function storeDraft(value) {
        const recovery = { ...value };
        if (!recovery.checkpoint) delete recovery.checkpoint;
        const stored = writeWorkDraft(taskId, recovery);
        setDraftWarning(stored ? '' : '下書きの控えを保存できません。終了前に保存してください。');
    }

    function clearDraft() {
        if (!clearWorkDraft(taskId)) setDraftWarning('保存済みですが、下書きの控えを消せませんでした。');
        else setDraftWarning('');
    }

    function changeChild(value) {
        childTextRef.current = value;
        setChildText(value);
        storeDraft({ fields: changedFields(draftRef.current, baselineRef.current), childText: value, checkpoint: checkpointRef.current });
    }

    function persist() {
        clearTimeout(autosaveTimer.current);
        if (savePromiseRef.current) return savePromiseRef.current;
        if (pendingRef.current) return Promise.resolve(false);
        if (!Object.keys(changedFields(draftRef.current, baselineRef.current)).length) return Promise.resolve(true);
        setAutosaving(true);
        setError('');
        savePromiseRef.current = (async () => {
            try {
                // An edit made during an IPC write belongs to the next write, never
                // to the saved baseline. Navigation joins this loop through its end.
                while (true) {
                    const changes = changedFields(draftRef.current, baselineRef.current);
                    if (!Object.keys(changes).length) break;
                    if ('title' in changes && !changes.title.trim()) throw new Error('仕事の名前を入力してください。');
                    const payload = { ...changes };
                    if ('next_task_id' in payload) payload.next_task_id = payload.next_task_id ? Number(payload.next_task_id) : null;
                    await saveWorkContext(taskId, payload);
                    baselineRef.current = { ...baselineRef.current, ...changes };
                    if (aliveRef.current) {
                        setBaseline(baselineRef.current);
                        setContext(current => ({ ...current, task: { ...current.task, ...payload } }));
                    }
                    const remainder = changedFields(draftRef.current, baselineRef.current);
                    if (Object.keys(remainder).length || childTextRef.current.trim() || checkpointRef.current) {
                        storeDraft({ fields: remainder, childText: childTextRef.current, checkpoint: checkpointRef.current });
                    } else clearDraft();
                }
                if (aliveRef.current) { setSaved(true); callbacks.current.onChanged?.(); }
                return true;
            } catch (failure) {
                if (aliveRef.current) setError(`保存できませんでした。入力は残っています。${failure.message ? ` ${failure.message}` : ''}`);
                return false;
            } finally {
                savePromiseRef.current = null;
                if (aliveRef.current) { setAutosaving(false); finishPending(); }
            }
        })();
        return savePromiseRef.current;
    }
    persistRef.current = persist;

    async function canLeave() {
        if (checkpointSaveRef.current) {
            const closes = checkpointClosesRef.current;
            return await checkpointSaveRef.current && !closes;
        }
        if (pendingRef.current) return false;
        if (childText.trim()) {
            setError('子タスクが未追加です。追加または取消を選んでください。');
            return false;
        }
        if (checkpointRef.current) {
            return saveCheckpoint(false);
        }
        return persist();
    }

    useWorkNavigationGuard(canLeave, !editOpen);

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
        if (checkpointRef.current || pendingRef.current) return;
        changeChild(text);
        setChildOpen(true);
        setError('');
    }

    async function addChild(event) {
        event.preventDefault();
        if (!childText.trim() || pendingRef.current || checkpointRef.current || !task) return;
        if (!await persist() || pendingRef.current || checkpointRef.current) return;
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
        if (pendingRef.current || checkpointRef.current || !await persist() || pendingRef.current || checkpointRef.current) return;
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
        if (!task || pendingRef.current || checkpointRef.current || !await persist() || pendingRef.current || checkpointRef.current) return false;
        if (code === 3 && unfinished.length) { setError('未完了の子タスクがあります。子タスクを確認してください。'); return false; }
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
            return true;
        } catch (failure) {
            if (aliveRef.current) setError(`状態の更新中にエラーが発生しました。保存済みのメモは保持しています。${failure.message ? ` ${failure.message}` : ''}`);
            return false;
        } finally {
            finishPending();
        }
    }

    async function updateWork(action, { allowCheckpoint = false } = {}) {
        if (!task || pendingRef.current || (!allowCheckpoint && checkpointRef.current)) return false;
        if (!await persist() || pendingRef.current || (!allowCheckpoint && checkpointRef.current)) return false;
        pendingRef.current = true;
        setSaving(true);
        setError('');
        try {
            await action();
            if (!aliveRef.current) return;
            await load(true);
            callbacks.current.onChanged?.();
            return true;
        } catch (failure) {
            if (aliveRef.current) setError(`変更できませんでした。${failure.message || ''}`);
            return false;
        } finally {
            finishPending();
        }
    }

    async function openReference() {
        if (checkpointRef.current || !await persist() || checkpointRef.current) return;
        try { await openWorkReference(draft.source_ref); }
        catch (failure) { setError(`資料を開けませんでした。${failure.message || ''}`); }
    }

    function useSelectionAsStep() {
        if (checkpointRef.current || pendingRef.current) return;
        changeFields({ next_step: selectedText, next_task_id: '' });
        setSelectedText('');
    }

    function chooseChild(value) {
        if (checkpointRef.current) return;
        const fields = draftRef.current;
        // A reference is the step itself. Keep an earlier free step as a note,
        // rather than displaying two conflicting instructions for the same work.
        const previousStep = fields.next_step.trim();
        const notes = value && previousStep && !fields.notes.split('\n').includes(previousStep)
            ? `${fields.notes.trimEnd()}${fields.notes.trim() ? '\n\n' : ''}${previousStep}` : fields.notes;
        changeFields({ next_task_id: value, ...(value ? { next_step: '', notes } : {}) });
    }

    async function selectedTextToChild() {
        if (!selectedText || pendingRef.current || checkpointRef.current || !await persist() || pendingRef.current || checkpointRef.current) return;
        pendingRef.current = true;
        setSaving(true);
        try {
            const child = await createCapturedTask({ text: selectedText, source_ref: draftRef.current.source_ref, parent_id: taskId, project_id: task.project_id });
            const childId = child?.id ?? child;
            if (!Number.isInteger(Number(childId)) || Number(childId) <= 0) throw new Error('追加した子タスクを確認できませんでした。');
            chooseChild(String(childId));
            setSelectedText('');
            callbacks.current.onChanged?.();
            await load();
        } catch (failure) { setError(`子タスクを追加できませんでした。${failure.message || ''}`); }
        finally { finishPending(); }
        await persist();
    }

    async function startWork(minutes = null, openMaterial = false) {
        if (!active || pendingRef.current || checkpointRef.current) return false;
        if (isWaiting({ ...task, ...draftRef.current }) || nextBlocked || (draftRef.current.next_task_id && !nextTask)) {
            setError('今する一歩の待ち・予定を確認してください。');
            return false;
        }
        if (draftRef.current.next_task_id && draftRef.current.next_step) chooseChild(draftRef.current.next_task_id);
        if (!await persist() || pendingRef.current || checkpointRef.current) return false;
        const started = Number(task.status_code) === 2
            ? await updateWork(() => stampWorkStarted(taskId)) : await changeStatus(2);
        if (!started || !aliveRef.current) return false;
        setFocused(true);
        setSessionMinutes(minutes);
        setSessionStarted(Date.now());
        setElapsed(0);
        callbacks.current.onWorkStarted?.(taskId);
        callbacks.current.onFocusChange?.(true);
        notesRef.current?.focus();
        if (openMaterial && ['url', 'file'].includes(classifyWorkReference(draftRef.current.source_ref).kind)) await openReference();
        return true;
    }

    const startRef = useRef(startWork);
    startRef.current = startWork;
    useEffect(() => {
        if (!task || !startRequested || startTokenRef.current === startRequested.token) return;
        if (startRequested.help) {
            const timer = setTimeout(() => { startTokenRef.current = startRequested.token; setStartHelp(true); }, 0);
            return () => clearTimeout(timer);
        }
        startTokenRef.current = startRequested.token;
        void startRef.current(startRequested.minutes || null, !!startRequested.openReference);
    }, [task, startRequested]);

    async function beginSmall(makeStep) {
        if (smallStartRef.current || pendingRef.current || checkpointRef.current || nextTask) return;
        smallStartRef.current = true; setSmallStarting(true);
        const nextStep = makeStep(draftRef.current.title);
        try {
            if (await startWork()) { setEntryStep(nextStep); setStartHelp(false); notesRef.current?.focus(); }
        } finally { smallStartRef.current = false; if (aliveRef.current) setSmallStarting(false); }
    }

    function editCheckpoint(value) {
        checkpointRef.current = value;
        setCheckpoint(value);
        const fields = changedFields(draftRef.current, baselineRef.current);
        if (value || Object.keys(fields).length || childTextRef.current.trim()) storeDraft({ fields, childText: childTextRef.current, checkpoint: value });
        else clearDraft();
        setError('');
    }

    function openCheckpoint(stepCompleted = false) {
        if (pendingRef.current || checkpointRef.current) return;
        editCheckpoint({ result: '', next_step: stepCompleted ? '' : draftRef.current.next_step, stepCompleted });
    }

    function saveCheckpoint(close = true) {
        if (checkpointSaveRef.current) return checkpointSaveRef.current;
        const value = checkpointRef.current;
        if (!value) return Promise.resolve(true);
        checkpointClosesRef.current = close;
        setCheckpointSaving(true);
        checkpointSaveRef.current = (async () => {
            try {
                const success = await updateWork(() => finishWorkStep(taskId, {
                    result: value.result, stepCompleted: value.stepCompleted,
                    ...(draftRef.current.next_task_id ? {} : { next_step: value.next_step }),
                }), { allowCheckpoint: true });
                if (!success) return false;
                editCheckpoint(null);
                setSessionStarted(null); setEntryStep('');
                setFocused(false);
                callbacks.current.onFocusChange?.(false);
                if (close) callbacks.current.onClose?.();
                return true;
            } finally {
                checkpointSaveRef.current = null;
                checkpointClosesRef.current = false;
                if (aliveRef.current) setCheckpointSaving(false);
            }
        })();
        return checkpointSaveRef.current;
    }

    function renderOriginal() {
        return <details className={styles.originalSection} open={!task.notes && task.capture_text !== task.title || undefined}>
            <summary>最初の記録{task.created_at && <time>{task.created_at.slice(0, 16)}</time>}</summary>
            <p className={styles.original} ref={originalRef} onMouseUp={selectOriginal} onKeyUp={selectOriginal}>{task.capture_text || task.title}</p>
        </details>;
    }

    return <>
        {!embedded && <div className={styles.backdrop} onClick={() => leave(() => callbacks.current.onClose?.())} aria-hidden="true" />}
        <section className={`${styles.panel} ${embedded ? styles.embedded : ''} ${focused ? styles.focused : ''} ${checkpoint ? styles.checkpointMode : ''}`} ref={panelRef} role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby={`work-heading-${taskId}`} aria-hidden={editOpen || undefined}
            onBlur={event => { if (event.target.matches('input, textarea, select')) void persist(); }}>
            <span id={`work-heading-${taskId}`} className={styles.srOnly}>{draft?.title || task?.title || '仕事'}</span>
            <header className={styles.header}>
                <nav className={styles.breadcrumb} aria-label="仕事の階層">
                    <span>{task?.project_name || '仕事'}</span>{focused && <strong className={styles.currentTask}>{draft?.title}</strong>}
                    {ancestors.map(parent => <span className={styles.crumb} key={parent.id}><ChevronRight size={12} /><button type="button" disabled={saving} onClick={() => leave(() => callbacks.current.onOpenTask(parent.id))}>{parent.title}</button></span>)}
                </nav>
                <button ref={closeRef} type="button" className={styles.iconButton} aria-label="仕事の内容を閉じる" disabled={saving || checkpointSaving} onClick={() => leave(() => callbacks.current.onClose?.())}><X size={20} /></button>
            </header>
            <div className={styles.body} ref={bodyRef}>
                {loading && <p role="status" className={styles.muted}>読み込み中…</p>}
                {error && <div className={styles.error} role="alert">{error}{!task && <button type="button" onClick={() => load()}>再読み込み</button>}</div>}
                {draftWarning && <p className={styles.warning} role="alert">{draftWarning}</p>}
                {task && draft && <>
                    <div className={styles.titleRow}>{checkpoint ? <h2 className={styles.title}>{draft.title}</h2> : <>{titleEditing ? <input className={styles.titleInput} aria-label="仕事の名前" value={draft.title} autoFocus onChange={event => changeField('title', event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && draft.title.trim()) { void persist(); setTitleEditing(false); } }} onBlur={() => { if (draft.title.trim()) setTitleEditing(false); }} /> : <h2 className={styles.title} aria-label={draft.title}><button type="button" aria-label="仕事の名前を編集" onClick={() => setTitleEditing(true)}>{draft.title}<Pencil size={14} /></button></h2>}<button ref={attributesRef} type="button" className={styles.iconButton} aria-label="属性を編集" title="属性を編集" onClick={openAttributes} disabled={saving}><Settings2 size={18} /></button></>}</div>
                    <div className={styles.metadata}>
                        <span className={styles.status}>{statusName(task)}</span>
                        {task.due_date && <span className={styles.deadline}><CalendarDays size={13} />期限 {task.due_date}</span>}
                        {task.today_date && task.today_date !== today && <span className={styles.status}>予定 {task.today_date}</span>}
                        {Number(task.importance_level) >= 3 && <span className={styles.status}>重要</span>}
                        {task.waiting_on && <span className={styles.status}>待ち · {task.waiting_on}</span>}
                    </div>
                    {ancestors.some(parent => parent.due_date) && <div className={styles.ancestorDates}>{ancestors.filter(parent => parent.due_date).map(parent => <div key={parent.id}><CalendarDays size={13} /><span>{parent.title}：{parent.due_date}</span></div>)}</div>}
                    {!checkpoint && !startHelp && <>{active && !focused && <div className={styles.workActions}>
                        <button type="button" className={styles.primaryButton} disabled={saving || !!checkpoint} onClick={() => startWork(null, reference.kind !== 'text')}><Play size={14} />{reference.kind !== 'text' ? '資料を開いて始める' : Number(task.status_code) === 2 ? '再開する' : '取りかかる'}</button>
                        <button type="button" className={styles.secondaryButton} disabled={saving || !!checkpoint} onClick={() => startWork(5)}><Clock3 size={14} />5分だけ</button><button type="button" className={styles.textButton} disabled={saving} onClick={() => setStartHelp(true)}>はじめ方を小さくする</button>
                    </div>}
                    {focused && <div className={styles.focusBar}><span><span className={styles.liveDot} />作業中{sessionMinutes && <time aria-label="作業の経過時間">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} / {sessionMinutes}:00</time>}</span><button type="button" className={styles.secondaryButton} disabled={saving || !!checkpoint} onClick={() => openCheckpoint()}><Pause size={14} />区切る</button></div>}

                    {focused && entryStep && <div className={styles.entryStep}><small>今回だけ</small><p>{entryStep}</p><button type="button" onClick={() => setEntryStep('')}>本来の一歩へ<ArrowRight size={14} /></button></div>}
                    <div className={styles.referenceLine}>
                        <Paperclip size={15} aria-hidden="true" />
                        {sourceEditing ? <><input aria-label="出どころ" autoFocus value={draft.source_ref} disabled={saving} placeholder="資料の場所・URL" onChange={event => changeField('source_ref', event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setSourceEditing(false); } }} /><button className={styles.iconButton} aria-label="資料の編集を終える" type="button" disabled={saving} onClick={() => setSourceEditing(false)}><Check size={16} /></button></> : draft.source_ref ? <>{reference.kind !== 'text' ? <button type="button" className={styles.referenceLink} disabled={saving} onClick={openReference} title={draft.source_ref}>{reference.label}<ArrowUpRight size={14} /></button> : <span className={styles.referenceText}>{draft.source_ref}</span>}<button type="button" className={styles.iconButton} aria-label="資料を編集" title="資料を編集" disabled={saving} onClick={() => setSourceEditing(true)}><Pencil size={14} /></button></> : <button type="button" className={styles.textButton} disabled={saving} onClick={() => setSourceEditing(true)}>資料を追加</button>}
                    </div>

                    <section className={styles.nextStep}>
                        {nextTask ? <><span className={styles.stepLabel}>今する一歩</span><button type="button" className={styles.nextTaskLink} disabled={saving} onClick={() => { if (draftRef.current.next_step) chooseChild(String(nextTask.id)); void leave(() => callbacks.current.onOpenTask(nextTask.id)); }}>{nextTask.title}<ArrowRight size={16} /></button><button type="button" className={styles.textButton} disabled={saving} onClick={() => chooseChild('')}>一歩を変更</button></> : <><label htmlFor={`work-step-${taskId}`}>{entryStep ? '本来の一歩' : '今する一歩'}</label><textarea id={`work-step-${taskId}`} rows={1} value={draft.next_step} placeholder="最初の一歩（任意）" disabled={saving} onChange={event => changeField('next_step', event.target.value)} /></>}
                        {focused && !entryStep && !nextTask && draft.next_step.trim() && <button type="button" className={styles.stepDone} disabled={saving || !!checkpoint} onClick={() => openCheckpoint(true)}><Check size={15} />一歩を終える</button>}
                    </section></>}

                    {startHelp && !checkpoint && <section className={styles.startHelp} aria-label="はじめ方を小さくする">
                        <button type="button" className={styles.textButton} disabled={smallStarting} onClick={() => setStartHelp(false)}>戻る</button>
                        <h3>はじめ方を小さくする</h3>
                        {!nextTask && draft.next_step && <p className={styles.originalStep}>{draft.next_step}</p>}
                        {nextTask ? <><p>{nextTask.title}{nextBlocked && ' · 待ち・予定を確認'}</p><button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => leave(() => callbacks.current.onOpenTask(nextTask.id))}>この一歩を開く<ArrowRight size={15} /></button></>
                            : <><div className={styles.startOptions}>{reference.kind !== 'text' && <button type="button" disabled={saving || smallStarting} onClick={async () => { if (await startWork(null, true)) { setEntryStep('資料を開いて、作業する箇所を見る'); setStartHelp(false); } }}>資料を開いて見る<ArrowRight size={16} /></button>}{SMALL_STARTS.map(([label, makeStep]) => <button key={label} type="button" disabled={saving || smallStarting || isWaiting({ ...task, ...draft })} onClick={() => beginSmall(makeStep)}>{label}<ArrowRight size={16} /></button>)}</div><form className={styles.entryForm} onSubmit={event => { event.preventDefault(); if (customEntry.trim()) void beginSmall(() => customEntry.trim()); }}><input aria-label="今回だけの小さい着手" placeholder="今回だけの一歩" value={customEntry} onChange={event => setCustomEntry(event.target.value)} /><button type="submit" disabled={!customEntry.trim() || saving || smallStarting}>始める</button></form></>}
                    </section>}
                    {checkpoint && <form className={styles.checkpoint} onSubmit={event => { event.preventDefault(); void saveCheckpoint(); }}><h3>{checkpoint.stepCompleted ? '一歩を終える' : '区切る'}</h3><label>進んだこと（任意）<textarea ref={checkpointInputRef} rows={2} value={checkpoint.result} disabled={saving || checkpointSaving} onChange={event => editCheckpoint({ ...checkpoint, result: event.target.value })} autoFocus /></label>{!nextTask && <label>次の一歩（任意）<input value={checkpoint.next_step} disabled={saving || checkpointSaving} onChange={event => editCheckpoint({ ...checkpoint, next_step: event.target.value })} /></label>}<div className={styles.childActions}><button type="submit" className={styles.primaryButton} disabled={saving || checkpointSaving}>{checkpointSaving ? '保存中…' : checkpoint.stepCompleted ? '記録する' : '保存して中断'}</button><button type="button" className={styles.textButton} disabled={saving || checkpointSaving} onClick={() => { editCheckpoint(null); callbacks.current.onFocusChange?.(focused); }}>戻る</button></div></form>}

                    {!checkpoint && !startHelp && <>{!task.notes && renderOriginal()}

                    {workSummary(task).latestUpdate?.kind === 'result' && <div className={styles.latestResult}><small>前回の結果</small><p>{workSummary(task).latestUpdate.text}</p></div>}
                    <section className={styles.notesSection}>
                        <label htmlFor={`work-notes-${taskId}`}>作業メモ</label>
                        <textarea id={`work-notes-${taskId}`} ref={notesRef} rows={Math.min(14, Math.max(4, (draft.notes.match(/\n/g)?.length || 0) + 2))} value={draft.notes} placeholder="メモ…" onChange={event => changeField('notes', event.target.value)} onSelect={selectNotes} disabled={saving} />
                        {selectedText && <div className={styles.selectionActions}><span>選択した文</span><button type="button" className={styles.textButton} disabled={saving} onClick={useSelectionAsStep}><ArrowRight size={13} />今する一歩に</button><button type="button" className={styles.textButton} disabled={saving} onClick={selectedTextToChild}><Plus size={13} />子タスクにする</button></div>}
                    </section>
                    {task.notes && renderOriginal()}
                    {nextTask && draft.next_step && <details className={styles.originalSection}><summary>以前の一歩</summary><p className={styles.original}>{draft.next_step}</p></details>}
                    {context.entries?.length > 0 && <details className={styles.section}><summary>作業の記録<span className={styles.summaryHint}>{context.entries.length}</span></summary><ol className={styles.entries}>{context.entries.map(entry => <li key={entry.id}><time>{entry.created_at?.slice(0, 16)}</time>{entry.consumed_step && <p><Check size={13} />{entry.consumed_step}</p>}{entry.result && <p>{entry.result}</p>}{entry.kind === 'memo' ? <details><summary>メモを更新</summary><p>{entry.memo}</p></details> : !entry.result && !entry.consumed_step && <p>中断</p>}</li>)}</ol></details>}

                    <details className={styles.management} open={!focused || undefined}><summary>管理</summary>
                    {active && <div className={styles.workActions}>
                        <button type="button" className={`${styles.secondaryButton} ${task.today_date === today ? styles.selected : ''}`} aria-pressed={task.today_date === today} disabled={saving} onClick={() => updateWork(() => setTaskPlan(taskId, task.today_date === today ? null : today))}><Sun size={14} />{task.today_date === today ? '今日から外す' : '今日やる'}</button>
                        <button type="button" className={styles.completionButton} disabled={saving} onClick={() => changeStatus(3)}><Check size={14} />仕事全体を完了</button>
                        {unfinished.length > 0 && <span className={styles.childCount}>子タスク 未完了 {unfinished.length}件</span>}
                    </div>}

                    <details className={styles.section} open={!!task.waiting_on || !!task.review_date || Number(task.status_code) === 4 || undefined}>
                        <summary>待ち{task.waiting_on && <span className={styles.summaryHint}>{task.waiting_on}</span>}</summary>
                        <div className={styles.waitFields}><label>相手・条件<input value={draft.waiting_on} onChange={event => changeField('waiting_on', event.target.value)} disabled={saving} /></label><label>確認日<input type="date" value={draft.review_date} onChange={event => changeField('review_date', event.target.value)} disabled={saving} /></label></div>
                        {(draft.waiting_on || draft.review_date || Number(task.status_code) === 4) && <button type="button" className={styles.textButton} disabled={saving} onClick={() => updateWork(() => resolveWaiting(taskId))}><Check size={14} />待ちを解消</button>}
                    </details>

                    <details className={styles.section} open={childOpen || undefined}>
                        <summary>子タスク{descendants.length > 0 && <span className={styles.summaryHint}>{unfinished.length} / {descendants.length} 未完了</span>}</summary>
                        <div className={styles.childTools}>{!childOpen && <button type="button" className={styles.textButton} aria-label="子タスクを追加" disabled={saving || !!task.archived_at} onClick={() => startChild()}><Plus size={14} />追加</button>}</div>
                        {(descendants.length > 0 || draft.next_task_id) && <div className={styles.nextRow}><label htmlFor={`work-next-${taskId}`}>一歩にする子タスク</label><select id={`work-next-${taskId}`} value={draft.next_task_id} disabled={saving} onChange={event => chooseChild(event.target.value)}>
                            <option value="">未選択</option>
                            {draft.next_task_id && !nextTask && <option value={draft.next_task_id}>参照先なし</option>}
                            {descendants.filter(item => !item.archived_at || String(item.id) === draft.next_task_id).map(item => <option value={item.id} key={item.id} disabled={!!item.archived_at || [3, 5].includes(Number(item.status_code))}>{'› '.repeat(Math.min(Math.max((item.depth || 1) - 1, 0), 5))}{item.title}{Number(item.status_code) === 3 ? '（完了）' : Number(item.status_code) === 5 ? '（キャンセル）' : item.archived_at ? '（アーカイブ済み）' : ''}</option>)}
                        </select></div>}
                        {descendants.length > 0 && <ul className={styles.tree}>{descendants.map(item => <li key={item.id} style={{ '--work-depth': Math.min(Math.max((item.depth || 1) - 1, 0), 5) }}><button type="button" disabled={saving} onClick={() => leave(() => callbacks.current.onOpenTask(item.id))}><span className={styles.treeTitle}>{item.title}</span><span className={styles.treeMeta}>{statusName(item)}{item.due_date && ` · 期限 ${item.due_date}`}{item.waiting_on && ` · 待ち ${item.waiting_on}`}</span><ChevronRight size={14} /></button></li>)}</ul>}
                        {childOpen && <form className={styles.childForm} onSubmit={addChild}><label htmlFor={`work-child-${taskId}`}>子タスク</label><textarea id={`work-child-${taskId}`} rows={3} value={childText} onChange={event => changeChild(event.target.value)} disabled={saving} /><div className={styles.childActions}><button type="submit" disabled={!childText.trim() || saving} className={styles.primaryButton}>追加</button><button type="button" className={styles.textButton} disabled={saving} onClick={() => { changeChild(''); setChildOpen(false); setError(''); }}>取消</button></div></form>}
                    </details>
                    </details>
                    </>}
                </>}
            </div>
            {!checkpoint && <footer className={styles.footer}><span role="status" className={dirty ? styles.unsaved : styles.muted}>{saving || autosaving ? '保存中…' : dirty ? '未保存' : saved ? '保存済み' : ''}</span><button type="button" className={styles.saveButton} disabled={!dirty || saving || !task} onClick={persist}><Save size={14} />保存</button></footer>}
        </section>
        {editOpen && task && <TaskEditModal task={{ ...task, ...draft }} onClose={() => setEditOpen(false)} onSaved={attributesSaved} />}
    </>;
}
