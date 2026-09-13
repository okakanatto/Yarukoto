'use client';
import { useEffect, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Plus } from 'lucide-react';
import { EffortValue, ProjectMark, TaskDue, TaskStatus } from './TaskVisual';
import styles from './TaskTable.module.css';

export function TableDropGap({ id, columns, label }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return <tr ref={setNodeRef} className={`${styles.dropGap} ${isOver ? styles.over : ''}`}><td colSpan={columns}>{label || <span />}</td></tr>;
}
function EditableCell({ task, field, disabled, options, onEdit }) {
    const [editing, setEditing] = useState(false), [value, setValue] = useState('');
    const input = useRef(null), cancelled = useRef(false), submitted = useRef(false);
    useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
    const list = options(field), raw = task[field];
    let label = list ? list.find(item => Number(item.value) === Number(raw))?.label : raw;
    if (field === 'tags') label = task.tags?.map(tag => tag.name).join(' · ');
    const date = field === 'due_date' || field === 'today_date';
    const finish = async next => {
        if (cancelled.current || submitted.current) return;
        submitted.current = true; setEditing(false);
        if (String(next ?? '') !== String(raw ?? '')) await onEdit([task.id], field, next);
    };
    if (field === 'tags') return <span className={styles.tags} title={label}>{label || '—'}</span>;
    if (editing) {
        const common = { ref: input, value, 'aria-label': `${task.title}の${{ due_date: '期限', today_date: '実行予定', estimated_hours: '見積（分）', status_code: '状態', project_id: 'プロジェクト', importance_level: '重要度', urgency_level: '緊急度' }[field]}`, onKeyDown: event => { if (event.key === 'Escape') { cancelled.current = true; setEditing(false); } else if (event.key === 'Enter') { event.preventDefault(); finish(value); } }, onBlur: () => finish(value) };
        return list ? <select {...common} onChange={event => { setValue(event.target.value); finish(event.target.value); }}>{field !== 'status_code' && <option value="">未設定</option>}{list.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : date ? <input {...common} type="date" onChange={event => setValue(event.target.value)} /> : <span className={styles.numberInput}><input {...common} type="number" min={0} onChange={event => setValue(event.target.value)} /><span>分</span></span>;
    }
    const content = {
        status_code: <TaskStatus code={raw} label={label} color={task.status_color} />,
        project_id: <ProjectMark name={label} color={task.project_color} />,
        due_date: <TaskDue date={raw} done={[3, 5].includes(Number(task.status_code))} />,
        today_date: <TaskDue date={raw} done />,
        estimated_hours: <EffortValue minutes={raw} />,
    }[field];
    return <button className={styles.cell} disabled={disabled} title={!content ? label || '未設定' : undefined} onClick={() => { cancelled.current = false; submitted.current = false; setValue(raw ?? ''); setEditing(true); }}>
        {content || (label !== null && label !== undefined && label !== '' ? label : <span className={styles.unset}>—</span>)}
    </button>;
}
export default function TaskTableRow({ row, columns, selected, active, onSelect, onOpen, onToggle, onEdit, options, disabled, archived, draggable, dragId, manual, onAdd, onArchive, onRestore, onDelete }) {
    const { task, depth, hasChildren, expanded, contextOnly, index } = row;
    const drag = useDraggable({ id: task.id, disabled: !draggable });
    const drop = useDroppable({ id: task.id, disabled: !draggable || dragId === task.id });
    const path = (task.ancestors || row.ancestors || []).map(item => item.title).join(' / ');
    const gapId = task.parent_id && depth > 0 ? `reorder-child-${task.parent_id}-${index}` : `reorder-root-${index}`;
    return <>
        {dragId && manual && <TableDropGap id={gapId} columns={columns.length + 3} />}
        <tr ref={node => { drag.setNodeRef(node); drop.setNodeRef(node); }} className={`${active ? styles.selectedRow : ''} ${contextOnly ? styles.contextRow : ''} ${drop.isOver ? styles.over : ''} ${drag.isDragging ? styles.dragging : ''}`} aria-selected={selected}>
            <td className={styles.check}>{!archived && !contextOnly && <input type="checkbox" aria-label={`${task.title}を選択`} checked={selected} disabled={disabled} onChange={() => onSelect(task.id)} />}</td>
            <td className={styles.taskCell}><div className={styles.taskLine} style={{ '--depth': depth }}>
                {draggable && <button className={styles.grip} {...drag.listeners} {...drag.attributes} title="ドラッグして移動" aria-label={`${task.title}を移動`}><GripVertical size={13} /></button>}
                {hasChildren ? <button className={styles.expand} aria-label={`${task.title}の子タスクを${expanded ? '閉じる' : '開く'}`} aria-expanded={expanded} onClick={() => onToggle(task.id)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className={styles.expandSpace} />}
                <button className={styles.title} onClick={() => onOpen(task.id)} title={task.title}>{(depth === 0 && path) && <small>{path}</small>}<span>{task.title}</span></button>{contextOnly && <small className={styles.parentHint}>親</small>}
            </div></td>
            {columns.map(field => <td key={field}><EditableCell task={task} field={field} disabled={disabled || contextOnly} options={options} onEdit={onEdit} /></td>)}
            <td className={styles.rowActions}><details className={styles.rowMenu}><summary aria-label={`${task.title}の操作`}><MoreHorizontal size={17} /></summary><div className={styles.menu}>{!archived && <><button disabled={disabled} onClick={event => { event.currentTarget.closest('details').open = false; onAdd(task.id); }}><Plus size={14} />子タスク</button><button disabled={disabled} onClick={() => onOpen(task.id)}>詳細を編集</button>{[3, 5].includes(Number(task.status_code)) && <button disabled={disabled} onClick={() => onArchive(task.id)}>アーカイブ</button>}<button disabled={disabled} onClick={() => onDelete(task.id)}>削除</button></>}{archived && <button onClick={() => onRestore(task.id)}>復元</button>}</div></details></td>
        </tr>
    </>;
}
