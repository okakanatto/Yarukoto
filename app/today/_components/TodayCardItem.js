'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import StatusCheckbox from '@/components/StatusCheckbox';
import { formatMin } from '@/lib/utils';
import { Pin, RefreshCw, Archive, Calendar, Clock, GripVertical, CheckSquare } from 'lucide-react';

/**
 * Individual today-card with @dnd-kit draggable support.
 */
export default function TodayCardItem({ task, isManual, isChild = false, statuses, statusMap, selectedDate, onStatusChange, onRemove, onEdit, justCompletedId, justDroppedId = null, index, isProcessing }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        disabled: !isManual || !!task.is_archived,
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 100 : 'auto',
    } : undefined;

    const st = statusMap[task.status_code] || { label: task.status_label || '不明', color: task.status_color || '#94a3b8' };
    const isDone = task.status_code === 3;
    const isRoutine = !!task.is_routine;
    const isArchived = !!task.is_archived;
    const isPickedForToday = task.today_date === selectedDate;

    return (
        <div
            ref={setNodeRef}
            style={{ ...style, animationDelay: `${index * 40}ms` }}
            className={`today-card ${isDone ? 'done' : ''} ${isRoutine ? 'routine' : ''} ${isPickedForToday && !isRoutine ? 'picked' : ''} ${isArchived ? 'archived' : ''} ${isDragging ? 'dragging-source' : ''} ${justDroppedId === task.id ? 'drop-settle-today' : ''}`}
        >
            {isManual && !isArchived && (
                <div className="today-drag-handle" {...attributes} {...listeners} title="ドラッグして並び替え"><GripVertical size={14} strokeWidth={2} /></div>
            )}
            <StatusCheckbox
                statusCode={task.status_code}
                onChange={(newCode) => onStatusChange(task.id, newCode, isRoutine)}
                sparkle={justCompletedId === task.id}
                disabled={isProcessing || isArchived}
            />
            <div className="today-card-info">
                {!isChild && task.parent_title && (
                    <span className="today-parent-label"><Pin size={12} /> {task.parent_title} ›</span>
                )}
                <div className="today-card-title-row">
                    {isRoutine && <span className="today-routine-badge"><RefreshCw size={14} /></span>}
                    {isArchived && <span className="today-archived-badge" title="アーカイブ済み"><Archive size={14} /></span>}
                    <span
                        className={`today-card-title ${isDone ? 'strike' : ''} ${!isRoutine && !isArchived ? 'clickable' : ''}`}
                        onClick={() => {
                            if (!isRoutine && !isArchived) onEdit(task);
                        }}
                        title={isArchived ? "アーカイブ済み" : (!isRoutine ? "クリックして編集" : "")}
                    >
                        {task.title}
                    </span>
                    {task.project_name && (
                        <span className="today-project-badge" style={{ backgroundColor: `${task.project_color}18`, color: task.project_color, borderColor: `${task.project_color}30` }}>
                            <span className="today-project-dot" style={{ backgroundColor: task.project_color }} />
                            {task.project_name}
                        </span>
                    )}
                </div>
                <div className="today-card-meta">
                    {task.tags && task.tags.map(t => (
                        <span key={t.id} className="today-tag"><span className="today-tag-dot" style={{ backgroundColor: t.color }} />{t.name}</span>
                    ))}
                    {isDone && task.completed_at && <span className="today-meta-item"><CheckSquare size={12} /> 完了: {task.completed_at.split(' ')[0]}</span>}
                    {task.due_date && !isDone && <span className="today-meta-item"><Calendar size={12} /> {task.due_date}</span>}
                    {task.estimated_hours > 0 && (
                        <span className="today-meta-item"><Clock size={12} /> {formatMin(task.estimated_hours)}</span>
                    )}
                </div>
            </div>
            <div className="today-card-actions">
                {!isRoutine && !isArchived && (
                    <select value={task.status_code} onChange={e => onStatusChange(task.id, e.target.value, false)}
                        className="today-status" style={{ borderColor: st.color, color: st.color }}
                        disabled={isProcessing}>
                        {statuses.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </select>
                )}
                {!isRoutine && isPickedForToday && !isArchived && (
                    <button className="today-remove" onClick={() => onRemove(task.id)} title="今日やるから外す" disabled={isProcessing}>✕</button>
                )}
            </div>

            <style jsx global>{`
        .today-card {
          display: flex; align-items: center; gap: 10px;
          background: var(--color-surface); border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          padding: 12px 16px;
          transition: box-shadow 120ms var(--ease-out), transform 120ms var(--ease-out);
          touch-action: none;
        }
        .today-card:hover { box-shadow: var(--shadow-card-hover); transform: translateY(-1px); }
        .today-card.done { opacity: 0.45; }
        .today-card.done:hover { opacity: 0.6; }
        .today-card.archived { opacity: 0.3; }
        .today-card.archived:hover { opacity: 0.45; }

        .today-card-info { flex: 1; min-width: 0; }
        .today-parent-label {
          display: flex; align-items: center; gap: 3px;
          font-size: 0.72rem; font-weight: 500;
          color: var(--color-text-secondary); margin-bottom: 1px;
        }
        .today-card-title-row { display: flex; align-items: center; gap: 5px; }
        .today-routine-badge { font-size: 0.78rem; flex-shrink: 0; color: var(--color-text-muted); }
        .today-archived-badge { font-size: 0.72rem; flex-shrink: 0; opacity: 0.5; }
        .today-picked-badge { font-size: 0.78rem; flex-shrink: 0; }
        .today-card-title { font-weight: 500; font-size: 0.875rem; color: var(--color-text); display: block; }
        .today-card-title.strike { text-decoration: line-through; color: var(--color-text-disabled); }
        .today-card-title.clickable { cursor: pointer; transition: color 120ms var(--ease-out); }
        .today-card-title.clickable:hover { color: var(--color-accent); }
        .today-card-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
        .today-project-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 0.65rem; font-weight: 500; padding: 2px 8px;
          border-radius: var(--radius-pill); border: 1px solid;
          white-space: nowrap;
        }
        .today-project-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .today-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 0.68rem; font-weight: 500; padding: 2px 8px; border-radius: var(--radius-pill); background: var(--color-surface-hover); color: var(--color-text-secondary); }
        .today-tag-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .today-meta-item {
          font-size: 0.72rem; color: var(--color-text-secondary); display: flex;
          align-items: center; gap: 3px;
          font-weight: 500;
        }

        .today-card-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; opacity: 0; transition: opacity 120ms var(--ease-out); }
        .today-card:hover .today-card-actions { opacity: 1; }
        .today-status {
          font-weight: 600; font-size: 0.72rem; padding: 3px 6px;
          border-radius: var(--radius-pill); cursor: pointer; border: 1px solid;
          background-color: transparent; font-family: inherit;
          opacity: 1 !important;
        }
        .today-remove {
          background: transparent; border: none; color: var(--color-text-disabled);
          cursor: pointer; font-size: 0.72rem; width: 22px; height: 22px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: color 120ms var(--ease-out);
        }
        .today-remove:hover { color: var(--color-danger); }

        .today-card.dragging-source {
          opacity: 0.15;
          box-shadow: none;
        }
        .today-card.dragging-source > * { visibility: hidden; }
        .today-ghost-header.dragging-source {
          opacity: 0.2;
        }
        .today-ghost-header.dragging-source > * { visibility: hidden; }

        .dnd-overlay-today {
          cursor: grabbing;
          background: var(--color-surface);
          border: 1px solid var(--color-accent);
          border-radius: var(--radius-md);
          opacity: 0.95;
          box-shadow: var(--shadow-lg);
        }

        @keyframes dropSettleToday {
          0% { background: var(--color-accent-subtle); }
          100% { background: var(--color-surface); }
        }
        .today-card.drop-settle-today { animation: dropSettleToday 0.3s var(--ease-out); }

        .today-drag-handle {
          cursor: grab; color: var(--color-text-disabled);
          display: flex; align-items: center; justify-content: center;
          width: 16px; align-self: stretch; flex-shrink: 0;
          opacity: 0; transition: opacity 120ms var(--ease-out); user-select: none;
        }
        .today-card:hover .today-drag-handle, .today-ghost-header:hover .today-drag-handle { opacity: 0.4; }
        .today-drag-handle:hover { opacity: 1 !important; color: var(--color-text-muted); }
        .today-drag-handle:active { cursor: grabbing; }
      `}</style>
        </div>
    );
}
