'use client';

import { useState, useEffect } from 'react';
import CalendarPicker from './CalendarPicker';
import TagSelect from './TagSelect';
import { useMasterData } from '../hooks/useMasterData';

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
    const [hasChildren, setHasChildren] = useState(false);

    const { masters, tags: allTags } = useMasterData();

    // Fetch eligible parent tasks and check if this task has children
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { getDb } = await import('@/lib/db');
                const db = await getDb();

                // BUG-6: Check if this task has children
                const childRows = await db.select(
                    'SELECT COUNT(*) as cnt FROM tasks WHERE parent_id = $1',
                    [task.id]
                );
                const taskHasChildren = childRows[0]?.cnt > 0;
                if (!cancelled) setHasChildren(taskHasChildren);

                // Exclude itself. A task cannot be its own parent.
                // BUG-6: Also exclude tasks that already have a parent (to prevent 3+ levels)
                const rows = await db.select(
                    'SELECT id, title FROM tasks WHERE parent_id IS NULL AND id != $1 AND status_code != 5 ORDER BY title',
                    [task.id]
                );
                if (!cancelled) setParentOptions(rows);
            } catch (e) { console.error('Failed to fetch parents:', e); }
        })();
        return () => { cancelled = true; };
    }, [task.id]);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleSave = async () => {
        if (!title.trim() || saving) return;
        setSaving(true);
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();

            // BUG-6: DB側バリデーション — 子タスクを持つタスクに親を設定させない
            if (parentId) {
                const childCheck = await db.select(
                    'SELECT COUNT(*) as cnt FROM tasks WHERE parent_id = $1',
                    [task.id]
                );
                if (childCheck[0]?.cnt > 0) {
                    window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                        detail: { message: '子タスクを持つタスクには親タスクを設定できません', type: 'error' }
                    }));
                    setSaving(false);
                    return;
                }
            }

            // Update the main task record
            const result = await db.execute(`
                UPDATE tasks
                SET title = $1, start_date = $2, due_date = $3,
                importance_level = $4, urgency_level = $5,
                estimated_hours = $6, notes = $7, status_code = $8,
                parent_id = $9,
                updated_at = datetime('now', 'localtime'),
                completed_at = CASE 
                        WHEN CAST($8 AS INTEGER) = 3 AND status_code != 3 THEN datetime('now', 'localtime')
                        WHEN CAST($8 AS INTEGER) != 3 THEN NULL 
                        ELSE completed_at 
                    END
                WHERE id = $10
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
                task.id
            ]);

            // Update tags (delete existing, insert new ones)
            await db.execute('DELETE FROM task_tags WHERE task_id = $1', [task.id]);

            if (selectedTags && selectedTags.length > 0) {
                for (const tagId of selectedTags) {
                    await db.execute('INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [task.id, tagId]);
                }
            }

            onSaved();
            onClose();
        } catch (err) {
            console.error(err);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                detail: { message: '保存に失敗しました', type: 'error' }
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="te-backdrop" onClick={onClose} />
            <div className="te-modal">
                <div className="te-header">
                    <h3>タスクの編集</h3>
                    <button className="te-close" onClick={onClose}>✕</button>
                </div>

                <div className="te-body">
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

                    {/* ステータス（編集画面のみ） */}
                    <div className="te-field">
                        <label className="te-label">ステータス</label>
                        <select value={statusCode} onChange={(e) => setStatusCode(e.target.value)} className="te-select">
                            {masters.status && masters.status.map(s => (
                                <option key={s.code} value={s.code}>{s.label}</option>
                            ))}
                        </select>
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

                    {/* 4. タグ */}
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
                            value={hasChildren ? '' : parentId}
                            onChange={(e) => setParentId(e.target.value)}
                            className="te-select"
                            disabled={hasChildren || parentOptions.length === 0}
                            title={hasChildren ? '子タスクを持つタスクには親タスクを設定できません' : ''}
                        >
                            <option value="">{hasChildren ? '設定不可（子タスクあり）' : 'なし（ルート）'}</option>
                            {!hasChildren && parentOptions.map(p => (
                                <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                        </select>
                    </div>

                    {/* 6. 開始日 + 想定工数 */}
                    <div className="te-row">
                        <div className="te-field" style={{ flex: 1 }}>
                            <label className="te-label">開始日</label>
                            <CalendarPicker value={startDate} onChange={setStartDate} />
                        </div>
                        <div className="te-field" style={{ flex: 1 }}>
                            <label className="te-label">想定工数（分）</label>
                            <input
                                type="number" step="5" min="0"
                                value={estimatedMinutes}
                                onChange={(e) => setEstimatedMinutes(e.target.value)}
                                className="te-input"
                                placeholder="未設定"
                            />
                        </div>
                    </div>

                    {/* 7. 重要度 + 緊急度 */}
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

                    {/* 8. 完了日（手動編集不可、編集画面のみ表示） */}
                    {task.completed_at && (
                        <div className="te-field" style={{ opacity: 0.7 }}>
                            <label className="te-label">完了日</label>
                            <input type="text" className="te-input" value={task.completed_at.split(' ')[0]} readOnly disabled />
                        </div>
                    )}
                </div>

                <div className="te-footer">
                    <button className="te-btn-cancel" onClick={onClose}>キャンセル</button>
                    <button className="te-btn-save" onClick={handleSave} disabled={!title.trim() || saving}>
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>

            <style jsx>{`
                .te-backdrop {
                    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5);
                    z-index: 2000; backdrop-filter: blur(2px); animation: fadeIn 0.2s;
                }
                .te-modal {
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    width: 100%; max-width: 500px; max-height: 90vh;
                    background: var(--color-surface); border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-xl); z-index: 2001;
                    display: flex; flex-direction: column;
                    animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes modalIn {
                    from { opacity: 0; transform: translate(-50%, -45%) scale(0.95); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                .te-header {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color);
                }
                .te-header h3 { font-size: 1rem; font-weight: 700; color: var(--color-text); margin: 0; }
                .te-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--color-text-secondary); }
                .te-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; overflow-y: auto; }
                .te-field { display: flex; flex-direction: column; gap: 0.4rem; }
                .te-row { display: flex; gap: 1rem; }
                .te-label { font-size: 0.75rem; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 0.1rem; }
                .te-input-title {
                    width: 100%; border: none; border-bottom: 2px solid var(--border-color);
                    font-size: 1.5rem; padding: 0.5rem 0; background: transparent;
                    color: var(--color-text); transition: border-color 0.2s;
                }
                .te-input-title:focus { outline: none; border-color: var(--color-primary); }
                .te-input, .te-select, .te-textarea {
                    width: 100%; padding: 0.5rem; border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm); background: var(--color-surface);
                    color: var(--color-text); font-size: 0.9rem; transition: border-color 0.2s;
                    font-family: inherit;
                }
                .te-input:focus, .te-select:focus, .te-textarea:focus {
                    outline: none; border-color: var(--color-primary);
                }
                .te-textarea { resize: vertical; min-height: 80px; }
                .te-footer {
                    display: flex; justify-content: flex-end; gap: 0.75rem;
                    padding: 1rem 1.5rem; border-top: 1px solid var(--border-color);
                }
                .te-btn-cancel {
                    background: transparent; border: 1px solid var(--border-color);
                    padding: 0.5rem 1rem; border-radius: 4px; font-size: 0.85rem;
                    cursor: pointer; color: var(--color-text-secondary); transition: all 0.2s;
                }
                .te-btn-cancel:hover { background: var(--color-surface-hover); }
                .te-btn-save {
                    background: var(--color-primary); color: #fff; border: none;
                    padding: 0.5rem 1.5rem; border-radius: 4px; font-size: 0.85rem;
                    font-weight: 600; cursor: pointer; transition: all 0.2s;
                }
                .te-btn-save:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
                .te-btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
            `}</style>
        </>
    );
}

