'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

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
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 'auto',
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} className="today-ghost-header">
            {isManual && (
                <div className="today-drag-handle" {...attributes} {...listeners} title="ドラッグして並び替え">⋮⋮</div>
            )}
            <span className="today-ghost-icon">📌</span>
            <span className="today-ghost-title">{title}</span>

            <style jsx global>{`
        .today-ghost-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--color-surface-hover);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          touch-action: none;
          animation: tcIn 0.3s cubic-bezier(.16,1,.3,1) both;
        }
        .today-ghost-icon {
          font-size: 0.8rem;
          flex-shrink: 0;
        }
        .today-ghost-title {
          font-weight: 600;
          color: var(--color-text-secondary);
        }
      `}</style>
        </div>
    );
}
