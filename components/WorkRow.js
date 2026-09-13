'use client';

import { CalendarDays, CornerDownRight, Hourglass, Sun, Repeat, ArrowRight } from 'lucide-react';
import StatusCheckbox from './StatusCheckbox';
import { formatMin } from '@/lib/utils';
import { workSummary } from '@/lib/workEntries';

export default function WorkRow({ task, onOpen, onStatus, onToday, disabled = false, selected = false }) {
    const today = new Date().toLocaleDateString('sv-SE');
    const summary = workSummary(task);
    return <div className={`work-row ${selected ? 'work-row-selected' : ''}`}>
        {onStatus && <StatusCheckbox statusCode={task.status_code} disabled={disabled} onChange={code => onStatus(task.id, code)} />}
        <button className="work-row-main" onClick={() => onOpen(task.id)} aria-pressed={selected}>
            {task.parent_title && <span className="work-row-parent"><CornerDownRight size={12} />{task.parent_title}</span>}
            <strong>{task.title}</strong>
            {summary.step && <span className="work-row-step"><ArrowRight size={13} />{summary.step}</span>}
            {summary.context && summary.context !== task.title && summary.context !== summary.step && <span className="work-row-note">{summary.context}</span>}
            <span className="work-row-meta">
                {task.is_routine && <span><Repeat size={12} />ルーティン</span>}
                {task.project_name && <span><i style={{ background: task.project_color || 'var(--color-accent)' }} />{task.project_name}</span>}
                {task.due_date && <span className={task.due_date < today && Number(task.status_code) !== 3 ? 'work-overdue' : ''}><CalendarDays size={12} />{task.due_date === today ? '今日が期限' : task.due_date}</span>}
                {task.waiting_on && <span><Hourglass size={12} />{task.waiting_on}</span>}
                {task.estimated_hours > 0 && <span>{formatMin(task.estimated_hours)}</span>}
            </span>
        </button>
        {onToday && <button className={`work-row-plan ${task.today_date === today ? 'is-planned' : ''}`} aria-label={task.today_date === today ? `${task.title}を今日の予定から外す` : `${task.title}を今日に選ぶ`} title={task.today_date === today ? '今日の予定から外す' : '今日に選ぶ'} aria-pressed={task.today_date === today} disabled={disabled} onClick={() => onToday(task.id, task.today_date)}><Sun size={17} /></button>}
    </div>;
}
