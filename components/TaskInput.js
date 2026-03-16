'use client';

import { useState, useRef, useEffect } from 'react';
import CalendarPicker from './CalendarPicker';
import TagSelect from './TagSelect';
import { useMasterData } from '../hooks/useMasterData';
import { fetchDb } from '@/lib/utils';

export default function TaskInput({ onTaskAdded, predefinedParentId = null, defaultProjectId = null, autoFocus = false }) {
    const [title, setTitle] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const titleInputRef = useRef(null);

    const [dueDate, setDueDate] = useState('');
    const [startDate, setStartDate] = useState('');
    const [importance, setImportance] = useState('');
    const [urgency, setUrgency] = useState('');
    const [estimatedMinutes, setEstimatedMinutes] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedTags, setSelectedTags] = useState([]);
    const [parentId, setParentId] = useState('');
    const [parentOptions, setParentOptions] = useState([]);

    const { masters, tags: allTags, projects } = useMasterData();
    const [projectId, setProjectId] = useState(defaultProjectId ? String(defaultProjectId) : '');

    // IMP-36: Auto-select default project (Inbox) when no explicit project context
    useEffect(() => {
        if (defaultProjectId || predefinedParentId) return;
        if (projects.length > 0 && !projectId) {
            const defaultProj = projects.find(p => p.is_default === 1);
            if (defaultProj) setProjectId(String(defaultProj.id));
        }
    }, [projects, defaultProjectId, predefinedParentId]); // eslint-disable-line react-hooks/exhaustive-deps

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
                    'SELECT id, title FROM tasks WHERE parent_id IS NULL AND status_code != 3 AND status_code != 5 AND archived_at IS NULL ORDER BY title'
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
        if (!title.trim() || isSubmittingRef.current) return;

        isSubmittingRef.current = true;
        setSubmitting(true);
        const actualParentId = (parentId ? parseInt(parentId) : null) || predefinedParentId || null;

        try {
            const db = await fetchDb();

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
            if (!resolvedProjectId) {
                const defaultProj = await db.select('SELECT id FROM projects WHERE is_default = 1 LIMIT 1');
                resolvedProjectId = defaultProj[0]?.id || null;
            }

            // Insert task
            const result = await db.execute(`
              INSERT INTO tasks (
                title, parent_id, status_code, importance_level,
                urgency_level, start_date, due_date, estimated_hours, notes, sort_order, project_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                title,
                actualParentId,
                1, // default status_code
                importance ? parseInt(importance) : null,
                urgency ? parseInt(urgency) : null,
                startDate || null,
                dueDate || null,
                estimatedMinutes ? parseInt(estimatedMinutes) : null,
                notes || '',
                newSortOrder,
                resolvedProjectId
            ]);

            const newTaskId = result.lastInsertId;
            let finalTagIds = [...selectedTags];

            // Insert tags if any
            if (selectedTags.length > 0) {
                for (const tagId of selectedTags) {
                    await db.execute('INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [newTaskId, tagId]);
                }
            }

            // --- BUG-1 修正: タグ継承ロジック ---
            if (actualParentId) {
                try {
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
                } catch (tagErr) {
                    console.error('Tag inheritance error:', tagErr);
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

            onTaskAdded(newTask);
            resetForm();
            setTimeout(() => titleInputRef.current?.focus(), 10);
        } catch (err) {
            console.error(err);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                detail: { message: 'タスクの追加に失敗しました', type: 'error' }
            }));
        } finally {
            setSubmitting(false);
            isSubmittingRef.current = false;
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
        setSelectedTags([]);
        setParentId('');
        // IMP-36: Reset to default project (Inbox) instead of empty
        if (!predefinedParentId && !defaultProjectId) {
            const defaultProj = projects.find(p => p.is_default === 1);
            setProjectId(defaultProj ? String(defaultProj.id) : '');
        }
        // setIsExpanded(false); // Removed to allow continuous input
    };

    return (
        <div className={`task-input-wrapper ${isExpanded ? 'expanded' : ''} ${submitSuccess ? 'success-flash' : ''}`}>
            <form onSubmit={handleSubmit} onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit(e);
                }
            }}>
                <div className="input-primary-row">
                    <input
                        type="text"
                        className="task-title-input"
                        placeholder={predefinedParentId ? "子タスクのタイトル..." : "新しいタスクを入力..."}
                        value={title}
                        ref={titleInputRef}
                        onChange={(e) => setTitle(e.target.value)}
                        onFocus={() => setIsExpanded(true)}
                    />
                    <button
                        type={isExpanded ? 'button' : 'submit'}
                        className={`btn-add ${submitting ? 'submitting' : ''} ${isExpanded ? 'expanded' : ''}`}
                        disabled={!isExpanded && (!title.trim() || submitting)}
                        title={isExpanded ? '閉じる' : '追加'}
                        tabIndex={isExpanded ? -1 : undefined}
                        onClick={isExpanded ? (e) => { e.preventDefault(); setIsExpanded(false); } : undefined}
                    >
                        {submitting ? <span className="spinner-sm"></span> : isExpanded ? '−' : '+'}
                    </button>
                </div>

                {isExpanded && (
                    <div className="details-panel">
                        {/* 1. 終了期限 */}
                        <div className="form-field">
                            <label>終了期限</label>
                            <CalendarPicker value={dueDate} onChange={setDueDate} />
                        </div>

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
                                    onChange={setSelectedTags}
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
                                <CalendarPicker value={startDate} onChange={setStartDate} />
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
          border-bottom: 1px solid var(--border-color); padding: 6px 2px;
          font-size: 0.875rem; font-weight: 500; color: var(--color-text); outline: none;
          transition: border-color var(--duration-fast) var(--ease-out); font-family: inherit;
        }
        .task-title-input::placeholder { color: var(--color-text-disabled); font-weight: 400; }
        .task-title-input:focus { border-bottom-color: var(--color-accent); }
        .btn-add {
          width: 32px; height: 32px; border-radius: var(--radius-pill); border: none;
          background: var(--color-accent); color: white; font-size: 1.1rem;
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
          background: var(--color-accent); border: none; color: #fff;
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
