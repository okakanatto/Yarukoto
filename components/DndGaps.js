'use client';

import { useDroppable } from '@dnd-kit/core';

/**
 * Drop zone for un-nesting a child task back to root level.
 * Displays a visual indicator line when a dragged item hovers over it.
 */
export function UnnestGap({ id }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`tl-unnest-gap ${isOver ? 'drag-over' : ''}`}
        >
            <div className="tl-unnest-gap-line" />
            {isOver && <span className="tl-unnest-gap-label">ここにドロップして親タスクに戻す</span>}
        </div>
    );
}

/**
 * Drop zone for reordering tasks in manual sort mode.
 * Appears between tasks during drag operations.
 */
export function ReorderGap({ id }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`tl-reorder-gap ${isOver ? 'drag-over' : ''}`}
        >
            <div className="tl-reorder-gap-line" />
        </div>
    );
}
