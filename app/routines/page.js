'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMasterData } from '@/hooks/useMasterData';
import TagSelect from '@/components/TagSelect';
import { fetchDb, parseTags } from '@/lib/utils';

const FREQ_OPTIONS = [
    { value: 'daily', label: '毎日' },
    { value: 'weekly', label: '毎週' },
    { value: 'monthly', label: '毎月' },
];

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default function RoutinesPage() {
    const [routines, setRoutines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived'

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(getEmptyForm());

    // Toast State
    const [toast, setToast] = useState(null);

    const { masters, tags } = useMasterData();


    function getEmptyForm() {
        return {
            title: '', frequency: 'daily', days_of_week: '',
            day_of_month: new Date().getDate(), holiday_action: 'none', monthly_type: 'date',
            importance_level: '', urgency_level: '',
            estimated_hours: '', notes: '', tags: [], enabled: true,
            end_date: '',
        };
    }

    const flash = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

    const loadRoutines = useCallback(async () => {
        setLoading(true);
        try {
            const db = await fetchDb();
            const sql = `
              SELECT r.*,
                     json_group_array(tg.name) as tag_names,
                     json_group_array(tg.color) as tag_colors,
                     json_group_array(tg.id) as tag_ids
              FROM routines r
              LEFT JOIN routine_tags rt ON r.id = rt.routine_id
              LEFT JOIN tags tg ON rt.tag_id = tg.id
              GROUP BY r.id
              ORDER BY r.created_at DESC
            `;
            const rawRoutines = await db.select(sql);
            const parsedRoutines = rawRoutines.map(r => ({
                ...r,
                tags: parseTags(r)
            }));
            setRoutines(parsedRoutines);
        } catch (e) { console.error("Tauri DB fetch routines error:", e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadRoutines(); }, [loadRoutines]);

    const handleOpenModal = (routine = null) => {
        if (routine) {
            setEditingId(routine.id);
            setForm({
                title: routine.title,
                frequency: routine.frequency,
                days_of_week: routine.days_of_week || '',
                day_of_month: routine.day_of_month || new Date().getDate(),
                monthly_type: routine.monthly_type || 'date',
                holiday_action: routine.weekdays_only ? 'skip' : (routine.holiday_action || 'none'),
                importance_level: routine.importance_level || '',
                urgency_level: routine.urgency_level || '',
                estimated_hours: routine.estimated_hours || '',
                notes: routine.notes || '',
                tags: routine.tags ? routine.tags.map(t => t.id) : [],
                enabled: !!routine.enabled,
                end_date: routine.end_date || '',
            });
        } else {
            setEditingId(null);
            setForm(getEmptyForm());
        }
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        setEditingId(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        if (form.frequency === 'weekly' && (!form.days_of_week || form.days_of_week.trim() === '')) {
            flash('err', '曜日を1つ以上選択してください');
            return;
        }

        const payload = {
            ...form,
            importance_level: form.importance_level || null,
            urgency_level: form.urgency_level || null,
            estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
            day_of_month: form.frequency === 'monthly' ? Number(form.day_of_month) : null,
            days_of_week: form.frequency === 'weekly' ? form.days_of_week : null,
            end_date: form.end_date || null,
            // daily routines only support none/skip (forward/backward make no sense)
            holiday_action: form.frequency === 'daily' && ['forward', 'backward'].includes(form.holiday_action) ? 'none' : form.holiday_action,
        };

        try {
            const db = await fetchDb();

            if (editingId) {
                // Update existing routine
                await db.execute(`
                    UPDATE routines 
                    SET title=$1, frequency=$2, days_of_week=$3, day_of_month=$4, 
                        holiday_action=$5, monthly_type=$6, importance_level=$7, urgency_level=$8, 
                        estimated_hours=$9, notes=$10, enabled=$11, end_date=$12, weekdays_only=0, updated_at=datetime('now', 'localtime')
                    WHERE id=$13
                `, [
                    payload.title, payload.frequency, payload.days_of_week, payload.day_of_month,
                    payload.holiday_action, payload.monthly_type, payload.importance_level, payload.urgency_level,
                    payload.estimated_hours, payload.notes, payload.enabled ? 1 : 0, payload.end_date, editingId
                ]);

                await db.execute('DELETE FROM routine_tags WHERE routine_id=$1', [editingId]);
                if (payload.tags && payload.tags.length > 0) {
                    for (const tagId of payload.tags) {
                        await db.execute('INSERT INTO routine_tags (routine_id, tag_id) VALUES ($1, $2)', [editingId, tagId]);
                    }
                }
                flash('ok', 'ルーティンを更新しました');
            } else {
                // Insert new routine
                const result = await db.execute(`
                    INSERT INTO routines (
                        title, frequency, days_of_week, day_of_month, holiday_action, monthly_type, weekdays_only,
                        importance_level, urgency_level, estimated_hours, notes, enabled, end_date
                    ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, $11, $12)
                `, [
                    payload.title, payload.frequency, payload.days_of_week, payload.day_of_month,
                    payload.holiday_action, payload.monthly_type, payload.importance_level, payload.urgency_level,
                    payload.estimated_hours, payload.notes, payload.enabled ? 1 : 0, payload.end_date
                ]);

                const newId = result.lastInsertId;
                if (payload.tags && payload.tags.length > 0) {
                    for (const tagId of payload.tags) {
                        await db.execute('INSERT INTO routine_tags (routine_id, tag_id) VALUES ($1, $2)', [newId, tagId]);
                    }
                }
                flash('ok', 'ルーティンを追加しました');
            }

            handleCloseModal();
            await loadRoutines();

        } catch (e) { console.error(e); flash('err', '保存に失敗しました'); }
    };

    const handleDelete = async (id) => {
        if (!confirm('このルーティンを削除しますか？')) return;
        try {
            const db = await fetchDb();
            await db.execute('DELETE FROM routines WHERE id = $1', [id]);
            flash('ok', 'ルーティンを削除しました');
            handleCloseModal();
            loadRoutines();
        } catch (e) { console.error(e); flash('err', '削除に失敗しました'); }
    };

    const handleQuickToggle = async (e, routine) => {
        e.stopPropagation();
        const newEnabled = !routine.enabled;
        // Optimistic update
        setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, enabled: newEnabled ? 1 : 0 } : r));
        try {
            const db = await fetchDb();
            await db.execute('UPDATE routines SET enabled = $1 WHERE id = $2', [newEnabled ? 1 : 0, routine.id]);
            flash('ok', newEnabled ? 'ルーティンを有効にしました' : 'ルーティンを停止しました');
        } catch (e) {
            console.error(e);
            // Revert
            setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, enabled: routine.enabled } : r));
            flash('err', '更新に失敗しました');
        }
    };

    const toggleDow = (day) => {
        const current = form.days_of_week ? form.days_of_week.split(',').map(Number) : [];
        const next = current.includes(day)
            ? current.filter(d => d !== day)
            : [...current, day].sort();
        setForm({ ...form, days_of_week: next.join(',') });
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

    // Filter routines by tab
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
                            </div>
                            <div className="rt-card-meta">
                                {r.tags && r.tags.map(t => (
                                    <span key={t.id} className="rt-tag" style={{ backgroundColor: t.color }}>{t.name}</span>
                                ))}
                                {r.estimated_hours > 0 && (
                                    <span className="rt-meta-item">⏱ {r.estimated_hours}分</span>
                                )}
                                {r.end_date && (
                                    <span className="rt-meta-item rt-end-date">📅 〜{r.end_date}</span>
                                )}
                            </div>
                        </div>
                        {/* Quick Toggle Switch */}
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
                <>
                    <div className="rt-backdrop" onClick={handleCloseModal} />
                    <div className="rt-modal">
                        <div className="rt-modal-header">
                            <h3>{editingId ? 'ルーティンを編集' : '新しいルーティン'}</h3>
                            <button className="rt-close-btn" onClick={handleCloseModal}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit} className="rt-modal-body">
                            <div className="rt-field">
                                <input
                                    className="rt-input-title"
                                    type="text"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="タイトルを追加"
                                    autoFocus
                                />
                            </div>

                            <div className="rt-section">
                                <div className="rt-section-row">
                                    <span className="rt-icon">🔄</span>
                                    <div className="rt-control-group">
                                        <select
                                            className="rt-select-clean"
                                            value={form.frequency}
                                            onChange={e => setForm({ ...form, frequency: e.target.value })}
                                        >
                                            {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>

                                        {/* Frequency details */}
                                        {form.frequency === 'monthly' && (
                                            <div className="rt-inline-input">
                                                <select
                                                    className="rt-select-clean"
                                                    value={form.monthly_type}
                                                    onChange={e => setForm({ ...form, monthly_type: e.target.value })}
                                                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                                                >
                                                    <option value="date">日付指定</option>
                                                    <option value="end_of_month">月末</option>
                                                </select>
                                                {form.monthly_type === 'date' && (
                                                    <>
                                                        <input
                                                            type="number" min="1" max="31"
                                                            value={form.day_of_month}
                                                            onChange={e => setForm({ ...form, day_of_month: Number(e.target.value) })}
                                                            className="rt-input-short"
                                                        />
                                                        <span>日</span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {form.frequency === 'weekly' && (
                                    <div className="rt-dow-container">
                                        {DAY_LABELS.map((label, i) => {
                                            const selected = form.days_of_week ? form.days_of_week.split(',').map(Number).includes(i) : false;
                                            return (
                                                <button key={i} type="button"
                                                    className={`rt-dow-btn ${selected ? 'on' : ''}`}
                                                    onClick={() => toggleDow(i)}>
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Holiday Action */}
                            <div className="rt-section">
                                <div className="rt-section-row">
                                    <span className="rt-icon">🎌</span>
                                    <div className="rt-control-group">
                                        <label className="rt-field-label">休日（土日祝）とかぶった時の対応</label>
                                        <select
                                            className="rt-select-clean"
                                            value={form.holiday_action}
                                            onChange={e => setForm({ ...form, holiday_action: e.target.value })}
                                        >
                                            <option value="none">何もしない（休日でも実行）</option>
                                            <option value="skip">スキップ（除外する）</option>
                                            {form.frequency !== 'daily' && <option value="forward">前倒し（直前の平日に移動）</option>}
                                            {form.frequency !== 'daily' && <option value="backward">後ろ倒し（直後の平日に移動）</option>}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* End Date */}
                            <div className="rt-section">
                                <div className="rt-section-row">
                                    <span className="rt-icon">📅</span>
                                    <div className="rt-control-group">
                                        <label className="rt-field-label">終了日（この日以降は表示されません）</label>
                                        <input
                                            type="date"
                                            className="rt-input-date"
                                            value={form.end_date}
                                            onChange={e => setForm({ ...form, end_date: e.target.value })}
                                        />
                                        {form.end_date && (
                                            <button type="button" className="rt-clear-date" onClick={() => setForm({ ...form, end_date: '' })}>
                                                ✕ 終了日をクリア
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Enable/Disable Toggle */}
                            {editingId && (
                                <>
                                    <div className="rt-divider" />
                                    <div className="rt-section">
                                        <div className="rt-section-row rt-toggle-row">
                                            <span className="rt-icon">{form.enabled ? '✅' : '⏸️'}</span>
                                            <div className="rt-toggle-info">
                                                <span className="rt-toggle-label">{form.enabled ? 'このルーティンは有効です' : 'このルーティンは停止中です'}</span>
                                                <span className="rt-toggle-hint">{form.enabled ? '今日のタスクに自動で表示されます' : '今日のタスクには表示されません'}</span>
                                            </div>
                                            <button
                                                type="button"
                                                className={`rt-switch-lg ${form.enabled ? 'on' : 'off'}`}
                                                onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                                            >
                                                <span className="rt-switch-knob" />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="rt-divider" />

                            <div className="rt-section">
                                <div className="rt-section-title">詳細設定</div>
                                <div className="rt-details-grid">
                                    <div className="rt-field">
                                        <label>重要度</label>
                                        <select className="rt-select" value={form.importance_level}
                                            onChange={e => setForm({ ...form, importance_level: e.target.value })}>
                                            <option value="">指定なし</option>
                                            {masters.importance.map(m => <option key={m.level} value={m.level}>{m.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="rt-field">
                                        <label>緊急度</label>
                                        <select className="rt-select" value={form.urgency_level}
                                            onChange={e => setForm({ ...form, urgency_level: e.target.value })}>
                                            <option value="">指定なし</option>
                                            {masters.urgency.map(m => <option key={m.level} value={m.level}>{m.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="rt-field">
                                        <label>見積(分)</label>
                                        <input className="rt-input" type="number" min="0" value={form.estimated_hours}
                                            onChange={e => setForm({ ...form, estimated_hours: e.target.value })}
                                            placeholder="30" />
                                    </div>
                                </div>
                                <div className="rt-field">
                                    <label>タグ</label>
                                    <TagSelect allTags={tags} selectedTagIds={form.tags}
                                        onChange={ids => setForm({ ...form, tags: ids })} />
                                </div>
                                <div className="rt-field">
                                    <label>メモ</label>
                                    <textarea className="rt-textarea" value={form.notes}
                                        onChange={e => setForm({ ...form, notes: e.target.value })}
                                        placeholder="メモを入力..." rows={2} />
                                </div>
                            </div>

                            <div className="rt-modal-footer">
                                {editingId && (
                                    <button type="button" className="rt-btn-danger" onClick={() => handleDelete(editingId)}>
                                        削除
                                    </button>
                                )}
                                <div style={{ flex: 1 }} />
                                <button type="button" className="rt-btn-cancel" onClick={handleCloseModal}>
                                    キャンセル
                                </button>
                                <button type="submit" className="rt-btn-save" disabled={!form.title.trim()}>
                                    保存
                                </button>
                            </div>
                        </form>
                    </div>
                </>
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
        .rt-tag { font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 4px; color: #fff; font-weight: 600; }
        .rt-meta-item { font-size: 0.75rem; color: var(--color-text-muted); }
        .rt-end-date { color: var(--color-warning); }
        
        .rt-empty { text-align: center; padding: 3rem; color: var(--color-text-muted); display: flex; flex-direction: column; align-items: center; }
        .rt-empty-icon { font-size: 3rem; margin-bottom: 0.5rem; opacity: 0.5; }

        /* iOS-style Switch (card) */
        .rt-switch {
            position: relative; width: 48px; height: 28px;
            border-radius: 14px; border: none; cursor: pointer;
            transition: background 0.3s; flex-shrink: 0;
            padding: 0;
        }
        .rt-switch.on { background: #34c759; }
        .rt-switch.off { background: #e5e5ea; }
        .rt-switch .rt-switch-knob {
            position: absolute; top: 2px; width: 24px; height: 24px;
            border-radius: 50%; background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .rt-switch.on .rt-switch-knob { left: 22px; }
        .rt-switch.off .rt-switch-knob { left: 2px; }

        /* iOS-style Switch (modal, larger) */
        .rt-switch-lg {
            position: relative; width: 56px; height: 32px;
            border-radius: 16px; border: none; cursor: pointer;
            transition: background 0.3s; flex-shrink: 0;
            padding: 0;
        }
        .rt-switch-lg.on { background: #34c759; }
        .rt-switch-lg.off { background: #e5e5ea; }
        .rt-switch-lg .rt-switch-knob {
            position: absolute; top: 2px; width: 28px; height: 28px;
            border-radius: 50%; background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .rt-switch-lg.on .rt-switch-knob { left: 26px; }
        .rt-switch-lg.off .rt-switch-knob { left: 2px; }

        /* Toggle row in modal */
        .rt-toggle-row { align-items: center !important; }
        .rt-toggle-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
        .rt-toggle-label { font-weight: 600; font-size: 0.92rem; color: var(--color-text); }
        .rt-toggle-hint { font-size: 0.78rem; color: var(--color-text-muted); }

        /* Modal */
        .rt-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2000; backdrop-filter: blur(2px); animation: fadeIn 0.2s; }
        .rt-modal {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 100%; max-width: 500px;
            background: var(--color-surface); border-radius: var(--radius-lg);
            box-shadow: var(--shadow-xl); z-index: 2001;
            display: flex; flex-direction: column;
            animation: modalIn 0.25s cubic-bezier(0.16,1,0.3,1);
            max-height: 90vh;
        }
        @keyframes modalIn { from { opacity: 0; transform: translate(-50%, -45%) scale(0.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }

        .rt-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); }
        .rt-close-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--color-text-secondary); }
        
        .rt-modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; overflow-y: auto; }
        .rt-input-title {
            width: 100%; border: none; border-bottom: 2px solid var(--border-color);
            font-size: 1.5rem; padding: 0.5rem 0; background: transparent;
            color: var(--color-text); transition: border-color 0.2s;
        }
        .rt-input-title:focus { outline: none; border-color: var(--color-primary); }

        .rt-section { display: flex; flex-direction: column; gap: 1rem; }
        .rt-section-row { display: flex; gap: 1rem; align-items: flex-start; }
        .rt-icon { font-size: 1.2rem; margin-top: 0.2rem; width: 24px; text-align: center; }
        .rt-control-group { flex: 1; display: flex; flex-direction: column; gap: 0.75rem; }
        .rt-field-label { font-size: 0.82rem; color: var(--color-text-secondary); font-weight: 500; }
        
        .rt-select-clean {
            background: var(--color-surface-hover); border: 1px solid transparent;
            padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.95rem;
            cursor: pointer; color: var(--color-text);
        }

        .rt-input-date {
            background: var(--color-surface-hover); border: 1px solid var(--border-color);
            padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.9rem;
            color: var(--color-text); width: 100%;
        }
        .rt-input-date:focus { outline: none; border-color: var(--color-primary); }
        .rt-clear-date {
            background: none; border: none; color: var(--color-text-muted);
            font-size: 0.78rem; cursor: pointer; text-align: left; padding: 0;
        }
        .rt-clear-date:hover { color: var(--color-danger); }

        .rt-checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; cursor: pointer; }
        .rt-inline-input { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
        .rt-input-short { width: 60px; padding: 0.3rem; border: 1px solid var(--border-color); border-radius: 4px; text-align: center; }

        .rt-dow-container { display: flex; justify-content: space-between; padding-left: 2rem; }
        .rt-dow-btn {
            width: 38px; height: 38px; border-radius: 50%;
            border: 1px solid var(--border-color); background: var(--color-surface);
            cursor: pointer; font-size: 0.8rem; color: var(--color-text-secondary);
            transition: all 0.2s;
        }
        .rt-dow-btn.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }

        .rt-divider { height: 1px; background: var(--border-color); margin: 0.5rem 0; }
        .rt-section-title { font-size: 0.85rem; font-weight: 600; color: var(--color-text-secondary); }
        .rt-details-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
        
        .rt-field label { display: block; font-size: 0.75rem; color: var(--color-text-secondary); margin-bottom: 0.25rem; font-weight: 500; }
        .rt-select, .rt-input, .rt-textarea {
            width: 100%; padding: 0.5rem; border: 1px solid var(--border-color);
            border-radius: var(--radius-sm); background: var(--color-surface);
            color: var(--color-text); font-size: 0.9rem; transition: border-color 0.2s;
        }
        .rt-select:focus, .rt-input:focus, .rt-textarea:focus { outline: none; border-color: var(--color-primary); }

        .rt-modal-footer { display: flex; gap: 0.75rem; padding-top: 1rem; border-top: 1px solid var(--border-color); }
        .rt-btn-save {
            background: var(--color-primary); color: #fff; border: none;
            padding: 0.6rem 1.5rem; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer;
            transition: all 0.15s;
        }
        .rt-btn-save:hover { filter: brightness(1.1); }
        .rt-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .rt-btn-cancel {
            background: var(--color-surface-hover); color: var(--color-text-secondary); border: 1px solid var(--border-color);
            padding: 0.6rem 1rem; border-radius: var(--radius-sm); cursor: pointer;
            transition: all 0.15s;
        }
        .rt-btn-cancel:hover { background: var(--color-surface-active); }
        .rt-btn-danger { background: transparent; color: var(--color-danger); border: none; font-size: 0.9rem; cursor: pointer; }
        .rt-btn-danger:hover { text-decoration: underline; }

        .rt-toast { position: fixed; bottom: 2rem; right: 2rem; padding: 0.8rem 1.5rem; border-radius: 8px; z-index: 3000; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.1); animation: slideUp 0.3s; }
        .rt-toast-ok { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        .rt-toast-err { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
            `}</style>
        </div>
    );
}
