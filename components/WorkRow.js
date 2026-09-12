'use client';

import { ArrowUpRight, CalendarDays, CornerDownRight, Hourglass } from 'lucide-react';
import StatusCheckbox from './StatusCheckbox';

export default function WorkRow({ task, onOpen, onStatus, disabled = false }) {
    const note = (task.notes || task.capture_text || '').trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' ');
    return <div className="work-row">
        {onStatus && <StatusCheckbox statusCode={task.status_code} disabled={disabled} onChange={code => onStatus(task.id, code)} />}
        <button className="work-row-main" onClick={() => onOpen(task.id)}>
            {task.parent_title && <span className="work-row-parent"><CornerDownRight size={12} />{task.parent_title}</span>}
            <strong>{task.title}</strong>
            {note && note !== task.title && <span className="work-row-note">{note}</span>}
            <span className="work-row-meta">
                {task.project_name && <span><i style={{ background: task.project_color || 'var(--color-accent)' }} />{task.project_name}</span>}
                {task.due_date && <span className={task.due_date < new Date().toLocaleDateString('sv-SE') && task.status_code !== 3 ? 'work-overdue' : ''}><CalendarDays size={12} />期限 {task.due_date}</span>}
                {task.waiting_on && <span><Hourglass size={12} />{task.waiting_on}</span>}
            </span>
        </button>
        <button className="work-row-open" aria-label={`${task.title}を開く`} onClick={() => onOpen(task.id)}><ArrowUpRight size={17} /></button>
    </div>;
}
