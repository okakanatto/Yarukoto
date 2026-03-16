'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TaskItem from './TaskItem';
import { fetchDb, parseTags } from '@/lib/utils';
import { buildTaskListQuery, buildArchiveMonthlySummaryQuery } from '@/lib/taskListQueries';
import { useDbOperation } from '@/hooks/useDbOperation';
import { Archive, Search } from 'lucide-react';

const noop = () => {};

/**
 * Archive view with monthly accordion grouping, lazy loading, and search (IMP-20).
 * Replaces the flat archive list when showArchived=true in TaskList.
 */
export default function ArchiveView({
    filterStatuses, filterTags, filterImportance, filterUrgency, filterProjects, projectId,
    statusMap, allStatuses, onEdit,
}) {
    const [monthlySummary, setMonthlySummary] = useState([]);
    const [expandedMonths, setExpandedMonths] = useState(new Set());
    const [monthTasks, setMonthTasks] = useState({});
    const [monthLoading, setMonthLoading] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [processingIds, setProcessingIds] = useState(new Set());

    const initialLoadDone = useRef(false);
    const searchTimer = useRef(null);
    const dbOp = useDbOperation();

    // Memoize filter options to stabilize callback dependencies
    const filterDeps = useMemo(() => ({
        filterStatuses, filterTags, filterImportance, filterUrgency, filterProjects, projectId,
    }), [filterStatuses, filterTags, filterImportance, filterUrgency, filterProjects, projectId]);

    // --- Data fetching ---

    const fetchSummary = useCallback(async () => {
        setSummaryLoading(true);
        try {
            const db = await fetchDb();
            const { sql, params } = buildArchiveMonthlySummaryQuery(filterDeps);
            const rows = await db.select(sql, params);
            setMonthlySummary(rows);

            // Auto-expand the latest month on first load only
            if (!initialLoadDone.current && rows.length > 0) {
                setExpandedMonths(new Set([rows[0].month]));
                initialLoadDone.current = true;
            }
        } catch (e) {
            console.error('Failed to fetch archive summary:', e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'アーカイブデータの読み込みに失敗しました', type: 'error' } }));
        } finally {
            setSummaryLoading(false);
        }
    }, [filterDeps]);

    // Refetch summary and clear cached month data when filters change
    useEffect(() => {
        fetchSummary();
        setMonthTasks({});
    }, [fetchSummary]);

    // Lazy-load tasks for a specific month
    const fetchMonthTasks = useCallback(async (month) => {
        setMonthLoading(prev => new Set([...prev, month]));
        try {
            const db = await fetchDb();
            const { sql, params } = buildTaskListQuery({
                showArchived: true,
                archiveMonth: month,
                ...filterDeps,
            });
            const rows = await db.select(sql, params);
            setMonthTasks(prev => ({ ...prev, [month]: rows.map(t => ({ ...t, tags: parseTags(t) })) }));
        } catch (e) {
            console.error(`Failed to fetch archive for ${month}:`, e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'アーカイブデータの読み込みに失敗しました', type: 'error' } }));
        } finally {
            setMonthLoading(prev => { const next = new Set(prev); next.delete(month); return next; });
        }
    }, [filterDeps]);

    // Auto-fetch when a month is expanded but not yet loaded
    useEffect(() => {
        expandedMonths.forEach(month => {
            if (!monthTasks[month] && !monthLoading.has(month)) {
                fetchMonthTasks(month);
            }
        });
    }, [expandedMonths, monthTasks, monthLoading, fetchMonthTasks]);

    const toggleMonth = useCallback((month) => {
        setExpandedMonths(prev => {
            const next = new Set(prev);
            if (next.has(month)) next.delete(month);
            else next.add(month);
            return next;
        });
    }, []);

    // --- Search ---

    const performSearch = useCallback(async (term) => {
        if (!term.trim()) { setSearchResults([]); setSearchLoading(false); return; }
        setSearchLoading(true);
        try {
            const db = await fetchDb();
            const { sql, params } = buildTaskListQuery({
                showArchived: true,
                searchTerm: term.trim(),
                ...filterDeps,
            });
            const rows = await db.select(sql, params);
            setSearchResults(rows.map(t => ({ ...t, tags: parseTags(t) })));
        } catch (e) {
            console.error('Archive search failed:', e);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: 'アーカイブの検索に失敗しました', type: 'error' } }));
        } finally {
            setSearchLoading(false);
        }
    }, [filterDeps]);

    const onSearchChange = useCallback((e) => {
        const val = e.target.value;
        setSearchTerm(val);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (val.trim()) {
            setSearchLoading(true);
            searchTimer.current = setTimeout(() => performSearch(val), 300);
        } else {
            setSearchResults([]);
            setSearchLoading(false);
        }
    }, [performSearch]);

    const clearSearch = useCallback(() => {
        setSearchTerm('');
        setSearchResults([]);
        setSearchLoading(false);
        if (searchTimer.current) clearTimeout(searchTimer.current);
    }, []);

    const isSearching = searchTerm.trim().length > 0;

    // --- Restore handler ---

    const handleRestore = useCallback(async (taskId) => {
        // Find task in search results or month data
        let task = searchResults.find(t => t.id === taskId);
        if (!task) {
            for (const tasks of Object.values(monthTasks)) {
                task = tasks.find(t => t.id === taskId);
                if (task) break;
            }
        }
        if (!task) return;

        setProcessingIds(prev => new Set([...prev, taskId]));

        try {
            await dbOp(async (db) => {
                if (!task.parent_id) {
                    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1 OR parent_id = $1', [taskId]);
                } else {
                    await db.execute('UPDATE tasks SET archived_at = NULL WHERE id = $1 OR id = $2', [taskId, task.parent_id]);
                }

                // Descriptive toast for parent-child restore
                const allTasks = [...searchResults, ...Object.values(monthTasks).flat()];
                let toastMsg = '復元しました';
                if (!task.parent_id && allTasks.some(t => t.parent_id === taskId)) {
                    toastMsg = '親タスクと子タスクをまとめて復元しました';
                } else if (task.parent_id) {
                    toastMsg = '子タスクと親タスクを復元しました';
                }
                window.dispatchEvent(new CustomEvent('yarukoto:toast', { detail: { message: toastMsg, type: 'success' } }));
            }, { error: '復元に失敗しました' });

            // Refresh data
            await fetchSummary();
            setMonthTasks({});
            if (searchTerm.trim()) {
                performSearch(searchTerm);
            }
        } catch {
            // Error handled by dbOp
        } finally {
            setProcessingIds(prev => { const next = new Set(prev); next.delete(taskId); return next; });
        }
    }, [searchResults, monthTasks, dbOp, fetchSummary, performSearch, searchTerm]);

    // --- Rendering helpers ---

    const formatMonth = (monthStr) => {
        const [year, month] = monthStr.split('-');
        return `${year}年${parseInt(month)}月`;
    };

    const renderTaskList = (tasks) => {
        if (!tasks || tasks.length === 0) return null;
        const parents = tasks.filter(t => !t.parent_id || !tasks.some(p => p.id === t.parent_id));
        const getChildren = (parentId) => tasks.filter(t => t.parent_id === parentId);

        return (
            <div className="av-tasks">
                {parents.map(task => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        childTasks={getChildren(task.id)}
                        onStatusChange={noop}
                        onDelete={noop}
                        onTaskAdded={noop}
                        onEdit={onEdit}
                        onRestore={handleRestore}
                        statusMap={statusMap}
                        allStatuses={allStatuses}
                        isDraggable={false}
                        isArchived={true}
                        isProcessing={processingIds.has(task.id)}
                        processingIds={processingIds}
                    />
                ))}
            </div>
        );
    };

    // --- Total count ---
    const totalCount = useMemo(() => monthlySummary.reduce((sum, m) => sum + m.count, 0), [monthlySummary]);

    return (
        <div className="av-root">
            {/* Search bar */}
            <div className="av-search">
                <Search size={15} className="av-search-icon" />
                <input
                    type="text"
                    className="av-search-input"
                    placeholder="アーカイブを検索..."
                    value={searchTerm}
                    onChange={onSearchChange}
                />
                {searchTerm && (
                    <button className="av-search-clear" onClick={clearSearch} title="検索をクリア">✕</button>
                )}
            </div>

            {isSearching ? (
                /* Search results (flat list, no monthly grouping) */
                <div className="av-search-results">
                    {searchLoading ? (
                        <div className="av-loading"><span className="spinner" /> 検索中...</div>
                    ) : searchResults.length === 0 ? (
                        <div className="av-empty">
                            <span className="av-empty-icon"><Search size={48} strokeWidth={1.2} /></span>
                            <span className="av-empty-title">「{searchTerm}」に一致するアーカイブはありません</span>
                        </div>
                    ) : (
                        <>
                            <div className="av-search-count">{searchResults.length}件の検索結果</div>
                            {renderTaskList(searchResults)}
                        </>
                    )}
                </div>
            ) : (
                /* Monthly accordion */
                <div className="av-months">
                    {summaryLoading ? (
                        <div className="av-loading"><span className="spinner" /> 読み込み中...</div>
                    ) : monthlySummary.length === 0 ? (
                        <div className="av-empty">
                            <span className="av-empty-icon"><Archive size={32} /></span>
                            <span className="av-empty-title">アーカイブ済みのタスクはありません</span>
                            <span className="av-empty-hint">完了・キャンセル済みタスクのアーカイブボタンでアーカイブできます</span>
                        </div>
                    ) : (
                        <>
                            <div className="av-total">全 {totalCount} 件</div>
                            {monthlySummary.map(({ month, count }) => {
                                const isExpanded = expandedMonths.has(month);
                                const isMonthLoading = monthLoading.has(month);
                                const tasks = monthTasks[month];

                                return (
                                    <div key={month} className="av-month-group">
                                        <button
                                            className={`av-month-header ${isExpanded ? 'expanded' : ''}`}
                                            onClick={() => toggleMonth(month)}
                                        >
                                            <span className={`av-month-arrow ${isExpanded ? 'open' : ''}`}>▶</span>
                                            <span className="av-month-label">{formatMonth(month)}</span>
                                            <span className="av-month-count">{count}件</span>
                                        </button>
                                        {isExpanded && (
                                            <div className="av-month-content">
                                                {isMonthLoading ? (
                                                    <div className="av-loading-sm"><span className="spinner" /> 読み込み中...</div>
                                                ) : tasks && tasks.length === 0 ? (
                                                    <div className="av-empty-sm">タスクなし</div>
                                                ) : tasks ? (
                                                    renderTaskList(tasks)
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}

            <style jsx>{`
                .av-root { display: flex; flex-direction: column; gap: 8px; }

                .av-search {
                    display: flex; align-items: center; gap: 8px;
                    padding: 8px 14px;
                    background: var(--color-surface); border-radius: var(--radius-pill);
                    border: 1px solid var(--border-color);
                    transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
                }
                .av-search:focus-within { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-subtle); }
                .av-search-icon { color: var(--color-text-disabled); flex-shrink: 0; }
                .av-search-input {
                    flex: 1; border: none; outline: none; background: transparent;
                    font-size: .84rem; font-family: inherit; color: var(--color-text);
                }
                .av-search-input::placeholder { color: var(--color-text-disabled); }
                .av-search-clear {
                    background: none; border: none; cursor: pointer;
                    color: var(--color-text-muted); font-size: .72rem;
                    width: 20px; height: 20px; display: flex; align-items: center;
                    justify-content: center; border-radius: var(--radius-pill);
                    transition: color var(--duration-fast) var(--ease-out);
                }
                .av-search-clear:hover { color: var(--color-text); }

                .av-search-count, .av-total {
                    font-size: 0.72rem; color: var(--color-text-secondary);
                    padding: 2px 0; font-weight: 500;
                }

                .av-months { display: flex; flex-direction: column; gap: 6px; }

                .av-month-group {
                    background: var(--color-surface);
                    border-radius: var(--radius-md);
                    box-shadow: var(--shadow-card);
                    overflow: hidden;
                    transition: box-shadow var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out);
                }
                .av-month-group + .av-month-group { border-top: none; }
                .av-month-group:hover { box-shadow: var(--shadow-card-hover); transform: translateY(-1px); }

                .av-month-header {
                    display: flex; align-items: center; gap: 8px;
                    width: 100%; padding: 10px 16px;
                    background: transparent;
                    border: none; cursor: pointer;
                    font-family: inherit; font-size: .82rem;
                    color: var(--color-text);
                    transition: background var(--duration-fast) var(--ease-out);
                }
                .av-month-header:hover { background: var(--color-surface-hover); }
                .av-month-header.expanded { background: var(--color-surface-hover); }

                .av-month-arrow {
                    font-size: .55rem; color: var(--color-text-muted);
                    transition: transform var(--duration-fast) var(--ease-out);
                    flex-shrink: 0;
                }
                .av-month-arrow.open { transform: rotate(90deg); }

                .av-month-label { font-weight: 500; flex: 1; text-align: left; }

                .av-month-count {
                    font-size: 0.72rem; color: var(--color-text-secondary);
                    font-weight: 500;
                }

                .av-month-content {
                    padding: 0 0 4px 0;
                    border-top: 1px solid var(--border-color);
                }

                .av-loading, .av-loading-sm {
                    display: flex; align-items: center;
                    gap: 6px; padding: 2rem 0; color: var(--color-text-muted);
                    font-size: .82rem; justify-content: center;
                }
                .av-loading-sm { padding: 1rem 0; }

                .av-empty {
                    display: flex; flex-direction: column; align-items: center;
                    gap: 6px; padding: 2.5rem 0;
                    color: var(--color-text-muted);
                }
                .av-empty::before { display: none; }
                .av-empty-icon { display: none; }
                .av-empty-title { font-size: 0.875rem; color: var(--color-text-muted); }
                .av-empty-hint { font-size: 0.875rem; color: var(--color-text-muted); }
                .av-empty-sm { padding: 1rem 0; color: var(--color-text-muted); font-size: .82rem; text-align: center; }

                .av-tasks { display: flex; flex-direction: column; gap: 6px; padding: 6px; }
            `}</style>
        </div>
    );
}
