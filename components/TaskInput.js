'use client';

import { useState, useRef, useEffect } from 'react';
import CalendarPicker from './CalendarPicker';
import TagSelect from './TagSelect';
import { useMasterData } from '../hooks/useMasterData';
import { fetchDb } from '@/lib/utils';

// A closed/reopened FAB shares the unfinished save instead of submitting again.
const activeSaves = new Map();

export default function TaskInput(props) {
    const context = props.draftKey || (props.predefinedParentId ? `child:${props.predefinedParentId}` : props.defaultProjectId ? `project:${props.defaultProjectId}` : 'tasks');
    const storageKey = `yarukoto:task-input-draft:v1:${context}`;
    return <TaskInputForm key={storageKey} {...props} storageKey={storageKey} />;
}

function TaskInputForm({ onTaskAdded, predefinedParentId = null, defaultProjectId = null, autoFocus = false, storageKey }) {
    const [title, setTitle] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const titleInputRef = useRef(null);
    const [draftReady, setDraftReady] = useState(false);
    const [draftWarning, setDraftWarning] = useState('');
    const [pendingTask, setPendingTask] = useState(null);
    const pendingTaskRef = useRef(null);
    const [recoveryIssue, setRecoveryIssue] = useState(null);
    const savedRef = useRef(false);

    const [dueDate, setDueDate] = useState('');
    const [startDate, setStartDate] = useState('');
    const [importance, setImportance] = useState('');
    const [urgency, setUrgency] = useState('');
    const [estimatedMinutes, setEstimatedMinutes] = useState('');
    const [notes, setNotes] = useState('');
    const [sourceRef, setSourceRef] = useState('');
    const [showSource, setShowSource] = useState(false);
    const [selectedTags, setSelectedTags] = useState([]);
    const [parentId, setParentId] = useState('');
    const [parentOptions, setParentOptions] = useState([]);

    const { masters, tags: allTags, projects } = useMasterData();
    const [projectId, setProjectId] = useState(defaultProjectId ? String(defaultProjectId) : '');

    // Restore after hydration. The keyed form keeps project/parent drafts isolated.
    useEffect(() => {
        let cancelled = false;
        const restore = () => {
            if (cancelled) return;
            try {
                const stored = localStorage.getItem(storageKey);
                if (stored) {
                    const draft = JSON.parse(stored);
                    const text = name => typeof draft[name] === 'string' ? draft[name] : '';
                    setTitle(text('title')); setDueDate(text('dueDate')); setStartDate(text('startDate'));
                    setImportance(text('importance')); setUrgency(text('urgency')); setEstimatedMinutes(text('estimatedMinutes'));
                    setNotes(text('notes')); setSourceRef(text('sourceRef')); setParentId(text('parentId'));
                    if (text('projectId')) setProjectId(text('projectId'));
                    setSelectedTags(Array.isArray(draft.selectedTags) ? draft.selectedTags.filter(Number.isSafeInteger) : []);
                    setIsExpanded(!!draft.isExpanded); setShowSource(!!draft.showSource || !!text('sourceRef'));
                    if (Number.isSafeInteger(draft.pendingTask?.id) && draft.pendingTask.id > 0) {
                        pendingTaskRef.current = draft.pendingTask;
                        setPendingTask(draft.pendingTask);
                    }
                }
            } catch (error) {
                console.error('Draft restore failed:', error);
                setDraftWarning('下書きを読み込めませんでした。');
            }
            setDraftReady(true);
        };
        const previousSave = activeSaves.get(storageKey);
        if (previousSave) previousSave.then(restore);
        else restore();
        return () => { cancelled = true; };
    }, [storageKey]);

    const persistDraft = (draft) => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(draft));
            setDraftWarning('');
        } catch (error) {
            console.error('Draft save failed:', error);
            setDraftWarning('下書きを保存できません。閉じる前に記録してください。');
        }
    };

    const draftSnapshot = (overrides = {}) => ({
        title, dueDate, startDate, importance, urgency, estimatedMinutes, notes,
        sourceRef, selectedTags, parentId, projectId, isExpanded, showSource,
        pendingTask: pendingTaskRef.current, ...overrides,
    });

    // A draft can outlive its tags or its partially saved task. Validate against
    // the DB, not the master-data snapshot from when the input was first opened.
    const findSaveIssue = async (db) => {
        if (pendingTaskRef.current) {
            const existing = await db.select('SELECT id, capture_text FROM tasks WHERE id = $1', [pendingTaskRef.current.id]);
            if (!existing.length) return { type: 'missing-task' };
            if (existing[0].capture_text !== title) return { type: 'changed-task' };
        }
        if (selectedTags.length) {
            const rows = await db.select('SELECT id FROM tags');
            const validIds = new Set(rows.map(row => row.id));
            const missingIds = selectedTags.filter(id => !validIds.has(id));
            if (missingIds.length) return { type: 'missing-tags', missingIds };
        }
        return null;
    };

    const removeMissingTags = () => {
        if (isSubmittingRef.current || recoveryIssue?.type !== 'missing-tags') return;
        const remaining = selectedTags.filter(id => !recoveryIssue.missingIds.includes(id));
        setSelectedTags(remaining);
        setRecoveryIssue(null);
        // Keep the confirmed task ID and every other input, including its raw
        // capture, even if this recovery action is immediately followed by close.
        persistDraft(draftSnapshot({ selectedTags: remaining }));
    };

    const returnToDraft = () => {
        if (isSubmittingRef.current || !['missing-task', 'changed-task'].includes(recoveryIssue?.type)) return;
        pendingTaskRef.current = null;
        setPendingTask(null);
        setRecoveryIssue(null);
        persistDraft(draftSnapshot({ pendingTask: null }));
        // Never recreate a deleted task automatically. The original stays in
        // the editable draft until the user chooses to record it again.
    };

    useEffect(() => {
        if (!draftReady) return;
        const defaultId = defaultProjectId ? String(defaultProjectId) : String(projects.find(project => project.is_default === 1)?.id || '');
        const hasContent = title || dueDate || startDate || importance || urgency || estimatedMinutes || notes || sourceRef || parentId || selectedTags.length || pendingTask || (!predefinedParentId && projectId && projectId !== defaultId);
        if (savedRef.current && !hasContent) return;
        if (hasContent) savedRef.current = false;
        try {
            // An explicitly emptied draft also replaces its previous content.
            if (hasContent || localStorage.getItem(storageKey)) {
                persistDraft({ title, dueDate, startDate, importance, urgency, estimatedMinutes, notes, sourceRef, selectedTags, parentId, projectId, isExpanded, showSource, pendingTask });
            }
        } catch (error) {
            console.error('Draft storage unavailable:', error);
            setDraftWarning('下書きを保存できません。閉じる前に記録してください。');
        }
    }, [draftReady, title, dueDate, startDate, importance, urgency, estimatedMinutes, notes, sourceRef, selectedTags, parentId, projectId, isExpanded, showSource, pendingTask, storageKey, defaultProjectId, predefinedParentId, projects]); // eslint-disable-line react-hooks/exhaustive-deps

    // IMP-36: Auto-select default project (Inbox) when no explicit project context
    useEffect(() => {
        if (!draftReady || defaultProjectId || predefinedParentId) return;
        if (projects.length > 0 && !projectId) {
            const defaultProj = projects.find(p => p.is_default === 1);
            if (defaultProj) setProjectId(String(defaultProj.id));
        }
    }, [projects, defaultProjectId, predefinedParentId, draftReady]); // eslint-disable-line react-hooks/exhaustive-deps

    // IMP-23: Auto-focus title input when autoFocus prop is true (FAB modal)
    useEffect(() => {
        if (autoFocus && titleInputRef.current) {
            const timer = setTimeout(() => titleInputRef.current?.focus(), 100);
            return () => clearTimeout(timer);
        }
    }, [autoFocus]);

    // Fetch eligible parent tasks when the form expands (only for root task creation)
    useEffect(() => {
        if (!isExpanded || predefinedParentId) return;
        let cancelled = false;
        (async () => {
            try {
                const db = await fetchDb();
                const rows = await db.select(
                    'SELECT id, title FROM tasks WHERE status_code != 3 AND status_code != 5 AND archived_at IS NULL ORDER BY title'
                );
                if (!cancelled) setParentOptions(rows);
            } catch (e) {
                console.error('Failed to fetch parent tasks:', e);
            }
        })();
        return () => { cancelled = true; };
    }, [isExpanded, predefinedParentId]);

    // For inline child creation, inherit parent's project_id
    useEffect(() => {
        if (!predefinedParentId) return;
        let cancelled = false;
        (async () => {
            try {
                const db = await fetchDb();
                const rows = await db.select('SELECT project_id FROM tasks WHERE id = $1', [predefinedParentId]);
                if (!cancelled && rows[0]?.project_id) setProjectId(String(rows[0].project_id));
            } catch (e) { console.error('Failed to fetch parent project:', e); }
        })();
        return () => { cancelled = true; };
    }, [predefinedParentId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!draftReady || !title.trim() || isSubmittingRef.current || activeSaves.has(storageKey)) return;

        let releaseSave;
        const currentSave = new Promise(resolve => { releaseSave = resolve; });
        activeSaves.set(storageKey, currentSave);

        isSubmittingRef.current = true;
        setSubmitting(true);
        setRecoveryIssue(null);
        const actualParentId = pendingTaskRef.current?.parentId ?? ((parentId ? parseInt(parentId) : null) || predefinedParentId || null);

        try {
            const db = await fetchDb();
            const issue = await findSaveIssue(db);
            if (issue) {
                setRecoveryIssue(issue);
                return;
            }

            let newTaskId = pendingTaskRef.current?.id;
            if (!newTaskId) {
                // Calculate sort_order to insert at top of list (IMP-4)
                let newSortOrder = 0;
                if (actualParentId) {
                    const minSort = await db.select(
                        'SELECT MIN(sort_order) as min_so FROM tasks WHERE parent_id = $1 AND archived_at IS NULL',
                        [actualParentId]
                    );
                    newSortOrder = (minSort[0]?.min_so ?? 1) - 1;
                } else {
                    const minSort = await db.select(
                        'SELECT MIN(sort_order) as min_so FROM tasks WHERE parent_id IS NULL AND archived_at IS NULL'
                    );
                    newSortOrder = (minSort[0]?.min_so ?? 1) - 1;
                }

                // Resolve project_id: use selected, or default project
                let resolvedProjectId = projectId ? parseInt(projectId) : null;
                if (actualParentId) {
                    const parents = await db.select('SELECT project_id FROM tasks WHERE id = $1 AND archived_at IS NULL', [actualParentId]);
                    if (!parents.length) throw new Error('親タスクが見つかりません');
                    resolvedProjectId = parents[0].project_id;
                }
                if (!resolvedProjectId) {
                    const defaultProj = await db.select('SELECT id FROM projects WHERE is_default = 1 LIMIT 1');
                    resolvedProjectId = defaultProj[0]?.id || null;
                }

                // Insert task
                const result = await db.execute(`
                  INSERT INTO tasks (
                    title, parent_id, status_code, importance_level,
                    urgency_level, start_date, due_date, estimated_hours, notes, sort_order, project_id, capture_text, source_ref
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `, [
                    title.split(/\r\n|\r|\n/).find(line => line.trim())?.trim().slice(0, 100),
                    actualParentId,
                    1, // default status_code
                    importance ? parseInt(importance) : null,
                    urgency ? parseInt(urgency) : null,
                    startDate || null,
                    dueDate || null,
                    estimatedMinutes ? parseInt(estimatedMinutes) : null,
                    notes || '',
                    newSortOrder,
                    resolvedProjectId,
                    title,
                    sourceRef
                ]);

                newTaskId = result.lastInsertId;
                const committed = { id: newTaskId, parentId: actualParentId };
                pendingTaskRef.current = committed;
                setPendingTask(committed);
                // Persist the confirmed ID before any further await. Reopening this
                // form can finish tag/readback work without issuing another INSERT.
                persistDraft({ title, dueDate, startDate, importance, urgency, estimatedMinutes, notes, sourceRef, selectedTags, parentId, projectId, isExpanded, showSource, pendingTask: committed });
            }
            let finalTagIds = [...selectedTags];

            // Insert tags if any
            if (selectedTags.length > 0) {
                for (const tagId of selectedTags) {
                    await db.execute('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [newTaskId, tagId]);
                }
            }

            // --- BUG-1 修正: タグ継承ロジック ---
            if (actualParentId) {
                const settingRows = await db.select(
                    "SELECT value FROM app_settings WHERE key = 'inherit_parent_tags'"
                );
                if (settingRows.length > 0 && settingRows[0].value === '1') {
                    const parentTags = await db.select(
                        'SELECT tag_id FROM task_tags WHERE task_id = $1',
                        [actualParentId]
                    );
                    for (const row of parentTags) {
                        // すでに手動選択済みのタグはスキップ（INSERT OR IGNORE でDB側でもガードされるが念のため）
                        await db.execute(
                            'INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1, $2)',
                            [newTaskId, row.tag_id]
                        );
                        if (!finalTagIds.includes(row.tag_id)) {
                            finalTagIds.push(row.tag_id);
                        }
                    }
                }
            }
            // ----------------------------------

            // Fetch the newly created task to pass to the parent
            const newTasks = await db.select(`
                SELECT t.*,
                       im.label as importance_label, im.color as importance_color,
                       um.label as urgency_label, um.color as urgency_color,
                       sm.label as status_label, sm.color as status_color
                FROM tasks t
                LEFT JOIN importance_master im ON t.importance_level = im.level
                LEFT JOIN urgency_master um ON t.urgency_level = um.level
                LEFT JOIN status_master sm ON t.status_code = sm.code
                WHERE t.id = $1
            `, [newTaskId]);

            const newTask = newTasks[0];
            if (!newTask) throw new Error('記録済みのタスクを読み込めませんでした');
            // Format tags for the frontend data structure
            newTask.tags = finalTagIds.map(id => {
                const tagData = allTags.find(t => t.id === id);
                return { id, name: tagData?.name, color: tagData?.color };
            }).filter(t => t.name); // Filter out any empty tags just in case

            setSubmitSuccess(true);
            setTimeout(() => setSubmitSuccess(false), 1200);

            // Dispatch success toast
            window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                detail: { message: 'タスクを追加しました', type: 'success' }
            }));

            savedRef.current = true;
            pendingTaskRef.current = null;
            setPendingTask(null);
            try { localStorage.removeItem(storageKey); } catch (error) { console.error('Draft cleanup failed:', error); }
            resetForm();
            window.dispatchEvent(new CustomEvent('yarukoto:tasksChanged'));
            // Parent UI refresh failure cannot turn a completed DB save into a
            // failed capture or keep a draft that would be submitted again.
            try { await onTaskAdded?.(newTask); } catch (error) { console.error('Task added callback failed:', error); }
            setTimeout(() => titleInputRef.current?.focus(), 10);
        } catch (err) {
            console.error(err);
            // A tag/task can also disappear between validation and a later SQL
            // call. Offer the same recovery without unlocking a confirmed body.
            let issue = null;
            try { issue = await findSaveIssue(await fetchDb()); } catch (error) { console.error('Save recovery check failed:', error); }
            setRecoveryIssue(issue);
            if (!issue) window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                detail: { message: pendingTaskRef.current ? '本文は記録済みです。残りの保存を再試行してください。' : 'タスクの追加に失敗しました', type: 'error' }
            }));
        } finally {
            setSubmitting(false);
            isSubmittingRef.current = false;
            if (activeSaves.get(storageKey) === currentSave) activeSaves.delete(storageKey);
            releaseSave();
        }
    };

    const resetForm = () => {
        setTitle('');
        setDueDate('');
        setStartDate('');
        setImportance('');
        setUrgency('');
        setEstimatedMinutes('');
        setNotes('');
        setSourceRef('');
        setSelectedTags([]);
        setParentId('');
        // IMP-36: Reset to default project (Inbox) instead of empty
        if (!predefinedParentId && !defaultProjectId) {
            const defaultProj = projects.find(p => p.is_default === 1);
            setProjectId(defaultProj ? String(defaultProj.id) : '');
        }
        // setIsExpanded(false); // Removed to allow continuous input
    };

    // Calendar/tag controls include custom keyboard handlers, so fieldset alone
    // cannot prevent them from editing the frozen input during recovery.
    const editWhenReady = setter => value => {
        if (draftReady && !isSubmittingRef.current && !pendingTaskRef.current) setter(value);
    };

    return (
        <div className={`task-input-wrapper ${isExpanded ? 'expanded' : ''} ${submitSuccess ? 'success-flash' : ''}`}>
            <form onSubmit={handleSubmit} onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit(e);
                }
            }}>
                <fieldset className="capture-fields" disabled={!draftReady || submitting || !!pendingTask}>
                <div className="input-primary-row">
                    <textarea
                        rows={2}
                        className="task-title-input"
                        aria-label={predefinedParentId ? '子タスクの記録' : '仕事の記録'}
                        placeholder={predefinedParentId ? '次にすること' : 'やること、気になることをそのまま'}
                        value={title}
                        ref={titleInputRef}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>
                <div className="capture-toolbar">
                    <div className="capture-tools">
                        <div className="capture-calendar"><CalendarPicker value={dueDate} onChange={editWhenReady(setDueDate)} label="期限" /></div>
                        <button type="button" className="capture-tool" aria-expanded={showSource} onClick={() => setShowSource(v => !v)}>出どころ</button>
                        <button type="button" className="capture-tool" aria-expanded={isExpanded} onClick={() => setIsExpanded(v => !v)}>{isExpanded ? '詳細を閉じる' : '詳細'}</button>
                    </div>
                    <button type="submit" className="btn-submit" disabled={!title.trim() || submitting}>{submitting ? '記録中…' : '記録'}</button>
                </div>
                {showSource && <label className="capture-source">出どころ<input value={sourceRef} onChange={e => setSourceRef(e.target.value)} placeholder="メモ名・資料の場所" /></label>}
                <div className="capture-hint"><span>{projects.find(p => String(p.id) === projectId)?.name || 'Inbox'}</span><span>Ctrl + Enter</span></div>

                {isExpanded && (
                    <div className="details-panel">
                        {/* 2. 備考 */}
                        <div className="form-field">
                            <label>備考</label>
                            <textarea
                                rows="3"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="メモを入力..."
                            ></textarea>
                        </div>

                        {/* 3. プロジェクト / タグ */}
                        {!predefinedParentId && !defaultProjectId && projects.length > 1 && (
                            <div className="form-field">
                                <label>プロジェクト</label>
                                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {allTags.length > 0 && (
                            <div className="form-field">
                                <label>タグ</label>
                                <TagSelect
                                    allTags={allTags}
                                    selectedTagIds={selectedTags}
                                    onChange={editWhenReady(setSelectedTags)}
                                />
                            </div>
                        )}

                        {/* 4. 親タスク - only when not in inline child creation mode */}
                        {!predefinedParentId && (
                            <div className="form-field">
                                <label>親タスク</label>
                                <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={parentOptions.length === 0}>
                                    <option value="">なし（ルートタスク）</option>
                                    {parentOptions.map(p => (
                                        <option key={p.id} value={p.id}>{p.title}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* 5. 開始日 + 想定工数 */}
                        <div className="form-row">
                            <div className="form-field">
                                <label>開始日</label>
                                <CalendarPicker value={startDate} onChange={editWhenReady(setStartDate)} />
                            </div>
                            <div className="form-field form-field--narrow">
                                <label>想定工数（分）</label>
                                <input
                                    type="number"
                                    step="5"
                                    min="0"
                                    max="99999"
                                    value={estimatedMinutes}
                                    onChange={(e) => setEstimatedMinutes(e.target.value)}
                                    placeholder="未設定"
                                />
                            </div>
                        </div>

                        {/* 6. 重要度 + 緊急度 */}
                        <div className="form-row">
                            <div className="form-field">
                                <label>重要度</label>
                                <select value={importance} onChange={(e) => setImportance(e.target.value)}>
                                    <option value="">未選択</option>
                                    {masters.importance.map(m => (
                                        <option key={m.level} value={m.level}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-field">
                                <label>緊急度</label>
                                <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                                    <option value="">未選択</option>
                                    {masters.urgency.map(m => (
                                        <option key={m.level} value={m.level}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="panel-actions">
                            <button type="button" className="btn-collapse" onClick={() => setIsExpanded(false)}>
                                ↑ 閉じる
                            </button>
                            <button
                                type="submit"
                                className="btn-submit"
                                disabled={!title.trim() || submitting}
                            >
                                {submitting ? '追加中...' : '追加'}
                            </button>
                        </div>
                    </div>
                )}
                </fieldset>
                {recoveryIssue && !submitting && <div className="capture-recovery" role="alert">
                    {recoveryIssue.type === 'missing-tags' ? <>
                        <span>削除済みタグ {recoveryIssue.missingIds.length}件</span>
                        <button type="button" className="capture-tool" onClick={removeMissingTags}>削除済みタグを外す</button>
                    </> : <>
                        <span>{recoveryIssue.type === 'missing-task' ? '記録先が削除されています' : '記録先の原文が変わっています'}</span>
                        <button type="button" className="capture-tool" onClick={returnToDraft}>下書きに戻す</button>
                    </>}
                </div>}
                {pendingTask && !submitting && !['missing-task', 'changed-task'].includes(recoveryIssue?.type) && <div className="capture-recovery" role="status">
                    <span>本文は保存済み</span>
                    <button type="submit" className="btn-submit" disabled={submitting}>保存を再試行</button>
                </div>}
                {draftWarning && <p className="capture-warning" role="alert">{draftWarning}</p>}
            </form>

            <style jsx>{`
        .task-input-wrapper {
          background: var(--color-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          padding: 14px 16px;
          transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
        }
        .task-input-wrapper.expanded {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px var(--color-accent-subtle);
        }
        .task-input-wrapper.success-flash {
          border-color: var(--color-success);
        }
        .input-primary-row {
          display: flex; gap: 10px; align-items: center;
        }
        .task-title-input {
          flex: 1; background: transparent; border: none;
          padding: 8px 2px; min-height: 60px; resize: vertical;
          font-size: 1rem; line-height: 1.65; font-weight: 400; color: var(--color-text);
          transition: border-color var(--duration-fast) var(--ease-out); font-family: inherit;
        }
        .capture-fields { padding: 0; border: 0; margin: 0; min-width: 0; }
        .capture-recovery { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 12px; font-size: .8rem; }
        .capture-warning { color: var(--color-error, #b42318); font-size: .8rem; margin-top: 8px; }
        .task-title-input::placeholder { color: var(--color-text-secondary); font-weight: 400; }
        .capture-toolbar, .capture-tools, .capture-hint { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .capture-toolbar { justify-content: space-between; margin-top: 10px; }
        .capture-calendar { flex: 0 0 auto; width: 120px; }
        .capture-tool { border: 0; background: var(--color-surface-active); color: var(--color-text-secondary); border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: .8rem; }
        .capture-tool:hover { color: var(--color-text); }
        .capture-hint { justify-content: space-between; color: var(--color-text-secondary); font-size: .73rem; margin-top: 10px; }
        .capture-source { display: grid; gap: 5px; margin-top: 10px; }
        .capture-source input { width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--color-surface); color: var(--color-text); }
        .task-title-input:focus { border-bottom-color: var(--color-accent); }
        .btn-add {
          width: 32px; height: 32px; border-radius: var(--radius-pill); border: none;
          background: var(--color-accent); color: var(--color-on-accent); font-size: 1.1rem;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background var(--duration-fast) var(--ease-out); flex-shrink: 0;
        }
        .btn-add:hover:not(:disabled) {
          background: var(--color-accent-hover);
        }
        .btn-add:active:not(:disabled) { transform: scale(0.95); }
        .btn-add:disabled { opacity: 0.3; cursor: not-allowed; }
        .spinner-sm {
          width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .details-panel {
          margin-top: 14px; padding-top: 14px;
          border-top: 1px solid var(--border-color);
          display: flex; flex-direction: column; gap: 12px;
        }
        .form-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .form-row .form-field { flex: 1; min-width: 140px; }
        .form-field { display: flex; flex-direction: column; gap: 4px; }
        .form-field--narrow { max-width: 130px; flex: 0 0 auto !important; }
        label {
          font-size: 0.72rem; font-weight: 500; color: var(--color-text-secondary);
        }
        input[type="number"], select, textarea {
          background-color: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-sm); padding: 6px 8px;
          color: var(--color-text); font-family: inherit; font-size: 0.82rem;
          transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out); outline: none; width: 100%;
        }
        input:focus, select:focus, textarea:focus {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px var(--color-accent-subtle);
        }
        textarea { resize: vertical; min-height: 50px; }
        .panel-actions { display: flex; justify-content: space-between; align-items: center; padding-top: 4px; }
        .btn-collapse {
          background: transparent; border: 1px solid var(--border-color); color: var(--color-text-muted);
          cursor: pointer; font-size: 0.72rem; font-weight: 500; padding: 4px 10px;
          border-radius: var(--radius-pill); transition: color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
        }
        .btn-collapse:hover { color: var(--color-text); border-color: var(--border-color-hover); }
        .btn-submit {
          background: var(--color-accent); border: none; color: var(--color-on-accent);
          padding: 6px 16px; border-radius: var(--radius-pill);
          font-size: 0.82rem; font-weight: 500; cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out); font-family: inherit;
        }
        .btn-submit:hover:not(:disabled) { background: var(--color-accent-hover); }
        .btn-submit:disabled { opacity: 0.3; cursor: not-allowed; }
      `}</style>
        </div>
    );
}
