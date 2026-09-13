'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CornerDownRight, GripVertical } from 'lucide-react';

export default function TodayGroupHeader({ parentId, title, isManual }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: 'ghost_' + parentId, disabled: !isManual });
    return <div ref={setNodeRef} style={transform ? { transform: CSS.Translate.toString(transform) } : undefined} className={'today-ghost-header' + (isDragging ? ' dragging-source' : '')}>
        {isManual && <button className="today-drag-handle" {...attributes} {...listeners} aria-label={title + 'のグループを並び替え'}><GripVertical size={14} /></button>}
        <CornerDownRight size={14} /><span>{title}</span>
    </div>;
}
