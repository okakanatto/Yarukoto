'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ColorPalette from '@/components/ColorPalette';

const TABS = [
    { key: 'tags', label: 'タグ', icon: '🏷️' },
    { key: 'status', label: 'ステータス', icon: '📊' },
    { key: 'options', label: 'オプション', icon: '🔧' },
    { key: 'data', label: 'データ管理', icon: '💾' },
];

/* ---- tiny drag-and-drop hook ---- */
function useDragReorder(items, setItems) {
    const dragIdx = useRef(null);
    const overIdx = useRef(null);

    const onDragStart = (i) => (e) => {
        dragIdx.current = i;
        e.dataTransfer.effectAllowed = 'move';
        // Make the dragged element semi-transparent
        requestAnimationFrame(() => {
            e.target.style.opacity = '0.4';
        });
    };

    const onDragEnd = (e) => {
        e.target.style.opacity = '1';
        dragIdx.current = null;
        overIdx.current = null;
    };

    const onDragOver = (i) => (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        overIdx.current = i;
    };

    const onDrop = (i) => (e) => {
        e.preventDefault();
        const from = dragIdx.current;
        if (from === null || from === i) return;
        setItems(prev => {
            const arr = [...prev];
            const [moved] = arr.splice(from, 1);
            arr.splice(i, 0, moved);
            return arr;
        });
        dragIdx.current = null;
        overIdx.current = null;
    };

    return { onDragStart, onDragEnd, onDragOver, onDrop };
}

export default function Settings() {
    const [tab, setTab] = useState('tags');
    const [data, setData] = useState({ tags: [], importance: [], urgency: [], status: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [newTag, setNewTag] = useState({ name: '', color: '#3b82f6' });
    const [newStatus, setNewStatus] = useState({ label: '', color: '#94a3b8' });
    const [openPalette, setOpenPalette] = useState(null);
    const [appSettings, setAppSettings] = useState({});

    useEffect(() => { load(); }, []);
    const flash = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

    const load = async () => {
        setLoading(true);
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            const [importance, urgency, status, tagsData] = await Promise.all([
                db.select('SELECT * FROM importance_master ORDER BY level'),
                db.select('SELECT * FROM urgency_master ORDER BY level'),
                db.select('SELECT * FROM status_master ORDER BY sort_order, code'),
                db.select('SELECT * FROM tags ORDER BY sort_order, id'),
            ]);
            setData({ importance, urgency, status, tags: tagsData });
            // Load app settings
            const settingsRows = await db.select('SELECT key, value FROM app_settings');
            const settingsMap = {};
            settingsRows.forEach(r => { settingsMap[r.key] = r.value; });
            setAppSettings(settingsMap);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const upd = (type, id, idField, field, val) =>
        setData(p => ({ ...p, [type]: p[type].map(x => x[idField] === id ? { ...x, [field]: val } : x) }));

    const setList = useCallback((type) => (fn) => {
        setData(p => ({ ...p, [type]: typeof fn === 'function' ? fn(p[type]) : fn }));
    }, []);

    // Drag reorder for active tags only (archived tags are excluded from drag)
    const activeTags = useMemo(() => data.tags.filter(t => !t.archived), [data.tags]);
    const setActiveTags = useCallback((fn) => {
        setData(p => {
            const active = p.tags.filter(t => !t.archived);
            const archived = p.tags.filter(t => t.archived);
            const newActive = typeof fn === 'function' ? fn(active) : fn;
            return { ...p, tags: [...newActive, ...archived] };
        });
    }, []);
    const dragTags = useDragReorder(activeTags, setActiveTags);
    const dragStatus = useDragReorder(data.status, setList('status'));

    const getDrag = (type) => {
        switch (type) {
            case 'tags': return dragTags;
            case 'status': return dragStatus;
        }
    };

    const saveMaster = async (type) => {
        setSaving(true);
        const idF = type === 'status' ? 'code' : 'level';
        const table = type === 'status' ? 'status_master' : `${type}_master`;
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            for (let i = 0; i < data[type].length; i++) {
                const x = data[type][i];
                await db.execute(
                    `UPDATE ${table} SET label = $1, color = $2, sort_order = $3 WHERE ${idF} = $4`,
                    [x.label, x.color, i, x[idF]]
                );
            }
            flash('ok', '保存しました');
        } catch (e) { console.error(e); flash('err', '保存に失敗しました'); }
        finally { setSaving(false); }
    };

    const saveTags = async () => {
        setSaving(true);
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            const active = data.tags.filter(t => !t.archived);
            const archived = data.tags.filter(t => t.archived);
            for (let i = 0; i < active.length; i++) {
                const t = active[i];
                await db.execute(
                    'UPDATE tags SET name = $1, color = $2, sort_order = $3 WHERE id = $4',
                    [t.name, t.color, i, t.id]
                );
            }
            for (let i = 0; i < archived.length; i++) {
                const t = archived[i];
                await db.execute(
                    'UPDATE tags SET sort_order = $1 WHERE id = $2',
                    [active.length + i, t.id]
                );
            }
            flash('ok', '保存しました');
        } catch (e) { console.error(e); flash('err', '保存に失敗しました'); }
        finally { setSaving(false); }
    };

    const addStatus = async () => {
        if (!newStatus.label.trim()) return;
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            const maxSort = await db.select('SELECT MAX(sort_order) as ms FROM status_master');
            const nextSort = (maxSort[0]?.ms || 0) + 1;
            const result = await db.execute(
                'INSERT INTO status_master (label, color, sort_order) VALUES ($1, $2, $3)',
                [newStatus.label, newStatus.color, nextSort]
            );
            const newCode = result.lastInsertId;
            setData(p => ({ ...p, status: [...p.status, { code: newCode, label: newStatus.label, color: newStatus.color, sort_order: nextSort }] }));
            setNewStatus({ label: '', color: '#94a3b8' });
            flash('ok', 'ステータスを追加しました');
        } catch (e) { console.error(e); flash('err', '追加に失敗しました'); }
    };

    const delStatus = async (code) => {
        if (!confirm('このステータスを削除しますか？')) return;
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            // Check if any tasks use this status
            const usage = await db.select('SELECT COUNT(*) as cnt FROM tasks WHERE status_code = $1', [code]);
            if (usage[0]?.cnt > 0) {
                flash('err', `このステータスは ${usage[0].cnt} 件のタスクで使用中のため削除できません`);
                return;
            }
            await db.execute('DELETE FROM status_master WHERE code = $1', [code]);
            setData(p => ({ ...p, status: p.status.filter(s => s.code !== code) }));
            flash('ok', '削除しました');
        } catch (e) { console.error(e); flash('err', '削除に失敗しました'); }
    };

    const addTag = async (e) => {
        e.preventDefault();
        if (!newTag.name.trim()) return;
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            const maxSort = await db.select('SELECT MAX(sort_order) as ms FROM tags');
            const nextSort = (maxSort[0]?.ms || 0) + 1;
            const result = await db.execute(
                'INSERT INTO tags (name, color, sort_order) VALUES ($1, $2, $3)',
                [newTag.name, newTag.color, nextSort]
            );
            const newId = result.lastInsertId;
            setData(p => {
                const active = p.tags.filter(t => !t.archived);
                const archived = p.tags.filter(t => t.archived);
                return { ...p, tags: [...active, { id: newId, name: newTag.name, color: newTag.color, sort_order: nextSort, archived: 0 }, ...archived] };
            });
            setNewTag({ name: '', color: '#3b82f6' });
            flash('ok', 'タグを追加しました');
        } catch (e) { console.error(e); flash('err', '追加に失敗しました'); }
    };

    const updTag = (id, field, val) => {
        const tags = data.tags.map(t => t.id === id ? { ...t, [field]: val } : t);
        setData(p => ({ ...p, tags }));
    };

    const commitTag = async (id) => {
        const tag = data.tags.find(t => t.id === id);
        if (!tag) return;
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            await db.execute('UPDATE tags SET name = $1, color = $2 WHERE id = $3', [tag.name, tag.color, id]);
        } catch (e) { console.error(e); }
    };

    const delTag = async (id) => {
        if (!confirm('このタグを削除しますか？')) return;
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            await db.execute('DELETE FROM tags WHERE id = $1', [id]);
            setData(p => ({ ...p, tags: p.tags.filter(t => t.id !== id) }));
            flash('ok', 'タグを削除しました');
        } catch (e) { console.error(e); flash('err', '削除に失敗しました'); }
    };

    const toggleArchiveTag = async (id) => {
        const tag = data.tags.find(t => t.id === id);
        if (!tag) return;
        const newArchived = tag.archived ? 0 : 1;
        // Optimistic update
        setData(p => ({ ...p, tags: p.tags.map(t => t.id === id ? { ...t, archived: newArchived } : t) }));
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            await db.execute('UPDATE tags SET archived = $1 WHERE id = $2', [newArchived, id]);
            flash('ok', newArchived ? 'タグをアーカイブしました' : 'タグのアーカイブを解除しました');
        } catch (e) {
            console.error(e);
            // Revert
            setData(p => ({ ...p, tags: p.tags.map(t => t.id === id ? { ...t, archived: tag.archived } : t) }));
            flash('err', 'アーカイブの変更に失敗しました');
        }
    };

    const tp = (key) => setOpenPalette(openPalette === key ? null : key);

    const toggleSetting = async (key) => {
        const current = appSettings[key] || '0';
        const next = current === '1' ? '0' : '1';
        // Optimistic update
        setAppSettings(prev => ({ ...prev, [key]: next }));
        try {
            const { getDb } = await import('@/lib/db');
            const db = await getDb();
            await db.execute(
                'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
                [key, next]
            );
        } catch (e) {
            console.error(e);
            // Revert on error
            setAppSettings(prev => ({ ...prev, [key]: current }));
            flash('err', '設定の保存に失敗しました');
        }
    };

    const moveTag = (index, direction) => {
        const activeTags = data.tags.filter(t => !t.archived);
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= activeTags.length) return;
        setData(p => {
            const active = p.tags.filter(t => !t.archived);
            const archived = p.tags.filter(t => t.archived);
            [active[index], active[newIndex]] = [active[newIndex], active[index]];
            return { ...p, tags: [...active, ...archived] };
        });
    };

    const moveStatus = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= data.status.length) return;
        setData(p => {
            const arr = [...p.status];
            [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
            return { ...p, status: arr };
        });
    };

    const row = (key, color, label, index, type, opts = {}) => {
        const { onColor, onLabel, onBlur, onDel, readOnly, onMoveUp, onMoveDown } = opts;
        const isOpen = openPalette === key;
        const drag = getDrag(type);
        return (
            <div className="s-item" key={key}
                draggable
                onDragStart={drag.onDragStart(index)}
                onDragEnd={drag.onDragEnd}
                onDragOver={drag.onDragOver(index)}
                onDrop={drag.onDrop(index)}
            >
                <div className="s-row">
                    <span className="s-grip" title="ドラッグして並べ替え">⠿</span>
                    {(onMoveUp || onMoveDown) && (
                        <div className="s-move-btns">
                            <button className="s-move-btn" onClick={onMoveUp} disabled={!onMoveUp} type="button" title="上に移動">▲</button>
                            <button className="s-move-btn" onClick={onMoveDown} disabled={!onMoveDown} type="button" title="下に移動">▼</button>
                        </div>
                    )}
                    <button className="s-swatch" style={{ backgroundColor: color }} onClick={() => tp(key)} type="button" title="色を変更" />
                    <div className="s-bar" style={{ backgroundColor: color }} />
                    {readOnly
                        ? <span className="s-label">{label}</span>
                        : <input className="s-input" type="text" value={label} onChange={e => onLabel?.(e.target.value)} onBlur={onBlur} />
                    }
                    {onDel && <button className="s-del" onClick={onDel} type="button" title="削除">🗑</button>}
                </div>
                {isOpen && <div className="s-palette"><ColorPalette value={color} onChange={c => { onColor?.(c); onBlur?.(); }} /></div>}
            </div>
        );
    };

    return (
        <div className="s-page">
            <h2 className="page-title">⚙️ 設定</h2>
            <p className="s-sub">タグやマスターデータをカスタマイズ</p>

            <div className="s-tabs">
                {TABS.map(t => (
                    <button key={t.key} className={`s-tab ${tab === t.key ? 'on' : ''}`}
                        onClick={() => { setTab(t.key); setOpenPalette(null); }}>
                        <span>{t.icon}</span><span>{t.label}</span>
                    </button>
                ))}
            </div>

            <div className="s-panel">
                {loading ? (
                    <div className="s-center"><span className="spinner" /> 読み込み中...</div>
                ) : (
                    <>
                        {/* ── Tags ── */}
                        {tab === 'tags' && (() => {
                            const activeTags = data.tags.filter(t => !t.archived);
                            const archivedTags = data.tags.filter(t => t.archived);
                            return (
                            <>
                                <div className="s-head-row">
                                    <h3 className="s-heading">タグ管理</h3>
                                    <button className="s-btn-primary" onClick={saveTags} disabled={saving}>
                                        {saving ? '保存中...' : '並び順を保存'}
                                    </button>
                                </div>
                                <form onSubmit={addTag}>
                                    <div className="s-add-row">
                                        <button type="button" className="s-swatch" style={{ backgroundColor: newTag.color }} onClick={() => tp('new-tag')} />
                                        <input type="text" className="s-input" placeholder="新しいタグ名を入力..." value={newTag.name} onChange={e => setNewTag({ ...newTag, name: e.target.value })} />
                                        <button type="submit" className="s-btn-primary" disabled={!newTag.name.trim()}>＋ 追加</button>
                                    </div>
                                </form>
                                {openPalette === 'new-tag' && <div className="s-palette s-add-pal"><ColorPalette value={newTag.color} onChange={c => setNewTag({ ...newTag, color: c })} /></div>}
                                <div className="s-list">
                                    {activeTags.length === 0 && archivedTags.length === 0 && <p className="s-empty">タグがまだありません</p>}
                                    {activeTags.length === 0 && archivedTags.length > 0 && <p className="s-empty">有効なタグがありません</p>}
                                    {activeTags.map((t, i) => (
                                        <div className="s-item" key={`tag-${t.id}`}
                                            draggable
                                            onDragStart={dragTags.onDragStart(i)}
                                            onDragEnd={dragTags.onDragEnd}
                                            onDragOver={dragTags.onDragOver(i)}
                                            onDrop={dragTags.onDrop(i)}
                                        >
                                            <div className="s-row">
                                                <span className="s-grip" title="ドラッグして並べ替え">⠿</span>
                                                <div className="s-move-btns">
                                                    <button className="s-move-btn" onClick={() => moveTag(i, -1)} disabled={i === 0} type="button" title="上に移動">▲</button>
                                                    <button className="s-move-btn" onClick={() => moveTag(i, 1)} disabled={i === activeTags.length - 1} type="button" title="下に移動">▼</button>
                                                </div>
                                                <button className="s-swatch" style={{ backgroundColor: t.color }} onClick={() => tp(`tag-${t.id}`)} type="button" title="色を変更" />
                                                <div className="s-bar" style={{ backgroundColor: t.color }} />
                                                <input className="s-input" type="text" value={t.name} onChange={e => updTag(t.id, 'name', e.target.value)} onBlur={() => commitTag(t.id)} />
                                                <button className="s-archive-btn" onClick={() => toggleArchiveTag(t.id)} type="button" title="アーカイブ">📦</button>
                                                <button className="s-del" onClick={() => delTag(t.id)} type="button" title="削除">🗑</button>
                                            </div>
                                            {openPalette === `tag-${t.id}` && <div className="s-palette"><ColorPalette value={t.color} onChange={c => { updTag(t.id, 'color', c); commitTag(t.id); }} /></div>}
                                        </div>
                                    ))}
                                </div>
                                {archivedTags.length > 0 && (
                                    <>
                                        <div className="s-archived-header">
                                            <span className="s-archived-label">📦 アーカイブ済み（{archivedTags.length}件）</span>
                                        </div>
                                        <div className="s-list s-list-archived">
                                            {archivedTags.map(t => (
                                                <div className="s-item s-item-archived" key={`tag-${t.id}`}>
                                                    <div className="s-row">
                                                        <span className="s-grip" style={{ visibility: 'hidden' }}>⠿</span>
                                                        <div className="s-swatch" style={{ backgroundColor: t.color, opacity: 0.5 }} />
                                                        <div className="s-bar" style={{ backgroundColor: t.color, opacity: 0.5 }} />
                                                        <span className="s-label" style={{ opacity: 0.6 }}>{t.name}</span>
                                                        <button className="s-archive-btn s-unarchive-btn" onClick={() => toggleArchiveTag(t.id)} type="button" title="アーカイブ解除">📤</button>
                                                        <button className="s-del" onClick={() => delTag(t.id)} type="button" title="削除">🗑</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                            );
                        })()}

                        {/* ── Status ── */}
                        {tab === 'status' && (
                            <>
                                <div className="s-head-row">
                                    <h3 className="s-heading">ステータスの設定</h3>
                                    <button className="s-btn-primary" onClick={() => saveMaster('status')} disabled={saving}>
                                        {saving ? '保存中...' : '並び順を保存'}
                                    </button>
                                </div>
                                <div className="s-add-row">
                                    <button type="button" className="s-swatch" style={{ backgroundColor: newStatus.color }} onClick={() => tp('new-st')} />
                                    <input type="text" className="s-input" placeholder="新しいステータス名..." value={newStatus.label} onChange={e => setNewStatus({ ...newStatus, label: e.target.value })} />
                                    <button type="button" className="s-btn-primary" onClick={addStatus} disabled={!newStatus.label.trim()}>＋ 追加</button>
                                </div>
                                {openPalette === 'new-st' && <div className="s-palette s-add-pal"><ColorPalette value={newStatus.color} onChange={c => setNewStatus({ ...newStatus, color: c })} /></div>}
                                <div className="s-list">
                                    {data.status.map((s, i) => {
                                        const isSystem = s.code <= 5;
                                        return row(`st-${s.code}`, s.color, s.label, i, 'status', {
                                            onColor: c => upd('status', s.code, 'code', 'color', c),
                                            onLabel: isSystem ? undefined : v => upd('status', s.code, 'code', 'label', v),
                                            onDel: isSystem ? undefined : () => delStatus(s.code),
                                            readOnly: isSystem,
                                            onMoveUp: i > 0 ? () => moveStatus(i, -1) : undefined,
                                            onMoveDown: i < data.status.length - 1 ? () => moveStatus(i, 1) : undefined,
                                        });
                                    })}
                                    <p className="s-hint">※ {data.status.filter(s => s.code <= 5).map(s => s.label).join('・')} はシステム必須のため名前・削除の変更はできません（並び順は変更可能）</p>
                                </div>
                            </>
                        )}

                        {/* ── Options ── */}
                        {tab === 'options' && (
                            <>
                                <h3 className="s-heading">オプション設定</h3>
                                <div className="opt-section">
                                    <div className="opt-card">
                                        <div className="opt-info">
                                            <span className="opt-icon">🏷️</span>
                                            <div>
                                                <strong className="opt-title">子タスクに親タスクのタグを自動付与</strong>
                                                <p className="opt-desc">
                                                    ドラッグ＆ドロップでタスクを子タスク化した際、親タスクのタグを自動的に引き継ぎます。
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className={`opt-toggle ${appSettings.inherit_parent_tags === '1' ? 'on' : ''}`}
                                            onClick={() => toggleSetting('inherit_parent_tags')}
                                            role="switch"
                                            aria-checked={appSettings.inherit_parent_tags === '1'}
                                        >
                                            <span className="opt-toggle-knob" />
                                        </button>
                                    </div>
                                    <div className="opt-card">
                                        <div className="opt-info">
                                            <span className="opt-icon">⚠️</span>
                                            <div>
                                                <strong className="opt-title">期限切れタスクを今日やるタスクに表示する</strong>
                                                <p className="opt-desc">
                                                    過去に期限が切れた未完了のタスクを「今日やるタスク」画面に自動表示するかどうかを選択します。
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className={`opt-toggle ${appSettings.show_overdue_in_today !== '0' ? 'on' : ''}`}
                                            onClick={() => toggleSetting('show_overdue_in_today')}
                                            role="switch"
                                            aria-checked={appSettings.show_overdue_in_today !== '0'}
                                        >
                                            <span className="opt-toggle-knob" />
                                        </button>
                                    </div>
                                    <div className="opt-card">
                                        <div className="opt-info">
                                            <span className="opt-icon">📦</span>
                                            <div>
                                                <strong className="opt-title">完了タスクの自動アーカイブ</strong>
                                                <p className="opt-desc">
                                                    完了日から指定日数が経過したタスクを自動的にアーカイブします。0に設定すると自動アーカイブは無効になります。キャンセル済みタスクは対象外です。
                                                </p>
                                            </div>
                                        </div>
                                        <div className="opt-number-group">
                                            <input
                                                type="number"
                                                className="opt-number-input"
                                                min="0"
                                                max="9999"
                                                value={appSettings.auto_archive_days || '0'}
                                                onChange={(e) => {
                                                    setAppSettings(prev => ({ ...prev, auto_archive_days: e.target.value }));
                                                }}
                                                onBlur={async () => {
                                                    const val = String(parseInt(appSettings.auto_archive_days) || 0);
                                                    setAppSettings(prev => ({ ...prev, auto_archive_days: val }));
                                                    try {
                                                        const { getDb } = await import('@/lib/db');
                                                        const db = await getDb();
                                                        await db.execute(
                                                            'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
                                                            ['auto_archive_days', val]
                                                        );
                                                        if (parseInt(val) > 0) {
                                                            const { runAutoArchive } = await import('@/lib/db');
                                                            await runAutoArchive(db);
                                                            flash('ok', `自動アーカイブ設定を保存しました（${val}日）`);
                                                        } else {
                                                            flash('ok', '自動アーカイブを無効にしました');
                                                        }
                                                    } catch (e) {
                                                        console.error(e);
                                                        flash('err', '設定の保存に失敗しました');
                                                    }
                                                }}
                                            />
                                            <span className="opt-number-unit">日後</span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── Data Management ── */}
                        {tab === 'data' && (
                            <>
                                <h3 className="s-heading">データ管理</h3>

                                <div className="dm-section">
                                    <div className="dm-card">
                                        <div className="dm-card-info">
                                            <span className="dm-icon">📤</span>
                                            <div>
                                                <strong>CSVエクスポート</strong>
                                                <p className="dm-desc">全タスクをCSVファイルとしてダウンロードします</p>
                                            </div>
                                        </div>
                                        <button className="s-btn-primary" onClick={async () => {
                                            try {
                                                const { getDb } = await import('@/lib/db');
                                                const db = await getDb();
                                                const rows = await db.select(`
                                                    SELECT t.*,
                                                           im.label as importance_label, um.label as urgency_label, sm.label as status_label
                                                    FROM tasks t
                                                    LEFT JOIN importance_master im ON t.importance_level = im.level
                                                    LEFT JOIN urgency_master um ON t.urgency_level = um.level
                                                    LEFT JOIN status_master sm ON t.status_code = sm.code
                                                    ORDER BY t.id
                                                `);
                                                const header = 'id,title,status,importance,urgency,start_date,due_date,estimated_minutes,notes,created_at';
                                                const csvRows = rows.map(r =>
                                                    [r.id, `"${(r.title || '').replace(/"/g, '""')}"`, r.status_label || '', r.importance_label || '', r.urgency_label || '', r.start_date || '', r.due_date || '', r.estimated_hours || '', `"${(r.notes || '').replace(/"/g, '""')}"`, r.created_at || ''].join(',')
                                                );
                                                const bom = '\uFEFF';
                                                const csvText = bom + header + '\n' + csvRows.join('\n');
                                                const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `tasks_${new Date().toLocaleDateString('sv-SE')}.csv`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                                flash('ok', 'CSVをダウンロードしました');
                                            } catch (e) { console.error(e); flash('err', 'エクスポートに失敗しました'); }
                                        }}>ダウンロード</button>
                                    </div>

                                    <div className="dm-card">
                                        <div className="dm-card-info">
                                            <span className="dm-icon">📥</span>
                                            <div>
                                                <strong>CSVインポート</strong>
                                                <p className="dm-desc">CSVファイルからタスクを一括登録します（title列必須）</p>
                                            </div>
                                        </div>
                                        <label className="s-btn-primary dm-file-label">
                                            ファイルを選択
                                            <input type="file" accept=".csv" hidden onChange={async (ev) => {
                                                const file = ev.target.files?.[0];
                                                if (!file) return;
                                                try {
                                                    const text = await file.text();
                                                    const lines = text.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
                                                    if (lines.length < 2) { flash('err', 'CSVにデータ行がありません'); ev.target.value = ''; return; }
                                                    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"(.*)"$/, '$1'));
                                                    const titleIdx = headers.indexOf('title');
                                                    if (titleIdx === -1) { flash('err', 'title列が見つかりません'); ev.target.value = ''; return; }
                                                    const { getDb } = await import('@/lib/db');
                                                    const db = await getDb();
                                                    let count = 0;
                                                    for (let i = 1; i < lines.length; i++) {
                                                        // Simple CSV parse (handles quoted fields)
                                                        const cols = [];
                                                        let cur = '', inQ = false;
                                                        for (const ch of lines[i]) {
                                                            if (ch === '"') { inQ = !inQ; }
                                                            else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
                                                            else { cur += ch; }
                                                        }
                                                        cols.push(cur.trim());
                                                        const title = cols[titleIdx];
                                                        if (!title) continue;
                                                        await db.execute('INSERT INTO tasks (title, status_code) VALUES ($1, 1)', [title]);
                                                        count++;
                                                    }
                                                    flash('ok', `${count}件のタスクをインポートしました`);
                                                } catch (e) { console.error(e); flash('err', 'インポートに失敗しました'); }
                                                ev.target.value = '';
                                            }} />
                                        </label>
                                    </div>

                                    <div className="dm-divider" />

                                    <div className="dm-card dm-danger">
                                        <div className="dm-card-info">
                                            <span className="dm-icon">⚠️</span>
                                            <div>
                                                <strong>全データ削除</strong>
                                                <p className="dm-desc">すべてのタスクおよびルーティンを完全に削除します。この操作は元に戻せません。</p>
                                            </div>
                                        </div>
                                        <button className="s-btn-danger" onClick={async () => {
                                            if (!confirm('本当にすべてのタスクとルーティンを削除しますか？\n\nこの操作は元に戻せません。')) return;
                                            if (!confirm('最終確認：すべてのユーザーデータ（タスク・ルーティン）が完全に削除されます。よろしいですか？')) return;
                                            try {
                                                const { getDb } = await import('@/lib/db');
                                                const db = await getDb();

                                                // BUG-2: ルーティンデータも削除対象に含める（子テーブルから先に削除）
                                                await db.execute('DELETE FROM routine_completions');
                                                await db.execute('DELETE FROM routine_tags');
                                                await db.execute('DELETE FROM routines');

                                                await db.execute('DELETE FROM task_tags');
                                                await db.execute('DELETE FROM tasks');

                                                flash('ok', 'すべてのデータを削除しました');
                                            } catch (e) { console.error(e); flash('err', '削除に失敗しました'); }
                                        }}>全削除</button>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {toast && <div className={`s-toast ${toast.type === 'ok' ? 's-toast-ok' : 's-toast-err'}`}>{toast.type === 'ok' ? '✅' : '❌'} {toast.msg}</div>}

            <style jsx global>{`
        .s-page { max-width:700px; animation:s-up .35s ease }
        @keyframes s-up { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .s-sub { color:var(--color-text-muted); font-size:.88rem; margin-top:-1rem; margin-bottom:1.75rem }

        .s-tabs { display:flex; gap:3px; margin-bottom:1.25rem; padding:4px; background:var(--color-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); box-shadow:var(--shadow-sm) }
        .s-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:.35rem; padding:.6rem .5rem; border:none; background:transparent; color:var(--color-text-muted); font-size:.85rem; font-weight:500; border-radius:9px; cursor:pointer; transition:all .2s; font-family:inherit }
        .s-tab:hover { background:var(--color-surface-hover); color:var(--color-text) }
        .s-tab.on { background:var(--color-primary); color:#fff; font-weight:600; box-shadow:0 2px 10px rgba(79,110,247,.18) }

        .s-panel { background:var(--color-surface); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:1.5rem; min-height:200px; box-shadow:var(--shadow-sm) }
        .s-center { display:flex; align-items:center; justify-content:center; gap:.6rem; padding:3rem; color:var(--color-text-muted) }

        .s-head-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem }
        .s-heading { font-size:1rem; font-weight:700; color:var(--color-text); margin:0 0 1rem }
        .s-head-row .s-heading { margin-bottom:0 }

        .s-add-row { display:flex; align-items:center; gap:.65rem; padding-bottom:1rem; margin-bottom:.75rem; border-bottom:1px solid var(--border-color) }
        .s-add-pal { margin-bottom:.75rem }

        .s-list { display:flex; flex-direction:column; gap:4px }
        .s-item { cursor:grab; }
        .s-item:active { cursor:grabbing; }
        .s-row {
          display:flex; align-items:center; gap:.5rem;
          padding:.55rem .65rem; background:var(--color-surface);
          border-radius:var(--radius-sm); border:1px solid transparent; transition:all .18s;
        }
        .s-row:hover { background:var(--color-surface-hover); border-color:var(--border-color) }

        /* ---- Drag grip ---- */
        .s-grip {
          color:var(--color-text-disabled); font-size:1rem;
          cursor:grab; user-select:none; line-height:1;
          width:20px; text-align:center; flex-shrink:0;
          transition:color .15s;
        }
        .s-row:hover .s-grip { color:var(--color-text-muted); }

        /* ---- Move up/down buttons ---- */
        .s-move-btns {
          display:flex; flex-direction:column; gap:1px; flex-shrink:0;
        }
        .s-move-btn {
          background:transparent; border:1px solid transparent;
          color:var(--color-text-disabled); cursor:pointer;
          width:22px; height:14px; border-radius:3px;
          display:flex; align-items:center; justify-content:center;
          font-size:.55rem; line-height:1; padding:0;
          transition:all .15s; font-family:inherit;
        }
        .s-move-btn:hover:not(:disabled) {
          background:var(--color-surface-hover); border-color:var(--border-color);
          color:var(--color-primary);
        }
        .s-move-btn:active:not(:disabled) { transform:scale(.9) }
        .s-move-btn:disabled { opacity:.2; cursor:default }

        .s-swatch {
          width:34px; height:34px; min-width:34px;
          border-radius:var(--radius-sm); border:2px solid var(--border-color);
          cursor:pointer; padding:0;
          transition:transform .15s, box-shadow .15s, border-color .15s;
          box-shadow:var(--shadow-sm);
        }
        .s-swatch:hover { transform:scale(1.1); box-shadow:var(--shadow-md); border-color:var(--border-color-hover) }

        .s-bar { width:3px; height:22px; border-radius:2px; flex-shrink:0; opacity:.8 }

        .s-palette {
          margin-top:4px; padding:.75rem;
          background:var(--color-surface-hover); border-radius:var(--radius-sm);
          border:1px solid var(--border-color); animation:s-pal .2s ease;
        }
        @keyframes s-pal { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

        .s-input {
          flex:1; background:transparent; border:1px solid transparent;
          padding:.35rem .55rem; color:var(--color-text); border-radius:6px;
          font-size:.88rem; font-weight:500; outline:none; transition:all .18s; font-family:inherit;
        }
        .s-input:focus { background:var(--color-surface-hover); border-color:var(--color-primary); box-shadow:0 0 0 2px var(--color-primary-glow) }
        .s-input::placeholder { color:var(--color-text-disabled); font-weight:400 }
        .s-label { flex:1; font-size:.88rem; font-weight:500; color:var(--color-text); padding:.35rem .55rem }

        .s-btn-primary {
          background:var(--color-primary); border:none; color:#fff;
          padding:.42rem .9rem; border-radius:var(--radius-sm); font-size:.82rem;
          font-weight:600; cursor:pointer; white-space:nowrap; transition:all .18s; font-family:inherit;
        }
        .s-btn-primary:hover:not(:disabled) { filter:brightness(1.1); transform:translateY(-1px) }
        .s-btn-primary:active:not(:disabled) { transform:translateY(0) }
        .s-btn-primary:disabled { opacity:.4; cursor:not-allowed }

        .s-del {
          background:transparent; border:1px solid transparent;
          color:var(--color-text-disabled); cursor:pointer;
          width:28px; height:28px; min-width:28px; border-radius:7px;
          display:flex; align-items:center; justify-content:center;
          font-size:.75rem; transition:all .18s; opacity:0;
        }
        .s-row:hover .s-del { opacity:1 }
        .s-del:hover { background:var(--color-danger-bg); border-color:rgba(220,38,38,.15); color:var(--color-danger) }

        .s-empty { color:var(--color-text-disabled); font-size:.85rem; padding:2rem; text-align:center }
        .s-hint { color:var(--color-text-muted); font-size:.75rem; padding:.75rem 0 0; margin:0; font-style:italic; }

        /* Archive button */
        .s-archive-btn {
          background:transparent; border:1px solid transparent;
          color:var(--color-text-disabled); cursor:pointer;
          width:28px; height:28px; min-width:28px; border-radius:7px;
          display:flex; align-items:center; justify-content:center;
          font-size:.75rem; transition:all .18s; opacity:0;
        }
        .s-row:hover .s-archive-btn { opacity:1 }
        .s-archive-btn:hover { background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.2); }
        .s-unarchive-btn { opacity:1 !important; }
        .s-unarchive-btn:hover { background:rgba(79,110,247,.1); border-color:rgba(79,110,247,.2); }

        /* Archived section */
        .s-archived-header {
          display:flex; align-items:center; gap:.5rem;
          margin-top:1.25rem; padding:.6rem 0 .4rem;
          border-top:1px solid var(--border-color);
        }
        .s-archived-label { font-size:.82rem; font-weight:600; color:var(--color-text-muted); }
        .s-list-archived { opacity:.75; }
        .s-item-archived { cursor:default; }
        .s-item-archived .s-row { background:var(--color-surface); }
        .s-item-archived .s-del { opacity:0; }
        .s-item-archived .s-row:hover .s-del { opacity:1; }

        /* Data Management */
        .dm-section { display:flex; flex-direction:column; gap:.75rem }
        .dm-card { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.25rem; border:1px solid var(--border-color); border-radius:var(--radius-md); transition:border-color .2s }
        .dm-card:hover { border-color:var(--border-color-hover) }
        .dm-card-info { display:flex; align-items:center; gap:.75rem; flex:1 }
        .dm-icon { font-size:1.3rem }
        .dm-card-info strong { font-size:.88rem; color:var(--color-text); display:block }
        .dm-desc { font-size:.78rem; color:var(--color-text-muted); margin:.15rem 0 0 }
        .dm-file-label { cursor:pointer }
        .dm-divider { height:1px; background:var(--border-color); margin:.5rem 0 }
        .dm-danger { border-color:rgba(220,38,38,.15); background:rgba(220,38,38,.02) }
        .dm-danger:hover { border-color:rgba(220,38,38,.3) }
        .s-btn-danger { background:var(--color-danger,#dc2626); border:none; color:#fff; padding:.45rem 1rem; border-radius:var(--radius-sm); font-size:.82rem; font-weight:600; cursor:pointer; font-family:inherit; transition:all .18s; white-space:nowrap }
        .s-btn-danger:hover { filter:brightness(1.1); transform:translateY(-1px) }

        /* Options tab */
        .opt-section { display:flex; flex-direction:column; gap:.75rem }
        .opt-card {
          display:flex; align-items:center; justify-content:space-between; gap:1rem;
          padding:1rem 1.25rem; border:1px solid var(--border-color);
          border-radius:var(--radius-md); transition:border-color .2s;
        }
        .opt-card:hover { border-color:var(--border-color-hover) }
        .opt-info { display:flex; align-items:flex-start; gap:.75rem; flex:1 }
        .opt-icon { font-size:1.3rem; margin-top:2px }
        .opt-title { font-size:.88rem; color:var(--color-text); display:block }
        .opt-desc { font-size:.78rem; color:var(--color-text-muted); margin:.25rem 0 0; line-height:1.45 }

        .opt-toggle {
          position:relative; width:48px; height:26px; border-radius:13px;
          background:var(--color-text-disabled); border:none; cursor:pointer;
          transition:background .25s; flex-shrink:0; padding:0;
        }
        .opt-toggle.on { background:var(--color-primary) }
        .opt-toggle-knob {
          position:absolute; top:3px; left:3px; width:20px; height:20px;
          border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.2);
          transition:transform .25s cubic-bezier(.34,1.56,.64,1);
        }
        .opt-toggle.on .opt-toggle-knob { transform:translateX(22px) }

        .opt-number-group {
          display:flex; align-items:center; gap:.4rem; flex-shrink:0;
        }
        .opt-number-input {
          width:70px; padding:.4rem .5rem; border:1px solid var(--border-color);
          border-radius:var(--radius-sm); background:var(--color-surface-hover);
          color:var(--color-text); font-size:.88rem; font-family:inherit;
          text-align:center; transition:border-color .2s, box-shadow .2s;
        }
        .opt-number-input:focus {
          outline:none; border-color:var(--color-primary);
          box-shadow:0 0 0 3px var(--color-primary-glow);
          background:var(--color-surface);
        }
        .opt-number-unit { font-size:.82rem; color:var(--color-text-muted); font-weight:500; white-space:nowrap; }

        .s-toast {
          position:fixed; bottom:1.5rem; right:1.5rem;
          padding:.75rem 1.25rem; border-radius:var(--radius-md);
          font-size:.85rem; font-weight:500; z-index:9999;
          box-shadow:0 8px 24px rgba(0,0,0,0.1);
          animation:s-tIn .3s cubic-bezier(.16,1,.3,1);
        }
        .s-toast-ok  { background:#ecfdf5; border:1px solid #bbf7d0; color:#15803d }
        .s-toast-err { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c }
        @keyframes s-tIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
        </div>
    );
}
