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
            <style jsx global>{`
                .tl-reorder-gap {
                    position:relative; padding:3px 0;
                    transition:padding .15s ease; animation:fadeIn .2s ease;
                }
                .tl-reorder-gap-line {
                    height:2px; border-radius:1px;
                    background:transparent; transition:all .15s ease;
                }
                .tl-reorder-gap.drag-over { padding:8px 0; }
                .tl-reorder-gap.drag-over .tl-reorder-gap-line {
                    height:3px; background:var(--color-accent);
                    box-shadow:0 0 8px rgba(139,92,246,.35);
                }
                @keyframes fadeIn { from{opacity:0} to{opacity:1} }
            `}</style>
        </div>
    );
}
