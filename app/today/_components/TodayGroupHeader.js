'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Pin, GripVertical } from 'lucide-react';

/**
 * Ghost parent header for children whose parent is not in today's list.
 * Draggable in manual mode so the group can be reordered.
 */
export default function TodayGroupHeader({ parentId, title, isManual }) {
    const ghostId = `ghost_${parentId}`;
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: ghostId,
        disabled: !isManual,
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 100 : 'auto',
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} className={`today-ghost-header ${isDragging ? 'dragging-source' : ''}`}>
            {isManual && (
                <div className="today-drag-handle" {...attributes} {...listeners} title="ドラッグして並び替え"><GripVertical size={14} strokeWidth={2} /></div>
            )}
            <span className="today-ghost-icon"><Pin size={14} /></span>
            <span className="today-ghost-title">{title}</span>

            <style jsx global>{`
        .today-ghost-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-left: 4px solid var(--border-color);
          font-size: 0.78rem;
          touch-action: none;
          transition: background 100ms, border-left-color 100ms;
        }
        .today-ghost-header + .today-ghost-header { border-top: 1px solid var(--border-color); }
        .today-ghost-header:hover { background: var(--color-surface-hover); border-left-color: var(--color-accent); }
        .today-ghost-icon {
          flex-shrink: 0;
          color: var(--color-text-muted);
        }
        .today-ghost-title {
          font-weight: 700;
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 0.72rem;
        }
      `}</style>
        </div>
    );
}
