'use client';

import React, { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import TaskInput from './TaskInput';
import StatusCheckbox from './StatusCheckbox';
import { ReorderGap } from './DndGaps';
import { formatMin } from '@/lib/utils';

/**
 * Individual task card component with DnD support, status controls, and child task rendering.
 * Extracted from TaskList.js (Phase 1-1).
 */
export default function TaskItem({ task, childTasks, onStatusChange, onDelete, onTaskAdded, onEdit, onTodayToggle, onArchive, onRestore, index = 0, isChild = false, statusMap = {}, allStatuses = [], isDraggable = true, isArchived = false, sortMode = 'auto', activeId = null, activeDragParentId = undefined, isProcessing = false, processingIds = new Set() }) {
    const [expanded, setExpanded] = useState(true);
    const [showSub, setShowSub] = useState(false);

    // Draggable Hook
    const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
        id: task.id,
        disabled: !isDraggable
    });

    // Droppable Hook (Target for nesting)
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: task.id,
        disabled: isChild
    });

    // Merge refs
    const setNodeRef = (node) => {
        setDragRef(node);
        setDropRef(node);
    };

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 'auto',
    } : undefined;

    const dueMeta = (() => {
        if (!task.due_date) return {};
        const due = new Date(task.due_date + 'T00:00:00');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        if (due < today) return { color: 'var(--color-danger)', badge: '期限切れ', cls: 'tc-badge-danger' };
        if (due.getTime() === today.getTime()) return { color: 'var(--color-warning)', badge: '本日', cls: 'tc-badge-warning' };
        if (due.getTime() === tomorrow.getTime()) return { color: 'var(--color-primary)', badge: '明日', cls: 'tc-badge-info' };
        return {};
    })();

    const st = statusMap[task.status_code] || { label: task.status_label || '不明', color: '#94a3b8' };
    const isDone = task.status_code === 3;
    const isCancelled = task.status_code === 5;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`tc-card ${isDone ? 'done' : ''} ${isCancelled ? 'cancelled' : ''} ${isOver && !isDragging ? 'drag-over' : ''}`}
        >
            <div className="tc-body">
                {/* Drag Handle */}
                {isDraggable && (
                    <div className="tc-handle" {...attributes} {...listeners} title={sortMode === 'manual' ? 'ドラッグして並び替え' : isChild ? 'ドラッグして親から外す' : 'ドラッグして他のタスクの子にする'}>
                        ⋮⋮
                    </div>
                )}

                <StatusCheckbox
                    statusCode={task.status_code}
                    onChange={(newCode) => onStatusChange(task.id, newCode)}
                    disabled={isProcessing}
                />

                {childTasks.length > 0 && (
                    <button className="tc-toggle" onClick={() => setExpanded(!expanded)}>
                        <span className={`tc-chev ${expanded ? 'open' : ''}`}>›</span>
                    </button>
                )}

                <div className="tc-info" onClick={() => onEdit(task)} title="クリックして編集">
                    {!isChild && task.parent_id && task.parent_title && (
                        <span className="tc-parent-label" style={{ display: 'block', fontSize: '0.7rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '0.15rem', letterSpacing: '0.01em' }}>📌 {task.parent_title} ›</span>
                    )}
                    <div className="tc-title-row">
                        <span className={`tc-title ${isDone || isCancelled ? 'strike' : ''}`}>{task.title}</span>
                        {task.tags && task.tags.map(t => <span key={t.id} className="tc-tag" style={{ backgroundColor: t.color }}>{t.name}</span>)}
                    </div>
                    <div className="tc-meta">
                        {isDone && task.completed_at && <span className="tc-meta-item">☑ 完了: {task.completed_at.split(' ')[0]}</span>}
                        {task.archived_at && <span className="tc-meta-item">📦 アーカイブ: {task.archived_at.split(' ')[0]}</span>}
                        {task.start_date && !isDone && <span className="tc-meta-item">🟢 開始: {task.start_date}</span>}
                        {task.due_date && !isDone && (
                            <span className="tc-meta-item" style={{ color: dueMeta.color || 'inherit' }}>
                                📅 期限: {task.due_date}{dueMeta.badge && <span className={`tc-badge ${dueMeta.cls}`}>{dueMeta.badge}</span>}
                            </span>
                        )}
                        {task.importance_label && (
                            <span className="tc-meta-item"><span className="tc-dot" style={{ backgroundColor: task.importance_color }} /> 重要度: {task.importance_label}</span>
                        )}
                        {task.urgency_label && (
                            <span className="tc-meta-item"><span className="tc-dot" style={{ backgroundColor: task.urgency_color }} /> 緊急度: {task.urgency_label}</span>
                        )}
                        {task.estimated_hours > 0 && <span className="tc-meta-item">⏱ {formatMin(task.estimated_hours)}</span>}
                        {task.notes?.trim() && <span className="tc-meta-item" title={task.notes}>📝 メモ</span>}
                    </div>
                </div>

                <div className="tc-actions">
                    {isArchived ? (
                        <>
                            <span className="tc-status-label" style={{ color: st.color }}>{st.label}</span>
                            <button className="tc-act-btn tc-restore-btn" onClick={() => onRestore(task.id)} title="復元" disabled={isProcessing}>📤</button>
                        </>
                    ) : (
                        <>
                            <select value={task.status_code} onChange={e => onStatusChange(task.id, e.target.value)} className="tc-status-select"
                                disabled={isProcessing}
                                style={{ borderColor: st.color, color: st.color, background: `${st.color}10` }}>
                                {allStatuses.length > 0 ? allStatuses.map(s => <option key={s.code} value={s.code}>{s.label}</option>) : <option value={task.status_code}>{st.label}</option>}
                            </select>
                            {onTodayToggle && (
                                <button
                                    className={`tc-act-btn tc-today-btn ${task.today_date === new Date().toLocaleDateString('sv-SE') ? 'active' : ''}`}
                                    onClick={() => onTodayToggle(task.id, task.today_date)}
                                    title={task.today_date === new Date().toLocaleDateString('sv-SE') ? '今日やるから外す' : '今日やるタスクに追加'}
                                    disabled={isProcessing}
                                >☀️</button>
                            )}
                            {(task.status_code === 3 || task.status_code === 5) && onArchive && (
                                <button className="tc-act-btn tc-archive-btn" onClick={() => onArchive(task.id)} title="アーカイブ" disabled={isProcessing}>📦</button>
                            )}
                            {!isChild && <button className="tc-act-btn" onClick={() => setShowSub(!showSub)} title="子タスク追加">＋</button>}
                            <button className="tc-act-btn danger" onClick={() => onDelete(task.id)} title="削除">🗑</button>
                        </>
                    )}
                </div>
            </div>

            {showSub && <div className="tc-sub-input"><TaskInput onTaskAdded={() => { onTaskAdded(); setShowSub(false); }} predefinedParentId={task.id} /></div>}

            {expanded && childTasks.length > 0 && (
                <div className="tc-children">
                    {childTasks.map((c, i) => (
                        <React.Fragment key={c.id}>
                            {/* ReorderGap between children in manual mode */}
                            {sortMode === 'manual' && activeId && activeDragParentId === task.id && i === 0 && (
                                <ReorderGap id={`reorder-child-${task.id}-0`} />
                            )}
                            <TaskItem task={c} childTasks={[]} onStatusChange={onStatusChange}
                                onDelete={onDelete} onTaskAdded={() => { }} onEdit={onEdit}
                                onTodayToggle={onTodayToggle}
                                onArchive={onArchive} onRestore={onRestore}
                                index={i} isChild statusMap={statusMap} allStatuses={allStatuses}
                                isDraggable={!isArchived}
                                isArchived={isArchived}
                                sortMode={sortMode}
                                activeId={activeId}
                                isProcessing={isProcessing || processingIds.has(c.id)}
                                processingIds={processingIds}
                            />
                            {/* ReorderGap after each child in manual mode */}
                            {sortMode === 'manual' && activeId && activeDragParentId === task.id && (
                                <ReorderGap id={`reorder-child-${task.id}-${i + 1}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}
