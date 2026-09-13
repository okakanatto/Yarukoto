'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Clock3, List, Play } from 'lucide-react';
import { workChoices, recordsToRevisit } from '@/lib/workChoices';
import { captureExcerpt, workSummary } from '@/lib/workEntries';
import { readWorkReview, reviewToken, writeWorkReview } from '@/lib/workReview';
import { classifyWorkReference } from '@/lib/workReferences';
import styles from './WorkLaunch.module.css';

export default function WorkLaunch({ tasks, todayTasks, today, previousId, onOpen, onStart, onBrowse, onCapture, loading }) {
    const [choiceId, setChoiceId] = useState(null);
    const [mode, setMode] = useState('home');
    const [review, setReview] = useState({ open: false, current: null, seen: [] });
    const [warning, setWarning] = useState('');
    const modeHeading = useRef(null);
    useEffect(() => {
        const timer = setTimeout(() => { const saved = readWorkReview(); setReview(saved); if (saved.open) setMode('review'); }, 0);
        return () => clearTimeout(timer);
    }, []);
    useEffect(() => {
        if (mode !== 'home') { modeHeading.current?.focus(); const pane = modeHeading.current?.closest('.desk-launch-scroll'); if (pane) pane.scrollTop = 0; }
    }, [mode]);
    const choices = useMemo(() => workChoices(tasks, todayTasks, today, previousId), [tasks, todayTasks, today, previousId]);
    const choice = choices.find(item => item.task.id === choiceId) || choices[0];
    const revisit = useMemo(() => recordsToRevisit(tasks, today).filter(task => !review.seen.includes(reviewToken(task))), [tasks, today, review.seen]);
    const current = revisit.find(task => reviewToken(task) === review.current) || revisit[0];
    const summary = choice ? workSummary(choice.task) : null;
    const hasReference = choice && classifyWorkReference(choice.task.source_ref).kind !== 'text';
    function saveReview(value) { setReview(value); setWarning(writeWorkReview(value) ? '' : '見返しの位置を保存できませんでした。'); }
    function openReview() { saveReview({ ...review, open: true, current: current ? reviewToken(current) : null }); setMode('review'); }
    function closeMode() { if (mode === 'review') saveReview({ ...review, open: false }); setMode('home'); }
    function nextRecord() {
        const seen = [...review.seen, reviewToken(current)];
        const next = revisit.find(task => !seen.includes(reviewToken(task)));
        saveReview({ open: true, seen, current: next ? reviewToken(next) : null });
    }
    return <div className={styles.home} onKeyDown={event => { if (event.key === 'Escape' && mode !== 'home') { event.preventDefault(); closeMode(); } }}>
        {warning && <p role="alert" className={styles.warning}>{warning}</p>}
        {loading ? <p className={styles.empty}>読み込み中…</p> : mode !== 'home' ? <>
            <div className={styles.modeNav}><button className={styles.back} onClick={closeMode}><ArrowLeft size={16} />{mode === 'review' ? '見返しを終える' : '戻る'}</button>{mode === 'review' && <button className={styles.back} onClick={() => onBrowse('all')}>仕事の一覧<ArrowRight size={15} /></button>}</div>
            {mode === 'choices' ? <section aria-label="別の仕事を選ぶ"><h2 ref={modeHeading} tabIndex={-1} className={styles.modeTitle}>仕事を選ぶ</h2>
                <div className={styles.alternatives}>{choices.filter(item => item.task.id !== choice?.task.id).slice(0, 4).map(item => <button key={item.task.id} onClick={() => { setChoiceId(item.task.id); setMode('home'); }}><span>{item.reason}{item.task.project_name && ' · ' + item.task.project_name}</span><strong>{item.task.title}</strong>{workSummary(item.task).context && <small>{workSummary(item.task).context}</small>}<ChevronRight size={15} /></button>)}<button onClick={() => onBrowse('all')}>一覧から選ぶ<ArrowRight size={15} /></button></div>
            </section> : <section className={styles.revisit} aria-label="記録を一つずつ見返す"><h2 ref={modeHeading} tabIndex={-1} className={styles.modeTitle}>記録を見返す</h2>
                {current ? <><span className={styles.reviewMeta}>{current.project_name}{current.due_date && ' · 期限 ' + current.due_date}</span><h3>{current.title}</h3><p>{workSummary(current).context || captureExcerpt(current) || '背景はまだ記録されていません。'}</p><div className={styles.revisitActions}><button onClick={() => { saveReview({ ...review, open: true, current: reviewToken(current) }); onOpen(current.id); }}>開く<ArrowRight size={15} /></button><button onClick={nextRecord}>次の記録<ChevronRight size={15} /></button></div></>
                    : <><p>この回の記録は一通り見ました。</p><button className={styles.back} onClick={() => saveReview({ open: true, current: null, seen: [] })}>もう一度見返す</button></>}
            </section>}
        </> : choice ? <article className={styles.card} aria-label="選択中の仕事">
            <div className={styles.workContext}>
            <div className={styles.eyebrow}><span>{choice.reason}</span><span>{choice.task.project_name}</span></div>
            {choice.task.parent_title && <p className={styles.parent}>{choice.task.parent_title}</p>}
            <h2><button onClick={() => choice.task.is_routine ? onBrowse('today') : onOpen(choice.task.id)}>{choice.task.title}</button></h2>
            {choice.task.due_date && <p className={[styles.due, choice.task.due_date < today ? styles.overdue : ''].join(' ')}><CalendarDays size={15} />期限 {choice.task.due_date}</p>}
            {summary.step && <p className={styles.step}><ArrowRight size={17} /><span>{summary.step}</span></p>}
            {summary.context && summary.context !== choice.task.title && <p className={styles.context}><span>{summary.contextKind === 'memo' ? 'メモ' : summary.contextKind === 'result' ? '前回の結果' : '背景'}</span>{summary.context}</p>}
            {summary.background && <details className={styles.previousResult}><summary>背景・メモ</summary><p>{summary.background.text}</p></details>}
            </div>
            <div className={styles.actions}><button className={styles.primary} onClick={() => choice.task.is_routine ? onBrowse('today') : hasReference ? onStart(choice.task.id, null, true) : onStart(choice.task.id)}><Play size={16} />{choice.task.is_routine ? '予定表を開く' : hasReference ? 'リンクを開いて開始' : '作業を開始'}</button>{!choice.task.is_routine && <button className={styles.short} onClick={() => onStart(choice.task.id, 5)}><Clock3 size={16} />5分だけ</button>}</div>
            <div className={styles.adjustments}>{!choice.task.is_routine && <button className={styles.alternativesToggle} onClick={() => onOpen(choice.task.id, { help: true })}>着手のヒント<ArrowRight size={15} /></button>}
            <button className={styles.alternativesToggle} onClick={() => setMode('choices')}>別の仕事を選ぶ<ChevronRight size={15} /></button>
            </div>
        </article> : <div className={styles.empty}><h2>気になっていることから</h2><button className={styles.primary} onClick={onCapture}>記録する</button></div>}
        {mode === 'home' && <div className={styles.shelf}><button onClick={() => onBrowse('all')}><List size={18} /><span>仕事の一覧</span><ChevronRight size={16} /></button><button onClick={openReview}><Clock3 size={18} /><span>記録を見返す</span><ChevronRight size={16} /></button><Link href="/projects"><span>プロジェクト</span><ChevronRight size={16} /></Link></div>}
    </div>;
}
