'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import StatusCheckbox from '@/components/StatusCheckbox';
import { TaskStatus, TaskDue, ProjectMark, EffortValue } from '@/components/TaskVisual';
import { RefreshCw, Archive, GripVertical, X } from 'lucide-react';

export default function TodayCardItem({ task, isManual, isChild = false, statuses, statusMap, selectedDate, onStatusChange, onRemove, onEdit, justCompletedId, justDroppedId = null, isProcessing }) {
    const isRoutine = !!task.is_routine, isArchived = !!task.is_archived, isDone = Number(task.status_code) === 3;
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !isManual || isArchived });
    const status = statusMap[task.status_code] || { label: task.status_label || '未設定', color: task.status_color };
    return <div ref={setNodeRef} style={transform ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 100 : 'auto' } : undefined}
        className={['today-card', isDone && 'done', isArchived && 'archived', isDragging && 'dragging-source', justDroppedId === task.id && 'drop-settle-today'].filter(Boolean).join(' ')}>
        <div className="today-check">
            {isManual && !isArchived && <button className="today-drag-handle" {...attributes} {...listeners} aria-label={task.title + 'を並び替え'}><GripVertical size={14} /></button>}
            <StatusCheckbox statusCode={task.status_code} onChange={code => onStatusChange(task.id, code, isRoutine)} sparkle={justCompletedId === task.id} disabled={isProcessing || isArchived} />
        </div>
        <div className="today-card-info">
            {!isChild && task.parent_title && <span className="today-parent-label">{task.parent_title}</span>}
            <div className="today-card-title-row">
                {isRoutine && <RefreshCw size={14} className="today-kind" aria-label="ルーティン" />}
                {isArchived && <Archive size={14} className="today-kind" aria-label="アーカイブ" />}
                {!isRoutine && !isArchived ? <button className="today-card-title" onClick={() => onEdit(task)}>{task.title}</button> : <span className="today-card-title">{task.title}</span>}
            </div>
            {!!task.tags?.length && <div className="today-card-tags">{task.tags.map(tag => <span key={tag.id}><i style={{ background: tag.color }} />{tag.name}</span>)}</div>}
            {isDone && task.completed_at && <span className="today-parent-label">完了 {task.completed_at.slice(0, 10)}</span>}
        </div>
        <div className="today-status-cell">
            {!isRoutine && !isArchived ? <label className="today-status-control">
                <TaskStatus code={task.status_code} label={status.label} color={status.color} />
                <select aria-label={task.title + 'の状態'} value={task.status_code} onChange={event => onStatusChange(task.id, event.target.value, false)} disabled={isProcessing}>
                    {statuses.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
            </label> : <TaskStatus code={task.status_code} label={status.label} color={status.color} />}
        </div>
        <div className="today-due"><TaskDue date={task.due_date} done={isDone} /></div>
        <div className="today-project"><ProjectMark name={task.project_name} color={task.project_color} /></div>
        <div className="today-estimate"><EffortValue minutes={task.estimated_hours} /></div>
        <div className="today-card-actions">{!isRoutine && !isArchived && task.today_date === selectedDate && <button className="today-remove" onClick={() => onRemove(task.id)} title="実行予定を外す" aria-label={task.title + 'の実行予定を外す'} disabled={isProcessing}><X size={15} /></button>}</div>
    </div>;
}
