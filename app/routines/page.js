'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchDb, parseTags, formatMin } from '@/lib/utils';
import { useMasterData } from '@/hooks/useMasterData';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import RoutineFormModal from './_components/RoutineFormModal';

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
                    <h2 className="page-title">🔄 ルーティン設定</h2>
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
                        <span className="rt-empty-icon">{activeTab === 'active' ? '📭' : '🗑️'}</span>
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
                                    <span className="rt-meta-item">⏱ {formatMin(r.estimated_hours)}</span>
                                )}
                                {r.end_date && (
                                    <span className="rt-meta-item rt-end-date">📅 〜{r.end_date}</span>
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

            {toast && <div className={`rt-toast ${toast.type === 'ok' ? 'rt-toast-ok' : 'rt-toast-err'}`}>{toast.type === 'ok' ? '✅' : '❌'} {toast.msg}</div>}

            <style jsx>{`
        .rt-page { max-width: 800px; margin: 0 auto; animation: slideUp 0.4s ease; }
        .rt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
        .rt-sub { color: var(--color-text-muted); font-size: 0.85rem; margin-top: 0.2rem; }

        .rt-btn-add {
            background: var(--color-primary); color: #fff; border: none;
            padding: 0.6rem 1.2rem; border-radius: 50px;
            font-size: 0.9rem; font-weight: 600; cursor: pointer;
            box-shadow: 0 2px 8px rgba(79,110,247,0.3); transition: all 0.2s;
        }
        .rt-btn-add:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(79,110,247,0.4); }

        /* Tabs */
        .rt-tabs { display: flex; gap: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; }
        .rt-tab {
            background: none; border: none; padding: 0.8rem 0.5rem;
            color: var(--color-text-secondary); font-weight: 500; cursor: pointer;
            border-bottom: 2px solid transparent; transition: all 0.2s;
        }
        .rt-tab:hover { color: var(--color-text); }
        .rt-tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }

        /* List */
        .rt-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .rt-card {
            background: var(--color-surface); border: 1px solid var(--border-color);
            border-radius: var(--radius-md); padding: 1rem 1.25rem;
            display: flex; align-items: center; justify-content: space-between;
            cursor: pointer; transition: all 0.15s;
            box-shadow: var(--shadow-sm);
        }
        .rt-card:hover { border-color: var(--color-primary); transform: translateY(-1px); box-shadow: var(--shadow-md); }
        .rt-card.disabled { opacity: 0.5; }
        .rt-card.disabled:hover { opacity: 0.7; }
        .rt-card-content { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
        .rt-card-main { display: flex; align-items: center; gap: 0.75rem; }
        .rt-card-title { font-weight: 600; color: var(--color-text); font-size: 1rem; }
        .rt-freq-badge {
            font-size: 0.75rem; color: var(--color-text-secondary); background: var(--color-surface-hover);
            padding: 0.1rem 0.6rem; border-radius: 4px;
        }
        .rt-card-meta { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
        .rt-tag { font-size: 0.63rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 10px; color: #fff; }
        .rt-meta-item { font-size: 0.75rem; color: var(--color-text-muted); }
        .rt-end-date { color: var(--color-warning); }

        .rt-toolbar {
            display: flex; align-items: center; gap: .85rem; flex-wrap: wrap;
            margin-bottom: 1rem; padding: .65rem .85rem;
            background: var(--color-surface); border: 1px solid var(--border-color);
            border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
        }
        .rt-project-badge {
            display: inline-flex; align-items: center; gap: .25rem;
            font-size: .63rem; font-weight: 600; padding: .1rem .5rem;
            border-radius: 10px; border: 1px solid; white-space: nowrap;
        }
        .rt-project-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        .rt-empty { text-align: center; padding: 3rem; color: var(--color-text-muted); display: flex; flex-direction: column; align-items: center; }
        .rt-empty-icon { font-size: 3rem; margin-bottom: 0.5rem; opacity: 0.5; }

        /* iOS-style Switch (card) */
        .rt-switch {
            position: relative; width: 48px; height: 28px;
            border-radius: 14px; border: none; cursor: pointer;
            transition: background 0.3s; flex-shrink: 0;
            padding: 0;
        }
        .rt-switch.on { background: var(--color-primary); }
        .rt-switch.off { background: #e5e5ea; }
        .rt-switch .rt-switch-knob {
            position: absolute; top: 2px; width: 24px; height: 24px;
            border-radius: 50%; background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .rt-switch.on .rt-switch-knob { left: 22px; }
        .rt-switch.off .rt-switch-knob { left: 2px; }

        .rt-toast { position: fixed; bottom: 2rem; right: 2rem; padding: 0.8rem 1.5rem; border-radius: 8px; z-index: 3000; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.1); animation: slideUp 0.3s; }
        .rt-toast-ok { background: #ecfdf5; color: #15803d; border: 1px solid #bbf7d0; }
        .rt-toast-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
            `}</style>
        </div>
    );
}
