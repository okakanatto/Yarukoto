'use client';

import { useState, useEffect, useRef } from 'react';
import CalendarPicker from './CalendarPicker';
import TagSelect from './TagSelect';
import { useMasterData } from '../hooks/useMasterData';
import { useDbOperation } from '../hooks/useDbOperation';
import { fetchDb } from '@/lib/utils';
import { descendantIds, ancestorPath, validateParent, reparentTask, autoCompleteAncestors, clearInvalidNextTasks, restoreTaskTree, notifyTasksChanged } from '@/lib/taskHierarchy';
import { useWorkNavigationGuard } from '@/hooks/useWorkNavigationGuard';

const valuesFrom = task => ({
    title: task.title || '', startDate: task.start_date || '', dueDate: task.due_date || '',
    importance: task.importance_level == null ? '' : String(task.importance_level),
    urgency: task.urgency_level == null ? '' : String(task.urgency_level),
    estimatedMinutes: task.estimated_hours == null ? '' : String(task.estimated_hours),
    notes: task.notes || '', statusCode: String(task.status_code || 1),
    parentId: task.parent_id || '', projectId: task.project_id == null ? '' : String(task.project_id),
    selectedTags: task.tags?.map(tag => tag.id) || [],
});

export default function TaskEditModal({ task, onClose, onSaved }) {
    const [title, setTitle] = useState(task.title || '');
    const [startDate, setStartDate] = useState(task.start_date || '');
    const [dueDate, setDueDate] = useState(task.due_date || '');
    const [importance, setImportance] = useState(task.importance_level != null ? String(task.importance_level) : '');
    const [urgency, setUrgency] = useState(task.urgency_level != null ? String(task.urgency_level) : '');
    const [estimatedMinutes, setEstimatedMinutes] = useState(task.estimated_hours != null ? String(task.estimated_hours) : '');
    const [notes, setNotes] = useState(task.notes || '');
    const [statusCode, setStatusCode] = useState(String(task.status_code || 1));
    const [selectedTags, setSelectedTags] = useState(task.tags ? task.tags.map(t => t.id) : []);
    const [saving, setSaving] = useState(false);
    const [parentId, setParentId] = useState(task.parent_id || '');
    const [parentOptions, setParentOptions] = useState([]);
    const [projectId, setProjectId] = useState(task.project_id != null ? String(task.project_id) : '');
    const [saveError, setSaveError] = useState('');
    const initial = useRef(valuesFrom(task));
    const values = { title, startDate, dueDate, importance, urgency, estimatedMinutes, notes, statusCode, selectedTags, parentId, projectId };
    const valuesRef = useRef(values);
    valuesRef.current = values;
    const pending = useRef(null);
    const saveRef = useRef(null);
    const dirty = Object.keys(values).some(key => JSON.stringify(values[key]) !== JSON.stringify(initial.current[key]));

    const { masters, tags: allTags, projects } = useMasterData();
    const dbOp = useDbOperation();

    // IMP-36: Auto-select default project if task has no project_id
    useEffect(() => {
        if (projectId) return;
        if (projects.length > 0) {
            const defaultProj = projects.find(p => p.is_default === 1);
            if (defaultProj) setProjectId(String(defaultProj.id));
        }
    }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch eligible parent tasks and check if this task has children
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const db = await fetchDb();

                const rows = await db.select('SELECT id, title, parent_id, status_code, archived_at FROM tasks ORDER BY title');
                const excluded = descendantIds(rows, task.id);
                if (!cancelled) setParentOptions(rows.filter(t => !excluded.has(t.id) &&
                    ((!t.archived_at && ![3, 5].includes(t.status_code)) || t.id === task.parent_id)).map(t => ({
                    ...t, label: [...ancestorPath(rows, t.id).map(p => p.title), t.title].join(' › ')
                })));
            } catch (e) { console.error('Failed to fetch parents:', e); }
        })();
        return () => { cancelled = true; };
    }, [task.id, task.parent_id]);

    // Closing commits; only the explicit Cancel action discards changes.
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); void saveRef.current(); } };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        const handler = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    const handleSave = () => {
        if (pending.current) return pending.current;
        const changes = Object.fromEntries(Object.entries(valuesRef.current).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(initial.current[key])));
        if (!Object.keys(changes).length) { onClose(); return Promise.resolve(true); }
        if (!valuesRef.current.title.trim()) { setSaveError('タスク名を入力してください。'); return Promise.resolve(false); }
        setSaving(true);
        setSaveError('');
        pending.current = (async () => {
        try {
            const saved = await dbOp(async (db) => {
                const current = (await db.select('SELECT * FROM tasks WHERE id = $1', [task.id]))[0];
                if (!current) throw new Error('タスクが見つかりません。');
                const { title, startDate, dueDate, importance, urgency, estimatedMinutes, notes, statusCode, parentId, projectId, selectedTags } = { ...valuesFrom(current), ...changes };
                const unchangedArchivedParent = current.archived_at && Number(parentId) === current.parent_id;
                const parent = unchangedArchivedParent
                    ? (await db.select('SELECT * FROM tasks WHERE id = $1', [current.parent_id]))[0]
                    : await validateParent(db, task.id, parentId);

                // Resolve project_id: use selected, or default project
                let resolvedProjectId = projectId ? parseInt(projectId) : null;
                if (!resolvedProjectId) {
                    const defaultProj = await db.select('SELECT id FROM projects WHERE is_default = 1 LIMIT 1');
                    resolvedProjectId = defaultProj[0]?.id || null;
                }
                if (parent) resolvedProjectId = parent.project_id;
                const relationshipChanged = (Number(parentId) || null) !== (current.parent_id || null);
                if (!unchangedArchivedParent && (relationshipChanged || resolvedProjectId !== current.project_id)) {
                    await reparentTask(db, task.id, parentId, resolvedProjectId);
                }

                // Update the main task record
                await db.execute(`
                    UPDATE tasks
                    SET title = $1, start_date = $2, due_date = $3,
                    importance_level = $4, urgency_level = $5,
                    estimated_hours = $6, notes = $7, status_code = $8,
                    parent_id = $9, project_id = $10,
                    updated_at = datetime('now', 'localtime'),
                    work_started_at = CASE WHEN CAST($11 AS INTEGER) = 2 AND status_code != 2
                        THEN datetime('now', 'localtime') ELSE work_started_at END,
                    completed_at = CASE
                            WHEN CAST($12 AS INTEGER) = 3 AND status_code != 3 THEN datetime('now', 'localtime')
                            WHEN CAST($13 AS INTEGER) != 3 THEN NULL
                            ELSE completed_at
                        END
                    WHERE id = $14
                    `, [
                    title,
                    startDate || null,
                    dueDate || null,
                    importance ? parseInt(importance) : null,
                    urgency ? parseInt(urgency) : null,
                    estimatedMinutes ? parseInt(estimatedMinutes) : null,
                    notes || '',
                    parseInt(statusCode),
                    parentId || null,
                    resolvedProjectId,
                    parseInt(statusCode),
                    parseInt(statusCode),
                    parseInt(statusCode),
                    task.id
                ]);

                if (parseInt(statusCode) === 3) await autoCompleteAncestors(db, task.id);
                if (current.archived_at && ![3, 5].includes(parseInt(statusCode))) await restoreTaskTree(db, task.id);
                await clearInvalidNextTasks(db);

                // Update tags (delete existing, insert new ones)
                if ('selectedTags' in changes) {
                await db.execute('DELETE FROM task_tags WHERE task_id = $1', [task.id]);

                if (selectedTags && selectedTags.length > 0) {
                    for (const tagId of selectedTags) {
                        await db.execute('INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [task.id, tagId]);
                    }
                }
                }
                notifyTasksChanged();
                return true;
            }, { error: '保存に失敗しました' });

            if (saved) {
                await onSaved?.();
                onClose();
                return true;
            }
            return false;
        } catch (failure) {
            setSaveError(`保存できませんでした。入力は残っています。${failure.message ? ` ${failure.message}` : ''}`);
            return false;
        } finally {
            pending.current = null;
            setSaving(false);
        }
        })();
        return pending.current;
    };
    saveRef.current = handleSave;
    useWorkNavigationGuard(handleSave);

    return (
        <>
            <div className="te-backdrop" onClick={handleSave} />
            <div className="te-modal" role="dialog" aria-modal="true" aria-labelledby="task-edit-heading">
                <div className="te-header">
                    <h3 id="task-edit-heading">タスクの編集</h3>
                    <button className="te-close" onClick={handleSave} aria-label="保存して閉じる" disabled={saving}>✕</button>
                </div>

                {saveError && <p className="te-error" role="alert">{saveError}</p>}
                <fieldset className="te-body" disabled={saving}>
                    {/* 1. タスク名 */}
                    <div className="te-field">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="te-input-title"
                            placeholder="タスク名"
                            autoFocus
                        />
                    </div>

                    {/* 2. 終了期限 */}
                    <div className="te-field">
                        <label className="te-label">終了期限</label>
                        <CalendarPicker value={dueDate} onChange={setDueDate} />
                    </div>

                    {/* 3. 備考 */}
                    <div className="te-field">
                        <label className="te-label">備考</label>
                        <textarea
                            rows="3"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="te-textarea"
                            placeholder="メモを入力..."
                        ></textarea>
                    </div>

                    {/* 4. プロジェクト / タグ */}
                    {projects.length > 1 && (
                        <div className="te-field">
                            <label className="te-label">プロジェクト</label>
                            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="te-select" disabled={!!parentId}>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            {parentId && <small>親タスクと同じプロジェクトに保存されます</small>}
                        </div>
                    )}

                    <div className="te-field">
                        <label className="te-label">タグ</label>
                        <TagSelect
                            allTags={allTags}
                            selectedTagIds={selectedTags}
                            onChange={setSelectedTags}
                        />
                    </div>

                    {/* 5. 親タスク */}
                    <div className="te-field">
                        <label className="te-label">親タスク</label>
                        <select
                            value={parentId}
                            onChange={(e) => setParentId(e.target.value)}
                            className="te-select"
                        >
                            <option value="">なし（ルートタスク）</option>
                            {parentOptions.map(p => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* 6. 開始日 / 想定工数 */}
                    <div className="te-row">
                        <div className="te-field" style={{ flex: 1 }}>
                            <label className="te-label">開始日</label>
                            <CalendarPicker value={startDate} onChange={setStartDate} />
                        </div>
                        <div className="te-field" style={{ flex: 1 }}>
                            <label className="te-label">想定工数（分）</label>
                            <input
                                type="number" step="5" min="0" max="99999"
                                value={estimatedMinutes}
                                onChange={(e) => setEstimatedMinutes(e.target.value)}
                                className="te-input"
                                placeholder="未設定"
                            />
                        </div>
                    </div>

                    {/* 7. 重要度 / 緊急度 */}
                    <div className="te-row">
                        <div className="te-field" style={{ flex: 1 }}>
                            <label className="te-label">重要度</label>
                            <select value={importance} onChange={(e) => setImportance(e.target.value)} className="te-select">
                                <option value="">未選択</option>
                                {masters.importance && masters.importance.map(m => (
                                    <option key={m.level} value={m.level}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="te-field" style={{ flex: 1 }}>
                            <label className="te-label">緊急度</label>
                            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="te-select">
                                <option value="">未選択</option>
                                {masters.urgency && masters.urgency.map(m => (
                                    <option key={m.level} value={m.level}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* ステータス（編集画面のみ） */}
                    <div className="te-field">
                        <label className="te-label">ステータス</label>
                        <select value={statusCode} onChange={(e) => setStatusCode(e.target.value)} className="te-select">
                            {masters.status && masters.status.map(s => (
                                <option key={s.code} value={s.code}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* 8. 完了日（手動編集不可、編集画面のみ表示） */}
                    {task.completed_at && (
                        <div className="te-field" style={{ opacity: 0.7 }}>
                            <label className="te-label">完了日</label>
                            <input type="text" className="te-input" value={task.completed_at.split(' ')[0]} readOnly disabled />
                        </div>
                    )}
                </fieldset>

                <div className="te-footer">
                    <button className="te-btn-cancel" onClick={onClose} disabled={saving}>キャンセル</button>
                    <button className="te-btn-save" onClick={handleSave} disabled={!title.trim() || saving}>
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>

            <style jsx>{`
                .te-backdrop {
                    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.3);
                    z-index: 2000;
                }
                .te-modal {
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    width: 100%; max-width: 480px; max-height: 90vh;
                    background: var(--color-surface); border-radius: var(--radius-lg);
                    border: none;
                    box-shadow: var(--shadow-lg); z-index: 2001;
                    display: flex; flex-direction: column;
                }
                .te-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 14px 20px; border-bottom: 1px solid var(--border-color);
                }
                .te-header h3 {
                    font-family: var(--font-heading); font-size: 0.92rem; font-weight: 700;
                    letter-spacing: -0.03em; color: var(--color-text); margin: 0;
                }
                .te-close {
                    background: none; border: none; cursor: pointer;
                    color: var(--color-text-muted); width: 28px; height: 28px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: var(--radius-pill); transition: color var(--duration-fast) var(--ease-out);
                }
                .te-close:hover { color: var(--color-text); }
                .te-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; border: 0; margin: 0; min-width: 0; }
                .te-error { margin: 12px 20px 0; color: var(--color-danger, #b42318); font-size: 0.8rem; }
                .te-field { display: flex; flex-direction: column; gap: 4px; }
                .te-row { display: flex; gap: 10px; }
                .te-label {
                    font-size: 0.72rem; font-weight: 500; color: var(--color-text-secondary);
                }
                .te-input-title {
                    width: 100%; border: none; border-bottom: 1px solid var(--border-color);
                    font-size: 0.875rem; font-weight: 500; padding: 6px 2px; background: transparent;
                    color: var(--color-text); transition: border-color var(--duration-fast) var(--ease-out); font-family: inherit;
                }
                .te-input-title:focus { outline: none; border-color: var(--color-accent); }
                .te-input, .te-select, .te-textarea {
                    width: 100%; padding: 6px 8px; border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm); background-color: var(--color-surface);
                    color: var(--color-text); font-size: 0.82rem;
                    transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
                    font-family: inherit;
                }
                .te-input:focus, .te-select:focus, .te-textarea:focus {
                    outline: none; border-color: var(--color-accent);
                    box-shadow: 0 0 0 3px var(--color-accent-subtle);
                }
                .te-textarea { resize: vertical; min-height: 60px; }
                .te-footer {
                    display: flex; justify-content: flex-end; gap: 8px;
                    padding: 14px 20px; border-top: 1px solid var(--border-color);
                }
                .te-btn-cancel {
                    background: transparent; border: 1px solid var(--border-color);
                    padding: 6px 14px; border-radius: var(--radius-pill); font-size: 0.82rem;
                    cursor: pointer; color: var(--color-text-muted);
                    transition: color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
                    font-family: inherit; font-weight: 500;
                }
                .te-btn-cancel:hover { color: var(--color-text); border-color: var(--border-color-hover); }
                .te-btn-save {
                    background: var(--color-accent); color: var(--color-on-accent); border: none;
                    padding: 6px 16px; border-radius: var(--radius-pill); font-size: 0.82rem;
                    font-weight: 500; cursor: pointer; transition: background var(--duration-fast) var(--ease-out); font-family: inherit;
                }
                .te-btn-save:hover:not(:disabled) { background: var(--color-accent-hover); }
                .te-btn-save:disabled { opacity: 0.3; cursor: not-allowed; }
            `}</style>
        </>
    );
}

