import { useRef, useState } from 'react';

/**
 * Generic drag-and-drop reorder hook using native HTML5 DnD.
 * Extracted from settings/page.js (Phase 2-2).
 *
 * @param {Array} items - The current array of items
 * @param {Function} setItems - State setter for items array
 * @param {object} [options]
 * @param {Function} [options.onReordered] - Async callback invoked after reorder with the new array
 * @returns {{ onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, dragOverIdx }}
 */
export function useDragReorder(items, setItems, { onReordered } = {}) {
    const dragRef = useRef(null);
    const [dragOverIdx, setDragOverIdx] = useState(null);

    const onDragStart = (i) => (e) => {
        dragRef.current = i;
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => {
            e.target.style.opacity = '0.4';
        });
    };

    const onDragEnd = (e) => {
        e.target.style.opacity = '1';
        dragRef.current = null;
        setDragOverIdx(null);
    };

    const onDragOver = (i) => (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIdx(i);
    };

    const onDragLeave = () => {
        setDragOverIdx(null);
    };

    const onDrop = (i) => async (e) => {
        e.preventDefault();
        setDragOverIdx(null);
        const from = dragRef.current;
        if (from === null || from === i) return;
        const newArr = [...items];
        const [moved] = newArr.splice(from, 1);
        newArr.splice(i, 0, moved);
        setItems(newArr);
        dragRef.current = null;
        if (onReordered) await onReordered(newArr);
    };

    return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, dragOverIdx };
}
