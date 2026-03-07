'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import StatusCheckbox from '@/components/StatusCheckbox';
import { formatMin } from '@/lib/utils';

/**
 * Individual today-card with @dnd-kit draggable support.
 */
export default function TodayCardItem({ task, isManual, isChild = false, statuses, statusMap, selectedDate, onStatusChange, onRemove, onEdit, justCompletedId, index, isProcessing }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        disabled: !isManual || !!task.is_archived || isChild,
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
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
            className={`today-card ${isDone ? 'done' : ''} ${isRoutine ? 'routine' : ''} ${isPickedForToday && !isRoutine ? 'picked' : ''} ${isArchived ? 'archived' : ''}`}
        >
            {isManual && !isArchived && !isChild && (
                <div className="today-drag-handle" {...attributes} {...listeners} title="ドラッグして並び替え">⋮⋮</div>
            )}
            <StatusCheckbox
                statusCode={task.status_code}
                onChange={(newCode) => onStatusChange(task.id, newCode, isRoutine)}
                sparkle={justCompletedId === task.id}
                disabled={isProcessing || isArchived}
            />
            <div className="today-card-info">
                {!isChild && task.parent_title && (
                    <span className="today-parent-label">📌 {task.parent_title} ›</span>
                )}
                <div className="today-card-title-row">
                    {isRoutine && <span className="today-routine-badge">🔄</span>}
                    {isArchived && <span className="today-archived-badge" title="アーカイブ済み">📦</span>}
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
                        <span key={t.id} className="today-tag" style={{ backgroundColor: t.color }}>{t.name}</span>
                    ))}
                    {isDone && task.completed_at && <span className="today-meta-item">☑ 完了: {task.completed_at.split(' ')[0]}</span>}
                    {task.due_date && !isDone && <span className="today-meta-item">📅 {task.due_date}</span>}
                    {task.estimated_hours > 0 && (
                        <span className="today-meta-item">⏱ {formatMin(task.estimated_hours)}</span>
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
          display: flex; align-items: center; gap: 0.75rem;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-md); padding: 0.75rem 1rem;
          box-shadow: var(--shadow-sm); transition: all 0.2s;
          animation: tcIn 0.3s cubic-bezier(.16,1,.3,1) both;
          touch-action: none;
        }
        @keyframes tcIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .today-card:hover { border-color: var(--border-color-hover); box-shadow: var(--shadow-card-hover); }
        .today-card.done { opacity: 0.55; }
        .today-card.done:hover { opacity: 0.75; }
        .today-card.archived { opacity: 0.4; background: var(--color-surface-hover); }
        .today-card.archived:hover { opacity: 0.55; }
        .today-card.routine { border-left: 3px solid var(--color-primary); }
        .today-card.picked { border-left: 3px solid var(--color-warning); }

        .today-card-info { flex: 1; min-width: 0; }
        .today-parent-label {
          display: block; font-size: 0.7rem; font-weight: 500;
          color: var(--color-text-muted); margin-bottom: 0.15rem;
          letter-spacing: 0.01em;
        }
        .today-card-title-row { display: flex; align-items: center; gap: 0.35rem; }
        .today-routine-badge {
          font-size: 0.8rem; flex-shrink: 0;
        }
        .today-archived-badge {
          font-size: 0.75rem; flex-shrink: 0; opacity: 0.7;
        }
        .today-picked-badge {
          font-size: 0.8rem; flex-shrink: 0; filter: grayscale(0.2);
        }
        .today-card-title { font-weight: 600; font-size: 0.92rem; color: var(--color-text); display: block; }
        .today-card-title.strike { text-decoration: line-through; color: var(--color-text-disabled); }
        .today-card-title.clickable { cursor: pointer; transition: color 0.15s; }
        .today-card-title.clickable:hover { color: var(--color-primary); text-decoration: underline; }
        .today-card-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.25rem; }
        .today-project-badge {
          display:inline-flex; align-items:center; gap:.25rem;
          font-size:.63rem; font-weight:600; padding:.1rem .5rem;
          border-radius:10px; border:1px solid;
          white-space:nowrap;
        }
        .today-project-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
        .today-tag { font-size: 0.63rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 10px; color: #fff; }
        .today-meta-item { font-size: 0.75rem; color: var(--color-text-muted); }

        .today-card-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
        .today-status {
          font-weight: 600; font-size: 0.78rem; padding: 0.3rem 0.5rem;
          border-radius: var(--radius-sm); cursor: pointer; border: 1px solid;
          background: transparent; font-family: inherit;
        }
        .today-remove {
          background: transparent; border: 1px solid transparent; color: var(--color-text-disabled);
          cursor: pointer; font-size: 0.75rem; width: 24px; height: 24px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: all 0.15s;
        }
        .today-remove:hover { background: var(--color-danger-bg); color: var(--color-danger); border-color: rgba(220,38,38,.2); }

        /* Drag handle (shared with TodayGroupHeader) */
        .today-drag-handle {
          cursor:grab; color:var(--color-text-disabled);
          display:flex; align-items:center; justify-content:center;
          width:20px; height:100%; align-self:stretch; flex-shrink:0;
          opacity:0.5; transition:opacity .2s; user-select:none;
          font-size:.85rem;
        }
        .today-drag-handle:hover, .today-card:hover .today-drag-handle, .today-ghost-header:hover .today-drag-handle { opacity:1; }
        .today-drag-handle:active { cursor:grabbing; }
      `}</style>
        </div>
    );
}
