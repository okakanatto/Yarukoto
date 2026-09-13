'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ChevronRight, Clock3, List, Play, X } from 'lucide-react';
import { workChoices, recordsToRevisit } from '@/lib/workChoices';
import { captureExcerpt, workSummary } from '@/lib/workEntries';
import { classifyWorkReference } from '@/lib/workReferences';
import styles from './WorkLaunch.module.css';

export default function WorkLaunch({ tasks, todayTasks, today, previousId, onOpen, onStart, onBrowse, onCapture, loading }) {
    const [choiceId, setChoiceId] = useState(null);
    const [alternatives, setAlternatives] = useState(false);
    const [revisiting, setRevisiting] = useState(false);
    const [reviewed, setReviewed] = useState([]);
    const choices = useMemo(() => workChoices(tasks, todayTasks, today, previousId), [tasks, todayTasks, today, previousId]);
    const choice = choices.find(item => item.task.id === choiceId) || choices[0];
    const revisit = useMemo(() => recordsToRevisit(tasks, today).filter(task => !reviewed.includes(task.id)), [tasks, today, reviewed]);
    const summary = choice ? workSummary(choice.task) : null;
    const hasReference = choice && classifyWorkReference(choice.task.source_ref).kind !== 'text';
    return <div className={styles.home}>
        {loading ? <p className={styles.empty}>読み込み中…</p> : choice ? <article className={styles.card} aria-label="取りかかる仕事">
            <div className={styles.eyebrow}><span>{choice.reason}</span><span>{choice.task.project_name}</span></div>
            {choice.task.parent_title && <p className={styles.parent}>{choice.task.parent_title}</p>}
            <h2><button onClick={() => choice.task.is_routine ? onBrowse('today') : onOpen(choice.task.id)}>{choice.task.title}</button></h2>
            {choice.task.due_date && <p className={`${styles.due} ${choice.task.due_date < today ? styles.overdue : ''}`}><CalendarDays size={15} />期限 {choice.task.due_date}</p>}
            {summary.step && <p className={styles.step}><ArrowRight size={17} /><span>{summary.step}</span></p>}
            {summary.context && summary.context !== choice.task.title && <p className={styles.context}>{summary.result && <span>前回</span>}{summary.context}</p>}
            <div className={styles.actions}><button className={styles.primary} onClick={() => choice.task.is_routine ? onBrowse('today') : hasReference ? onStart(choice.task.id, null, true) : onStart(choice.task.id)}><Play size={16} />{choice.task.is_routine ? '今日の一覧を開く' : hasReference ? '資料を開いて始める' : '取りかかる'}</button>{!choice.task.is_routine && <button className={styles.short} onClick={() => onStart(choice.task.id, 5)}><Clock3 size={16} />5分だけ</button>}</div>
            <button className={styles.alternativesToggle} aria-expanded={alternatives} onClick={() => setAlternatives(value => !value)}>別の仕事を選ぶ<ChevronRight size={15} /></button>
            {alternatives && <div className={styles.alternatives}>{choices.filter(item => item.task.id !== choice.task.id).slice(0, 3).map(item => <button key={item.task.id} onClick={() => { setChoiceId(item.task.id); setAlternatives(false); }}><span>{item.reason}</span><strong>{item.task.title}</strong>{workSummary(item.task).context && <small>{workSummary(item.task).context}</small>}<ChevronRight size={15} /></button>)}<button onClick={() => onBrowse('open')}>一覧から選ぶ<ArrowRight size={15} /></button></div>}
        </article> : <div className={styles.empty}><h2>気になっていることから</h2><button className={styles.primary} onClick={onCapture}>書き留める</button></div>}
        <div className={styles.shelf}><button onClick={() => onBrowse('today')}><List size={18} /><span>仕事の一覧</span><ChevronRight size={16} /></button><button aria-expanded={revisiting} onClick={() => setRevisiting(value => !value)}><Clock3 size={18} /><span>記録を見返す</span><ChevronRight size={16} /></button><Link href="/projects"><span>プロジェクト</span><ChevronRight size={16} /></Link></div>
        {revisiting && <section className={styles.revisit} aria-label="記録を一つずつ見返す"><div className={styles.revisitHeading}><span>しばらく開いていない記録</span><button aria-label="見返しを終える" onClick={() => setRevisiting(false)}><X size={17} /></button></div>{revisit[0] ? <><h3>{revisit[0].title}</h3><p>{captureExcerpt(revisit[0]) || workSummary(revisit[0]).context}</p><div className={styles.revisitActions}><button onClick={() => onOpen(revisit[0].id)}>開く<ArrowRight size={15} /></button><button onClick={() => setReviewed(value => [...value, revisit[0].id])}>次の記録<ChevronRight size={15} /></button></div></> : <p>この表示の記録は一通り見ました。</p>}</section>}
    </div>;
}
