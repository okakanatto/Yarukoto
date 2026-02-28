'use client';

import { useState, useRef, useEffect } from 'react';
import CalendarPicker from './CalendarPicker';
import TagSelect from './TagSelect';
import { useMasterData } from '../hooks/useMasterData';

export default function TaskInput({ onTaskAdded, predefinedParentId = null }) {
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

    const { masters, tags: allTags } = useMasterData();

    // Fetch eligible parent tasks when the form expands (only for root task creation)
    useEffect(() => {
        if (!isExpanded || predefinedParentId) return;
        let cancelled = false;
        (async () => {
            try {
                const { getDb } = await import('@/lib/db');
                const db = await getDb();
                const rows = await db.select(
                    'SELECT id, title FROM tasks WHERE parent_id IS NULL AND status_code != 3 AND status_code != 5 ORDER BY title'
                );
                if (!cancelled) setParentOptions(rows);
            } catch (e) {
                console.error('Failed to fetch parent tasks:', e);
            }
        })();
        return () => { cancelled = true; };
    }, [isExpanded, predefinedParentId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || isSubmittingRef.current) return;

        isSubmittingRef.current = true;
        setSubmitting(true);
        const actualParentId = (parentId ? parseInt(parentId) : null) || predefinedParentId || null;

        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();

            // Insert task
            const result = await db.execute(`
              INSERT INTO tasks (
                title, parent_id, status_code, importance_level,
                urgency_level, start_date, due_date, estimated_hours, notes
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                title,
                actualParentId,
                1, // default status_code
                importance ? parseInt(importance) : null,
                urgency ? parseInt(urgency) : null,
                startDate || null,
                dueDate || null,
                estimatedMinutes ? parseInt(estimatedMinutes) : null,
                notes || ''
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
        // setIsExpanded(false); // Removed to allow continuous input
    };

    return (
        <div className={`task-input-wrapper ${isExpanded ? 'expanded' : ''} ${submitSuccess ? 'success-flash' : ''}`}>
            <form onSubmit={handleSubmit}>
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

                        {/* 3. タグ */}
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
                                {submitting ? '登録中...' : '✓ 登録'}
                            </button>
                        </div>
                    </div>
                )}
            </form>

            <style jsx>{`
        .task-input-wrapper {
          background: var(--color-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 1.25rem 1.5rem;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: var(--shadow-md);
        }
        .task-input-wrapper.expanded {
          box-shadow: var(--shadow-lg);
          border-color: var(--border-color-hover);
        }
        .task-input-wrapper.success-flash {
          border-color: var(--color-success);
          box-shadow: 0 0 0 3px var(--color-success-bg);
          animation: successBounce 0.5s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes successBounce {
          0% { transform: scale(1); }
          30% { transform: scale(1.02) translateY(-2px); }
          50% { transform: scale(0.99); }
          70% { transform: scale(1.005) translateY(-1px); }
          100% { transform: scale(1) translateY(0); }
        }
        .input-primary-row {
          display: flex; gap: 0.75rem; align-items: center;
        }
        .task-title-input {
          flex: 1; background: transparent; border: none;
          border-bottom: 2px solid var(--border-color); padding: 0.6rem 0.25rem;
          font-size: 1.05rem; color: var(--color-text); outline: none;
          transition: border-color 0.25s; font-family: inherit;
        }
        .task-title-input::placeholder { color: var(--color-text-disabled); }
        .task-title-input:focus { border-bottom-color: var(--color-primary); }
        .btn-add {
          width: 38px; height: 38px; border-radius: 50%; border: none;
          background: var(--color-primary); color: white; font-size: 1.4rem;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); flex-shrink: 0;
        }
        .btn-add:hover:not(:disabled) {
          transform: scale(1.1);
          box-shadow: 0 4px 16px var(--color-primary-glow);
        }
        .btn-add:active:not(:disabled) { transform: scale(0.95); }
        .btn-add:disabled { opacity: 0.35; cursor: not-allowed; }
        .spinner-sm {
          width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .details-panel {
          margin-top: 1.25rem; padding-top: 1.25rem;
          border-top: 1px solid var(--border-color);
          animation: detailsSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex; flex-direction: column; gap: 1rem;
        }
        @keyframes detailsSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .form-row { display: flex; gap: 1rem; flex-wrap: wrap; }
        .form-row .form-field { flex: 1; min-width: 150px; }
        .form-field { display: flex; flex-direction: column; gap: 0.4rem; }
        .form-field--narrow { max-width: 140px; flex: 0 0 auto !important; }
        label {
          font-size: 0.75rem; font-weight: 600; color: var(--color-text-muted);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        input[type="number"], select, textarea {
          background: var(--color-surface-hover); border: 1px solid var(--border-color);
          border-radius: var(--radius-sm); padding: 0.55rem 0.65rem;
          color: var(--color-text); font-family: inherit; font-size: 0.875rem;
          transition: border-color 0.2s, box-shadow 0.2s; outline: none; width: 100%;
        }
        input:focus, select:focus, textarea:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-glow);
          background: var(--color-surface);
        }
        textarea { resize: vertical; min-height: 60px; }
        .panel-actions { display: flex; justify-content: space-between; align-items: center; }
        .btn-collapse {
          background: transparent; border: none; color: var(--color-text-muted);
          cursor: pointer; font-size: 0.8rem; padding: 0.35rem 0.75rem;
          border-radius: var(--radius-sm); transition: color 0.2s, background 0.2s;
        }
        .btn-collapse:hover { color: var(--color-text); background: var(--color-surface-hover); }
        .btn-submit {
          background: var(--color-primary); border: none; color: #fff;
          padding: 0.45rem 1.2rem; border-radius: var(--radius-sm);
          font-size: 0.85rem; font-weight: 600; cursor: pointer;
          transition: all 0.18s; font-family: inherit;
        }
        .btn-submit:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        .btn-submit:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
        </div>
    );
}
