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
          padding: 8px 16px;
          background: var(--color-surface);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          font-size: 0.78rem;
          touch-action: none;
          transition: box-shadow 120ms var(--ease-out), transform 120ms var(--ease-out);
        }
        .today-ghost-header:hover { box-shadow: var(--shadow-card-hover); transform: translateY(-1px); }
        .today-ghost-icon {
          flex-shrink: 0;
          color: var(--color-text-muted);
        }
        .today-ghost-title {
          font-weight: 600;
          color: var(--color-text-secondary);
          font-size: 0.72rem;
        }
      `}</style>
        </div>
    );
}
