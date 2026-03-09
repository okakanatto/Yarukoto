import { formatMin } from '@/lib/utils';
import { Inbox, RefreshCw, Archive, Pin, Clock } from 'lucide-react';

export default function DoneDayDetail({ selectedDayLabel, dayTasks, detailLoading }) {
    return (
        <div className="done-detail">
            <h3 className="done-detail-title">
                {selectedDayLabel}
                <span className="done-detail-count">{dayTasks.length}件</span>
            </h3>

            {detailLoading && <div className="done-loading"><span className="spinner" /> 読み込み中...</div>}

            {!detailLoading && dayTasks.length === 0 && (
                <div className="done-empty">
                    <span className="done-empty-icon"><Inbox size={48} strokeWidth={1.2} /></span>
                    <span>完了したタスクはありません</span>
                </div>
            )}

            {!detailLoading && dayTasks.length > 0 && (
                <div className="done-task-list">
                    {dayTasks.map((task, idx) => (
                        <div key={task.id}
                            className={`done-task ${task.is_routine ? 'routine' : ''} ${task.archived_at ? 'archived' : ''}`}
                            style={{ animationDelay: `${idx * 30}ms` }}>
                            <span className="done-check">✓</span>
                            <div className="done-task-info">
                                <div className="done-task-title-row">
                                    {task.is_routine && <span className="done-badge-icon"><RefreshCw size={14} /></span>}
                                    {task.archived_at && <span className="done-badge-icon" title="アーカイブ済み"><Archive size={14} /></span>}
                                    <span className="done-task-title">{task.title}</span>
                                </div>
                                {task.parent_title && (
                                    <span className="done-parent"><Pin size={12} /> {task.parent_title}</span>
                                )}
                                <div className="done-task-meta">
                                    {task.tags?.map(t => (
                                        <span key={t.id} className="done-tag" style={{ backgroundColor: t.color }}>{t.name}</span>
                                    ))}
                                    {task.estimated_hours > 0 && (
                                        <span className="done-meta-text"><Clock size={12} /> {formatMin(task.estimated_hours)}</span>
                                    )}
                                </div>
                            </div>
                            {task.completed_at && !task.is_routine && (
                                <span className="done-time">{task.completed_at.split(' ')[1]?.slice(0, 5)}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
