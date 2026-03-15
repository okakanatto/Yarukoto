'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchDb, parseTags, formatMin } from '@/lib/utils';
import { useMasterData } from '@/hooks/useMasterData';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import RoutineFormModal from './_components/RoutineFormModal';
import { CalendarClock, CalendarOff, Clock, Calendar, CircleCheck, XCircle } from 'lucide-react';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default function RoutinesPage() {
    const [routines, setRoutines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('active');
    const [filterProjects, setFilterProjects] = useState([]);

    // Master data for project filter
    const { projects: allProjects } = useMasterData();
    const projectOptions = useMemo(
        () => allProjects.map(p => ({ value: p.id, label: p.name, color: p.color })),
        [allProjects]
    );

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRoutine, setEditingRoutine] = useState(null);

    // Toast State
    const [toast, setToast] = useState(null);
    const flash = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

    const loadRoutines = useCallback(async () => {
        setLoading(true);
        try {
            const db = await fetchDb();
            let sql = `
              SELECT r.*,
                     pj.name as project_name,
                     pj.color as project_color,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM routines r
              LEFT JOIN projects pj ON r.project_id = pj.id
              LEFT JOIN routine_tags rt ON r.id = rt.routine_id
              LEFT JOIN tags tg ON rt.tag_id = tg.id
            `;

            const conditions = [];
            const params = [];
            let paramIndex = 1;

            if (filterProjects.length > 0) {
                const placeholders = filterProjects.map(() => `$${paramIndex++}`).join(',');
                conditions.push(`r.project_id IN (${placeholders})`);
                params.push(...filterProjects);
            }

            if (conditions.length > 0) {
                sql += ' WHERE ' + conditions.join(' AND ');
            }

            sql += ' GROUP BY r.id ORDER BY r.created_at DESC';

            const rawRoutines = await db.select(sql, params);
            const parsedRoutines = rawRoutines.map(r => ({
                ...r,
                tags: parseTags(r)
            }));
            setRoutines(parsedRoutines);
        } catch (e) { console.error("Tauri DB fetch routines error:", e); }
        finally { setLoading(false); }
    }, [filterProjects]);

    useEffect(() => { loadRoutines(); }, [loadRoutines]);

    const handleOpenModal = (routine = null) => {
        setEditingRoutine(routine);
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        setEditingRoutine(null);
    };

    const handleQuickToggle = async (e, routine) => {
        e.stopPropagation();
        const newEnabled = !routine.enabled;
        setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, enabled: newEnabled ? 1 : 0 } : r));
        try {
            const db = await fetchDb();
            await db.execute('UPDATE routines SET enabled = $1 WHERE id = $2', [newEnabled ? 1 : 0, routine.id]);
            flash('ok', newEnabled ? 'ルーティンを有効にしました' : 'ルーティンを停止しました');
        } catch (e) {
            console.error(e);
            setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, enabled: routine.enabled } : r));
            flash('err', '更新に失敗しました');
        }
    };

    const getFreqLabel = (r) => {
        switch (r.frequency) {
            case 'daily': return (r.weekdays_only || r.holiday_action === 'skip') ? '毎営業日 (月-金)' : '毎日';
            case 'weekly': {
                const days = r.days_of_week ? r.days_of_week.split(',').map(Number) : [];
                return '毎週 ' + days.map(d => DAY_LABELS[d]).join('・');
            }
            case 'monthly': return r.monthly_type === 'end_of_month' ? '毎月末' : `毎月 ${r.day_of_month}日`;
            default: return r.frequency;
        }
    };

    const filteredRoutines = routines.filter(r =>
        activeTab === 'active' ? r.enabled : !r.enabled
    );

    return (
        <div className="rt-page">
            <div className="rt-header">
                <div>
                    <h2 className="page-title">ルーティン設定</h2>
                    <p className="rt-sub">定期的に発生するタスクを管理します（今日のタスクに自動表示）</p>
                </div>
                <button className="rt-btn-add" onClick={() => handleOpenModal(null)}>
                    ＋ 新規作成
                </button>
            </div>

            {/* Project Filter */}
            {projectOptions.length > 1 && (
                <div className="rt-toolbar">
                    <MultiSelectFilter label="プロジェクト" options={projectOptions} selected={filterProjects} onChange={setFilterProjects} />
                </div>
            )}

            {/* Tabs */}
            <div className="rt-tabs">
                <button
                    className={`rt-tab ${activeTab === 'active' ? 'active' : ''}`}
                    onClick={() => setActiveTab('active')}
                >
                    有効 ({routines.filter(r => r.enabled).length})
                </button>
                <button
                    className={`rt-tab ${activeTab === 'archived' ? 'active' : ''}`}
                    onClick={() => setActiveTab('archived')}
                >
                    停止中 ({routines.filter(r => !r.enabled).length})
                </button>
            </div>

            {/* List */}
            <div className="rt-list">
                {loading && <div className="rt-center"><span className="spinner" /> 読み込み中...</div>}

                {!loading && filteredRoutines.length === 0 && (
                    <div className="rt-empty">
                        <span className="rt-empty-icon">
                            {activeTab === 'active'
                                ? <CalendarClock size={48} strokeWidth={1.2} />
                                : <CalendarOff size={48} strokeWidth={1.2} />}
                        </span>
                        <span className="rt-empty-title">
                            {activeTab === 'active' ? '有効なルーティンはありません' : '停止中のルーティンはありません'}
                        </span>
                        {activeTab === 'active' && <span className="rt-empty-hint">「＋ 新規作成」から定期タスクを登録しましょう</span>}
                    </div>
                )}

                {filteredRoutines.map((r, i) => (
                    <div key={r.id} className={`rt-card ${r.enabled ? '' : 'disabled'}`} style={{ animationDelay: `${i * 30}ms` }} onClick={() => handleOpenModal(r)}>
                        <div className="rt-card-content">
                            <div className="rt-card-main">
                                <span className="rt-card-title">{r.title}</span>
                                <span className="rt-freq-badge">{getFreqLabel(r)}</span>
                                {r.project_name && (
                                    <span className="rt-project-badge" style={{ backgroundColor: `${r.project_color}18`, color: r.project_color, borderColor: `${r.project_color}30` }}>
                                        <span className="rt-project-dot" style={{ backgroundColor: r.project_color }} />
                                        {r.project_name}
                                    </span>
                                )}
                            </div>
                            <div className="rt-card-meta">
                                {r.tags && r.tags.map(t => (
                                    <span key={t.id} className="rt-tag" style={{ backgroundColor: t.color }}>{t.name}</span>
                                ))}
                                {r.estimated_hours > 0 && (
                                    <span className="rt-meta-item"><Clock size={12} /> {formatMin(r.estimated_hours)}</span>
                                )}
                                {r.end_date && (
                                    <span className="rt-meta-item rt-end-date"><Calendar size={12} /> 〜{r.end_date}</span>
                                )}
                            </div>
                        </div>
                        <button
                            className={`rt-switch ${r.enabled ? 'on' : 'off'}`}
                            onClick={(e) => handleQuickToggle(e, r)}
                            title={r.enabled ? 'クリックで停止' : 'クリックで有効化'}
                        >
                            <span className="rt-switch-knob" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {modalOpen && (
                <RoutineFormModal
                    routine={editingRoutine}
                    onClose={handleCloseModal}
                    onSaved={loadRoutines}
                    flash={flash}
                />
            )}

            {toast && <div className={`rt-toast ${toast.type === 'ok' ? 'rt-toast-ok' : 'rt-toast-err'}`}>{toast.type === 'ok' ? <CircleCheck size={16} /> : <XCircle size={16} />} {toast.msg}</div>}

            <style jsx>{`
        .rt-page { max-width: 800px; margin: 0 auto; animation: slideUp 0.4s ease; }
        .rt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .rt-sub { color: var(--color-text-muted); font-size: 0.78rem; margin-top: 0.15rem; }

        .rt-btn-add {
            background: var(--color-accent); color: #fff; border: none;
            padding: 6px 14px; border-radius: var(--radius-sm);
            font-size: 0.82rem; font-weight: 600; cursor: pointer;
            box-shadow: none; transition: all 0.2s;
        }
        .rt-btn-add:hover { filter: brightness(1.1); }

        /* Tabs */
        .rt-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border-color); margin-bottom: 10px; }
        .rt-tab {
            background: none; border: none; padding: 6px 6px;
            color: var(--color-text-secondary); font-weight: 500; cursor: pointer;
            border-bottom: 2px solid transparent; transition: all 0.2s; font-size: 0.82rem;
        }
        .rt-tab:hover { color: var(--color-text); }
        .rt-tab.active { color: var(--color-accent); border-bottom-color: var(--color-accent); font-weight: 600; }

        /* List */
        .rt-list { display: flex; flex-direction: column; gap: 0; }
        .rt-card {
            background: transparent; border: none;
            border-bottom: 1px solid var(--border-color);
            border-radius: 0; padding: 10px 12px;
            display: flex; align-items: center; justify-content: space-between;
            cursor: pointer; transition: background 0.15s;
            box-shadow: none;
        }
        .rt-card:hover { background: var(--color-surface-hover); }
        .rt-card.disabled { opacity: 0.5; }
        .rt-card.disabled:hover { opacity: 0.7; }
        .rt-card-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .rt-card-main { display: flex; align-items: center; gap: 6px; }
        .rt-card-title { font-weight: 600; color: var(--color-text); font-size: 0.88rem; }
        .rt-freq-badge {
            font-size: 0.7rem; color: var(--color-text-secondary); background: var(--color-surface-hover);
            padding: 1px 6px; border-radius: var(--radius-sm);
        }
        .rt-card-meta { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .rt-tag { font-size: 0.6rem; font-weight: 600; padding: 1px 5px; border-radius: var(--radius-sm); color: #fff; }
        .rt-meta-item { font-size: 0.7rem; color: var(--color-text-muted); }
        .rt-end-date { color: var(--color-warning); }

        .rt-toolbar {
            display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
            margin-bottom: 10px; padding: 6px 0;
            background: transparent; border: none;
            border-bottom: 1px solid var(--border-color);
            border-radius: 0; box-shadow: none;
        }
        .rt-project-badge {
            display: inline-flex; align-items: center; gap: 3px;
            font-size: .6rem; font-weight: 600; padding: 1px 5px;
            border-radius: var(--radius-sm); border: 1px solid; white-space: nowrap;
        }
        .rt-project-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        .rt-empty { text-align: left; padding: 1.5rem 0; color: var(--color-text-muted); display: flex; flex-direction: column; align-items: flex-start; }
        .rt-empty-icon { color: var(--color-text-disabled); margin-bottom: 4px; opacity: 0.5; }
        .rt-empty-title { font-size: 0.88rem; font-weight: 500; color: var(--color-text-secondary); }
        .rt-empty-hint { font-size: 0.78rem; color: var(--color-text-disabled); margin-top: 2px; }

        /* iOS-style Switch (card) */
        .rt-switch {
            position: relative; width: 40px; height: 24px;
            border-radius: 12px; border: none; cursor: pointer;
            transition: background 0.3s; flex-shrink: 0;
            padding: 0;
        }
        .rt-switch.on { background: var(--color-accent); }
        .rt-switch.off { background: var(--color-text-disabled); }
        .rt-switch .rt-switch-knob {
            position: absolute; top: 2px; width: 20px; height: 20px;
            border-radius: 50%; background: #fff;
            box-shadow: none;
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .rt-switch.on .rt-switch-knob { left: 18px; }
        .rt-switch.off .rt-switch-knob { left: 2px; }

        .rt-toast { position: fixed; bottom: 1.5rem; right: 1.5rem; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 0.78rem; z-index: 3000; font-weight: 500; box-shadow: none; animation: slideUp 0.3s; }
        .rt-toast-ok { background: var(--toast-success-bg); color: var(--toast-success-text); border: 1px solid var(--toast-success-border); }
        .rt-toast-err { background: var(--toast-error-bg); color: var(--toast-error-text); border: 1px solid var(--toast-error-border); }
            `}</style>
        </div>
    );
}
