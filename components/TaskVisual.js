'use client';

import { CalendarDays } from 'lucide-react';
import { formatMin, todayStr } from '@/lib/utils';
import styles from './TaskVisual.module.css';

function colorStyle(color) {
    return { '--marker-color': color || 'var(--color-text-muted)' };
}

export function TaskStatus({ code, label, color }) {
    const text = label || '未設定';
    return (
        <span className={`${styles.mark} ${[3, 5].includes(Number(code)) ? styles.done : ''}`} title={text}>
            <span className={styles.dot} style={colorStyle(color || ({1:"#8c96a4",2:"#3b82f6",3:"#16a34a",4:"#d97706",5:"#8c96a4"})[code])} aria-hidden="true" />
            <span className={styles.label}>{text}</span>
        </span>
    );
}

export function ProjectMark({ name, color }) {
    if (!name) return <span className={styles.unset}>—</span>;
    return (
        <span className={styles.mark} title={name}>
            <span className={styles.dot} style={colorStyle(color)} aria-hidden="true" />
            <span className={styles.label}>{name}</span>
        </span>
    );
}

function datePresentation(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return { short: value, full: value };
    const [, year, month, day] = match;
    return {
        short: `${Number(month)}/${Number(day)}`,
        full: `${year}年${Number(month)}月${Number(day)}日`,
    };
}

export function TaskDue({ date, done = false }) {
    if (!date) return <span className={styles.unset}>—</span>;
    const { short, full } = datePresentation(date);
    const overdue = !done && String(date) < todayStr();
    return <time className={`${styles.due} ${overdue ? styles.overdue : ''}`} dateTime={date} title={full} aria-label={overdue ? `${full}、期限超過` : full}><CalendarDays size={12} aria-hidden="true" />{short}</time>;
}

export function EffortValue({ minutes }) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return <span className={styles.unset}>—</span>;
    return <span className={styles.effort} title={`${value}分`}>{formatMin(value)}</span>;
}
