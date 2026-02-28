'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import StatusCheckbox from '@/components/StatusCheckbox';
import TaskEditModal from '@/components/TaskEditModal';
import MultiSelectFilter from '@/components/MultiSelectFilter';

function addDays(base, days) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
}

function toDateStr(d) {
    return d.toLocaleDateString('sv-SE');
}

function buildDateTabs() {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const tabs = [];
    const labels = ['今日', '明日', '明後日'];
    for (let i = 0; i <= 7; i++) {
        const d = addDays(base, i);
        const wd = weekdays[d.getDay()];
        tabs.push({
            date: toDateStr(d),
            label: labels[i] || `${d.getMonth() + 1}/${d.getDate()}`,
            weekday: wd,
            isToday: i === 0,
            isWeekend: d.getDay() === 0 || d.getDay() === 6,
        });
    }
    return tabs;
}

export default function TodayPage() {
    const dateTabs = useMemo(() => buildDateTabs(), []);
    const [selectedDate, setSelectedDate] = useState(() => dateTabs[0].date);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statuses, setStatuses] = useState([]);
    const [justCompletedId, setJustCompletedId] = useState(null);
    const [editingTask, setEditingTask] = useState(null); // For IMP-1

    const [filterStatuses, setFilterStatuses] = useState([]);
    const [filterTags, setFilterTags] = useState([]);
    const [filterImportance, setFilterImportance] = useState([]);
    const [filterUrgency, setFilterUrgency] = useState([]);
    const [sortKey, setSortKey] = useState('priority'); // default sort

    const [allTags, setAllTags] = useState([]);
    const [allImportance, setAllImportance] = useState([]);
    const [allUrgency, setAllUrgency] = useState([]);
    const [showOverdue, setShowOverdue] = useState(true);

    // Tracks the most recent async fetch request to prevent tab-switching Race Conditions
    const activeRequestId = useRef(0);

    const statusOptions = useMemo(() => statuses.map(s => ({ value: s.code, label: s.label, color: s.color })), [statuses]);
    const tagOptions = useMemo(() => allTags.filter(t => !t.archived).map(t => ({ value: t.id, label: t.name, color: t.color })), [allTags]);
    const importanceOptions = useMemo(() => allImportance.map(i => ({ value: i.level, label: i.label, color: i.color })), [allImportance]);
    const urgencyOptions = useMemo(() => allUrgency.map(u => ({ value: u.level, label: u.label, color: u.color })), [allUrgency]);

    useEffect(() => {
        (async () => {
            try {
                const { getDb } = await import('@/lib/db');
                const db = await getDb();
                const rows = await db.select('SELECT * FROM status_master ORDER BY sort_order, code');
                setStatuses(rows);

                const tagsRows = await db.select('SELECT * FROM tags ORDER BY sort_order, id');
                setAllTags(tagsRows);

                const importanceRows = await db.select('SELECT * FROM importance_master ORDER BY level');
                setAllImportance(importanceRows);
                const urgencyRows = await db.select('SELECT * FROM urgency_master ORDER BY level');
                setAllUrgency(urgencyRows);

                const settingsRows = await db.select('SELECT value FROM app_settings WHERE key = $1', ['show_overdue_in_today']);
                if (settingsRows.length > 0) {
                    setShowOverdue(settingsRows[0].value !== '0');
                }
            } catch (e) { console.error('Failed to load statuses/tags:', e); }
        })();
    }, []);

    const loadTasks = useCallback(async (date) => {
        const currentReq = ++activeRequestId.current;
        setLoading(true);
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();

            const dObj = new Date(date + 'T00:00:00');
            const dayOfWeek = dObj.getDay();
            const dayOfMonth = dObj.getDate();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const todayStr = new Date().toLocaleDateString('sv-SE');
            const isViewingToday = (date === todayStr);

            // Build condition strings
            const tConditions = [];
            const rConditions = [];
            const sqlParams = [date, date, date, date];
            let paramIndex = 5;

            if (filterStatuses.length > 0) {
                const tPlaceholders = filterStatuses.map(() => `$${paramIndex++}`).join(',');
                tConditions.push(`t.status_code IN (${tPlaceholders})`);
                sqlParams.push(...filterStatuses);

                // Routine status mapping: routines only have done(3) or not-done(1)
                const showComplete = filterStatuses.includes(3);
                const showIncomplete = filterStatuses.includes(1) || filterStatuses.includes(2);
                if (showComplete && !showIncomplete) {
                    rConditions.push('rc.completion_date IS NOT NULL');
                } else if (!showComplete && showIncomplete) {
                    rConditions.push('rc.completion_date IS NULL');
                } else if (!showComplete && !showIncomplete) {
                    rConditions.push('1 = 0');
                }
            }

            // Routine SQL uses standard args first
            const rSqlParams = [date, date];
            let rParamIndex = 3;

            if (filterTags.length > 0) {
                const tPlaceholders = filterTags.map(() => `$${paramIndex++}`).join(',');
                tConditions.push(`t.id IN (SELECT task_id FROM task_tags WHERE tag_id IN (${tPlaceholders}))`);
                sqlParams.push(...filterTags);

                const rPlaceholders = filterTags.map(() => `$${rParamIndex++}`).join(',');
                rConditions.push(`r.id IN (SELECT routine_id FROM routine_tags WHERE tag_id IN (${rPlaceholders}))`);
                rSqlParams.push(...filterTags);
            }

            if (filterImportance.length > 0) {
                const tPlaceholders = filterImportance.map(() => `$${paramIndex++}`).join(',');
                tConditions.push(`t.importance_level IN (${tPlaceholders})`);
                sqlParams.push(...filterImportance);

                const rPlaceholders = filterImportance.map(() => `$${rParamIndex++}`).join(',');
                rConditions.push(`r.importance_level IN (${rPlaceholders})`);
                rSqlParams.push(...filterImportance);
            }

            if (filterUrgency.length > 0) {
                const tPlaceholders = filterUrgency.map(() => `$${paramIndex++}`).join(',');
                tConditions.push(`t.urgency_level IN (${tPlaceholders})`);
                sqlParams.push(...filterUrgency);

                const rPlaceholders = filterUrgency.map(() => `$${rParamIndex++}`).join(',');
                rConditions.push(`r.urgency_level IN (${rPlaceholders})`);
                rSqlParams.push(...filterUrgency);
            }

            const tConditionStr = tConditions.length > 0 ? ' AND ' + tConditions.join(' AND ') : '';
            const rConditionStr = rConditions.length > 0 ? ' AND ' + rConditions.join(' AND ') : '';

            // Get valid routines for this date
            const routinesSql = `
              SELECT r.*,
                     rc.completion_date,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM routines r
              LEFT JOIN routine_tags rt ON r.id = rt.routine_id
              LEFT JOIN tags tg ON rt.tag_id = tg.id
              LEFT JOIN routine_completions rc ON r.id = rc.routine_id AND rc.completion_date = $1
              WHERE r.enabled = 1
                AND (r.end_date IS NULL OR r.end_date >= $2)
                ${rConditionStr}
              GROUP BY r.id
            `;
            const rawRoutines = await db.select(routinesSql, rSqlParams);

            const { isRoutineActiveOnDate } = await import('@/lib/holidayService');
            const activeRawRoutines = [];
            for (const r of rawRoutines) {
                const isActive = await isRoutineActiveOnDate(db, r, date);
                if (isActive) activeRawRoutines.push(r);
            }

            const routineTasks = activeRawRoutines
                .map(r => ({
                    id: `routine_${r.id}_${date}`,
                    routine_id: r.id,
                    is_routine: true,
                    title: r.title,
                    status_code: r.completion_date ? 3 : 1, // 3: Done, 1: Todo
                    importance_level: r.importance_level,
                    urgency_level: r.urgency_level,
                    estimated_hours: r.estimated_hours,
                    due_date: null,
                    tags: JSON.parse(r.tag_ids || '[]').map((id, index) => ({
                        id,
                        name: JSON.parse(r.tag_names || '[]')[index],
                        color: JSON.parse(r.tag_colors || '[]')[index]
                    })).filter(t => t.id)
                }));

            // Get tasks assigned to this date OR overdue standard tasks
            const tasksSql = `
              SELECT t.*,
                     p.title as parent_title,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM tasks t
              LEFT JOIN tasks p ON t.parent_id = p.id
              LEFT JOIN task_tags tt ON t.id = tt.task_id
              LEFT JOIN tags tg ON tt.tag_id = tg.id
              WHERE t.archived_at IS NULL
                AND (
                  t.today_date = $1
                  OR t.due_date = $2
                  ${showOverdue && isViewingToday ? 'OR (t.due_date < $3 AND t.status_code NOT IN (3, 5))' : ''}
                  OR (t.status_code = 3 AND date(t.completed_at) = $4)
                )
                ${tConditionStr}
              GROUP BY t.id
            `;
            const rawTasks = await db.select(tasksSql, sqlParams);

            const standardTasks = rawTasks.map(t => ({
                ...t,
                tags: JSON.parse(t.tag_ids || '[]').map((id, index) => ({
                    id,
                    name: JSON.parse(t.tag_names || '[]')[index],
                    color: JSON.parse(t.tag_colors || '[]')[index]
                })).filter(tg => tg.id)
            }));

            // Combine and sort
            const unified = [...routineTasks, ...standardTasks];
            unified.sort((a, b) => {
                // Done items always go to the bottom unless specific sorting overrides it
                const aDone = a.status_code === 3;
                const bDone = b.status_code === 3;

                switch (sortKey) {
                    case 'created_desc': return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                    case 'created_asc': return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                    case 'due_asc': {
                        if (!a.due_date) return 1; if (!b.due_date) return -1;
                        return new Date(a.due_date) - new Date(b.due_date);
                    }
                    case 'due_desc': {
                        if (!a.due_date) return 1; if (!b.due_date) return -1;
                        return new Date(b.due_date) - new Date(a.due_date);
                    }
                    case 'importance': return (b.importance_level || 0) - (a.importance_level || 0);
                    case 'urgency': return (b.urgency_level || 0) - (a.urgency_level || 0);
                    case 'title': return (a.title || '').localeCompare(b.title || '', 'ja');
                    case 'status': {
                        const aOrder = statuses.find(s => s.code === a.status_code)?.sort_order || 0;
                        const bOrder = statuses.find(s => s.code === b.status_code)?.sort_order || 0;
                        return aOrder - bOrder;
                    }
                    case 'tag': {
                        const aTag = a.tags && a.tags.length > 0 ? a.tags[0].name : '\uFFFF';
                        const bTag = b.tags && b.tags.length > 0 ? b.tags[0].name : '\uFFFF';
                        return aTag.localeCompare(bTag, 'ja');
                    }
                    case 'priority':
                    default: {
                        if (aDone && !bDone) return 1;
                        if (!aDone && bDone) return -1;
                        const aImp = a.importance_level || 0;
                        const bImp = b.importance_level || 0;
                        if (aImp !== bImp) return bImp - aImp;
                        const aUrg = a.urgency_level || 0;
                        const bUrg = b.urgency_level || 0;
                        if (aUrg !== bUrg) return bUrg - aUrg;
                        return 0;
                    }
                }
            });

            if (currentReq === activeRequestId.current) {
                setTasks(unified);
            }
        } catch (e) {
            console.error("Tauri DB fetch today error:", e);
        } finally {
            if (currentReq === activeRequestId.current) {
                setLoading(false);
            }
        }
    }, [filterStatuses, filterTags, filterImportance, filterUrgency, sortKey, showOverdue, statuses]);

    useEffect(() => {
        loadTasks(selectedDate);
        const handleTaskAdded = () => loadTasks(selectedDate);
        window.addEventListener('yarukoto:taskAdded', handleTaskAdded);
        return () => window.removeEventListener('yarukoto:taskAdded', handleTaskAdded);
    }, [selectedDate, loadTasks]);

    const handleStatusChange = async (taskId, newCode, isRoutine = false) => {
        const code = parseInt(newCode);
        if (code === 3) {
            setJustCompletedId(taskId);
            setTimeout(() => setJustCompletedId(null), 700);
        }
        const completedNow = new Date().toLocaleDateString('sv-SE') + ' ' + new Date().toLocaleTimeString('sv-SE');
        setTasks(prev => prev.map(t => t.id === taskId ? {
            ...t,
            status_code: code,
            completed_at: code === 3 ? completedNow : null
        } : t));

        if (isRoutine) {
            // Toggle routine completion
            const item = tasks.find(t => t.id === taskId);
            if (!item) return;
            // 着手中(2)はUI表示のみ、DB操作不要
            if (code === 2) return;
            try {
                const { getDb } = await import('@/lib/db');
                const db = await getDb();

                if (code === 3) {
                    await db.execute('INSERT OR IGNORE INTO routine_completions (routine_id, completion_date) VALUES ($1, $2)', [item.routine_id, selectedDate]);
                } else {
                    await db.execute('DELETE FROM routine_completions WHERE routine_id = $1 AND completion_date = $2', [item.routine_id, selectedDate]);
                }
            } catch (e) {
                console.error(e);
                window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'ステータスの変更に失敗しました', type: 'error' } }));
                loadTasks(selectedDate);
            }
        } else {
            try {
                const { getDb } = await import('@/lib/db');
                const db = await getDb();

                if (code === 3) {
                    await db.execute("UPDATE tasks SET status_code = $1, completed_at = datetime('now', 'localtime') WHERE id = $2", [code, taskId]);
                } else {
                    await db.execute("UPDATE tasks SET status_code = $1, completed_at = NULL WHERE id = $2", [code, taskId]);
                }
            } catch (e) {
                console.error(e);
                window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'ステータスの変更に失敗しました', type: 'error' } }));
                loadTasks(selectedDate);
            }
        }
    };

    const handleRemove = async (taskId) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            await db.execute('UPDATE tasks SET today_date = NULL WHERE id = $1', [taskId]);
        } catch (e) { console.error(e); loadTasks(selectedDate); }
    };

    const stats = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.status_code === 3).length;
        const remaining = tasks.filter(t => t.status_code !== 3 && t.status_code !== 5);
        const remainingMin = remaining.reduce((s, t) => s + (t.estimated_hours || 0), 0);
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, remaining: remaining.length, remainingMin, pct };
    }, [tasks]);

    const statusMap = useMemo(() => {
        const m = {};
        statuses.forEach(s => { m[s.code] = { label: s.label, color: s.color }; });
        return m;
    }, [statuses]);

    const currentTab = dateTabs.find(t => t.date === selectedDate) || dateTabs[0];
    const selectedD = new Date(selectedDate + 'T00:00:00');
    const dateStr = `${selectedD.getFullYear()}年${selectedD.getMonth() + 1}月${selectedD.getDate()}日（${currentTab.weekday}）`;

    const formatMin = (m) => {
        if (!m || m <= 0) return '0分';
        if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60 ? m % 60 + '分' : ''}`.trim();
        return `${m}分`;
    };

    return (
        <div className="today-root">
            <div className="today-header">
                <div className="today-title-row">
                    <h2 className="page-title">☀️ {currentTab.isToday ? '今日やるタスク' : 'やるタスク'}</h2>
                    <span className="today-date">{dateStr}</span>
                </div>
                <p className="today-subtitle">ルーティン + ☀️ ピック + 📅 期限日のタスク</p>
            </div>

            {/* Date Navigation Tabs */}
            <div className="date-tabs">
                {dateTabs.map(tab => (
                    <button key={tab.date}
                        className={`date-tab ${selectedDate === tab.date ? 'active' : ''} ${tab.isWeekend ? 'weekend' : ''}`}
                        onClick={() => setSelectedDate(tab.date)}>
                        <span className="date-tab-label">{tab.label}</span>
                        <span className="date-tab-wd">{tab.weekday}</span>
                    </button>
                ))}
            </div>

            {/* Filter Toolbar */}
            <div className="today-toolbar">
                <MultiSelectFilter label="ステータス" options={statusOptions} selected={filterStatuses} onChange={setFilterStatuses} />
                {tagOptions.length > 0 && <MultiSelectFilter label="タグ" options={tagOptions} selected={filterTags} onChange={setFilterTags} />}
                <MultiSelectFilter label="重要度" options={importanceOptions} selected={filterImportance} onChange={setFilterImportance} />
                <MultiSelectFilter label="緊急度" options={urgencyOptions} selected={filterUrgency} onChange={setFilterUrgency} />
                <div className="today-filter" style={{ marginLeft: 'auto' }}>
                    <label>並び順</label>
                    <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
                        <option value="priority">優先度順（デフォルト）</option>
                        <option value="status">ステータス順</option>
                        <option value="tag">タグ順</option>
                        <option value="due_asc">期限日（近い順）</option>
                        <option value="due_desc">期限日（遠い順）</option>
                        <option value="created_desc">作成日（新しい順）</option>
                        <option value="created_asc">作成日（古い順）</option>
                        <option value="importance">重要度（高い順）</option>
                        <option value="urgency">緊急度（高い順）</option>
                    </select>
                </div>
            </div>

            {/* Mini Dashboard */}
            <div className="today-stats">
                <div className="stat-ring-area">
                    <svg viewBox="0 0 120 120" className="stat-ring">
                        <circle cx="60" cy="60" r="50" className="ring-bg" />
                        <circle cx="60" cy="60" r="50" className="ring-fill"
                            style={{
                                strokeDasharray: `${stats.pct * 3.14} 314`,
                                stroke: stats.pct === 100 ? 'var(--color-success)' : 'var(--color-primary)'
                            }}
                        />
                    </svg>
                    <div className="ring-label">
                        <span className="ring-pct">{stats.pct}%</span>
                        <span className="ring-sub">完了</span>
                    </div>
                </div>
                <div className="stat-details">
                    <div className="stat-row">
                        <span className="stat-icon">📋</span>
                        <span className="stat-text">全 <strong>{stats.total}</strong> 件</span>
                    </div>
                    <div className="stat-row">
                        <span className="stat-icon">✅</span>
                        <span className="stat-text">完了 <strong>{stats.completed}</strong> 件</span>
                    </div>
                    <div className="stat-row">
                        <span className="stat-icon">⏳</span>
                        <span className="stat-text">残り <strong>{stats.remaining}</strong> 件</span>
                    </div>
                    {stats.remainingMin > 0 && (
                        <div className="stat-row">
                            <span className="stat-icon">⏱</span>
                            <span className="stat-text">残り想定 <strong>{formatMin(stats.remainingMin)}</strong></span>
                        </div>
                    )}
                </div>
            </div>

            {/* Task List */}
            <div className="today-list">
                {loading && tasks.length === 0 && <div className="today-placeholder"><span className="spinner" /> 読み込み中...</div>}

                {!loading && tasks.length === 0 && (
                    <div className="today-empty">
                        <span className="today-empty-icon">{currentTab.isToday ? '☀️' : '📅'}</span>
                        <span className="today-empty-title">{currentTab.isToday ? '今日やるタスクがありません' : `${currentTab.label}のタスクがありません`}</span>
                        <span className="today-empty-hint">タスク一覧の ☀️ ボタンでタスクをピックしましょう</span>
                    </div>
                )}

                {tasks.map((task, i) => {
                    const st = statusMap[task.status_code] || { label: task.status_label || '不明', color: task.status_color || '#94a3b8' };
                    const isDone = task.status_code === 3;
                    const isRoutine = !!task.is_routine;
                    const isPickedForToday = task.today_date === selectedDate;

                    return (
                        <div key={task.id} className={`today-card ${isDone ? 'done' : ''} ${isRoutine ? 'routine' : ''} ${isPickedForToday && !isRoutine ? 'picked' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
                            <StatusCheckbox
                                statusCode={task.status_code}
                                onChange={(newCode) => handleStatusChange(task.id, newCode, isRoutine)}
                                sparkle={justCompletedId === task.id}
                            />
                            <div className="today-card-info">
                                {task.parent_title && (
                                    <span className="today-parent-label">📌 {task.parent_title} ›</span>
                                )}
                                <div className="today-card-title-row">
                                    {isRoutine && <span className="today-routine-badge">🔄</span>}
                                    <span
                                        className={`today-card-title ${isDone ? 'strike' : ''} ${!isRoutine ? 'clickable' : ''}`}
                                        onClick={() => {
                                            if (!isRoutine) setEditingTask(task);
                                        }}
                                        title={!isRoutine ? "クリックして編集" : ""}
                                    >
                                        {task.title}
                                    </span>
                                </div>
                                <div className="today-card-meta">
                                    {task.tags && task.tags.map(t => (
                                        <span key={t.id} className="today-tag" style={{ backgroundColor: t.color }}>{t.name}</span>
                                    ))}
                                    {isDone && task.completed_at && <span className="today-meta-item">☑ 完了: {task.completed_at.split(' ')[0]}</span>}
                                    {task.due_date && !isDone && <span className="today-meta-item">📅 {task.due_date}</span>}
                                    {task.estimated_hours > 0 && (
                                        <span className="today-meta-item">⏱ {formatMin(task.estimated_hours)}</span>
                                    )}
                                </div>
                            </div>
                            <div className="today-card-actions">
                                {!isRoutine && (
                                    <select value={task.status_code} onChange={e => handleStatusChange(task.id, e.target.value, false)}
                                        className="today-status" style={{ borderColor: st.color, color: st.color }}>
                                        {statuses.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                                    </select>
                                )}
                                {!isRoutine && isPickedForToday && (
                                    <button className="today-remove" onClick={() => handleRemove(task.id)} title="今日やるから外す">✕</button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {currentTab.isToday && stats.total > 0 && stats.completed >= 1 && stats.pct < 50 && (
                <div className="today-milestone-banner milestone-start">
                    いいスタート！ まず1件クリアしました
                </div>
            )}
            {currentTab.isToday && stats.pct >= 50 && stats.pct < 100 && (
                <div className="today-milestone-banner milestone-half">
                    半分突破！ あと {stats.remaining} 件で完了です
                </div>
            )}
            {currentTab.isToday && stats.pct === 100 && stats.total > 0 && (
                <div className="today-complete-banner">
                    おめでとうございます！ 今日のタスクをすべて完了しました！
                </div>
            )}

            <style jsx>{`
        .today-root { max-width: 800px; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .today-header { margin-bottom: 1rem; }
        .today-title-row { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
        .today-date { font-size: 0.9rem; color: var(--color-text-muted); font-weight: 500; }
        .today-subtitle { color: var(--color-text-muted); font-size: 0.85rem; margin-top: -1rem; }

        /* Date Navigation Tabs */
        .date-tabs {
          display: flex; gap: 3px; margin-bottom: 1.5rem;
          padding: 4px; background: var(--color-surface);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
          overflow-x: auto;
        }
        .date-tab {
          flex: 1; min-width: 0;
          display: flex; flex-direction: column; align-items: center;
          gap: 0.1rem; padding: 0.5rem 0.25rem;
          border: none; background: transparent;
          border-radius: 9px; cursor: pointer;
          transition: all 0.2s; font-family: inherit;
        }
        .date-tab:hover { background: var(--color-surface-hover); }
        .date-tab.active {
          background: var(--color-primary); color: #fff;
          box-shadow: 0 2px 10px rgba(79,110,247,0.18);
        }
        .date-tab.weekend:not(.active) { }
        .date-tab-label {
          font-size: 0.78rem; font-weight: 600;
          color: var(--color-text-secondary);
        }
        .date-tab.active .date-tab-label { color: #fff; }
        .date-tab-wd {
          font-size: 0.65rem; font-weight: 500;
          color: var(--color-text-muted);
        }
        .date-tab.active .date-tab-wd { color: rgba(255,255,255,0.8); }
        .date-tab.weekend .date-tab-wd { color: var(--color-danger); }
        .date-tab.weekend.active .date-tab-wd { color: rgba(255,200,200,0.9); }

        /* Toolbar */
        .today-toolbar {
          display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap;
          margin-bottom: 1.5rem; padding: 0.65rem 0.85rem;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
        }
        .today-filter { display: flex; align-items: center; gap: 0.4rem; }
        .today-filter label { font-size: 0.78rem; color: var(--color-text-muted); font-weight: 500; white-space: nowrap; }

        /* Stats */
        .today-stats {
          display: flex; align-items: center; gap: 2rem;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-lg); padding: 1.5rem 2rem;
          box-shadow: var(--shadow-md); margin-bottom: 1.5rem;
        }
        .stat-ring-area { position: relative; width: 100px; height: 100px; flex-shrink: 0; }
        .stat-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ring-bg { fill: none; stroke: var(--color-surface-hover); stroke-width: 8; }
        .ring-fill { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
        .ring-label {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .ring-pct { font-size: 1.5rem; font-weight: 800; color: var(--color-text); line-height: 1; }
        .ring-sub { font-size: 0.7rem; color: var(--color-text-muted); font-weight: 500; }

        .stat-details { display: flex; flex-direction: column; gap: 0.5rem; }
        .stat-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; color: var(--color-text-secondary); }
        .stat-icon { font-size: 0.85rem; }

        /* Task Cards */
        .today-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .today-placeholder { display: flex; align-items: center; gap: 0.5rem; padding: 2rem; color: var(--color-text-muted); justify-content: center; }
        .today-empty {
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
          padding: 3rem; color: var(--color-text-muted);
        }
        .today-empty-icon { font-size: 2.5rem; opacity: 0.5; }
        .today-empty-title { font-size: 1rem; font-weight: 500; color: var(--color-text-secondary); }
        .today-empty-hint { font-size: 0.82rem; color: var(--color-text-disabled); }

        .today-card {
          display: flex; align-items: center; gap: 0.75rem;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-md); padding: 0.75rem 1rem;
          box-shadow: var(--shadow-sm); transition: all 0.2s;
          animation: tcIn 0.3s cubic-bezier(.16,1,.3,1) both;
        }
        @keyframes tcIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .today-card:hover { border-color: var(--border-color-hover); box-shadow: var(--shadow-card-hover); }
        .today-card.done { opacity: 0.55; }
        .today-card.done:hover { opacity: 0.75; }
        .today-card.routine { border-left: 3px solid var(--color-primary); }
        .today-card.picked { border-left: 3px solid var(--color-warning); }

        .today-card-info { flex: 1; min-width: 0; }
        .today-parent-label {
          display: block; font-size: 0.7rem; font-weight: 500;
          color: var(--color-text-muted); margin-bottom: 0.15rem;
          letter-spacing: 0.01em;
        }
        .today-card-title-row { display: flex; align-items: center; gap: 0.35rem; }
        .today-routine-badge {
          font-size: 0.8rem; flex-shrink: 0;
        }
        .today-picked-badge {
          font-size: 0.8rem; flex-shrink: 0; filter: grayscale(0.2);
        }
        .today-card-title { font-weight: 600; font-size: 0.92rem; color: var(--color-text); display: block; }
        .today-card-title.strike { text-decoration: line-through; color: var(--color-text-disabled); }
        .today-card-title.clickable { cursor: pointer; transition: color 0.15s; }
        .today-card-title.clickable:hover { color: var(--color-primary); text-decoration: underline; }
        .today-card-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.25rem; }
        .today-tag { font-size: 0.6rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 8px; color: #fff; }
        .today-meta-item { font-size: 0.75rem; color: var(--color-text-muted); }

        .today-card-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
        .today-status {
          font-weight: 600; font-size: 0.75rem; padding: 0.25rem 0.4rem;
          border-radius: var(--radius-sm); cursor: pointer; border: 1px solid;
          background: transparent; font-family: inherit;
        }
        .today-remove {
          background: transparent; border: 1px solid transparent; color: var(--color-text-disabled);
          cursor: pointer; font-size: 0.75rem; width: 24px; height: 24px;
          display: flex; align-items: center; justify-content: center;
          border-radius: var(--radius-sm); transition: all 0.15s;
        }
        .today-remove:hover { background: var(--color-danger-bg); color: var(--color-danger); border-color: rgba(220,38,38,.2); }

        .today-milestone-banner {
          margin-top: 1rem; padding: 0.85rem 1.25rem;
          border-radius: var(--radius-md);
          text-align: center; font-size: 0.88rem; font-weight: 600;
          animation: celebIn 0.4s cubic-bezier(.16,1,.3,1);
        }
        .milestone-start {
          background: rgba(79,110,247,0.06);
          border: 1px solid rgba(79,110,247,0.15);
          color: var(--color-primary);
        }
        .milestone-half {
          background: rgba(245,158,11,0.06);
          border: 1px solid rgba(245,158,11,0.2);
          color: #b45309;
        }
        .today-complete-banner {
          margin-top: 1rem; padding: 1.25rem;
          background: linear-gradient(135deg, rgba(22,163,74,0.08), rgba(79,110,247,0.08));
          border: 1px solid rgba(22,163,74,0.2); border-radius: var(--radius-lg);
          text-align: center; font-size: 1rem; font-weight: 600;
          color: var(--color-success);
          animation: celebIn 0.5s cubic-bezier(.16,1,.3,1);
        }
        @keyframes celebIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
      `}</style>

            {editingTask && (
                <TaskEditModal
                    task={editingTask}
                    onClose={() => setEditingTask(null)}
                    onSaved={() => {
                        setEditingTask(null);
                        loadTasks(selectedDate);
                    }}
                />
            )}
        </div>
    );
}
