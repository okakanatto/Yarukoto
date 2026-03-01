'use client';

import { useState, useCallback, useMemo } from 'react';
import ColorPalette from '@/components/ColorPalette';
import { fetchDb } from '@/lib/utils';
import { useDragReorder } from '@/hooks/useDragReorder';

export default function TagsPanel({ data, setData, flash }) {
    const [newTag, setNewTag] = useState({ name: '', color: '#3b82f6' });
    const [openPalette, setOpenPalette] = useState(null);
    const [saving, setSaving] = useState(false);

    const tp = (key) => setOpenPalette(openPalette === key ? null : key);

    const activeTags = useMemo(() => data.tags.filter(t => !t.archived), [data.tags]);
    const setActiveTags = useCallback((fn) => {
        setData(p => {
            const active = p.tags.filter(t => !t.archived);
            const archived = p.tags.filter(t => t.archived);
            const newActive = typeof fn === 'function' ? fn(active) : fn;
            return { ...p, tags: [...newActive, ...archived] };
        });
    }, [setData]);
    const dragTags = useDragReorder(activeTags, setActiveTags);

    const saveTags = async () => {
        setSaving(true);
        try {
            const db = await fetchDb();
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

    const addTag = async (e) => {
        e.preventDefault();
        if (!newTag.name.trim()) return;
        try {
            const db = await fetchDb();
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
        setData(p => ({ ...p, tags: p.tags.map(t => t.id === id ? { ...t, [field]: val } : t) }));
    };

    const commitTag = async (id) => {
        const tag = data.tags.find(t => t.id === id);
        if (!tag) return;
        try {
            const db = await fetchDb();
            await db.execute('UPDATE tags SET name = $1, color = $2 WHERE id = $3', [tag.name, tag.color, id]);
        } catch (e) { console.error(e); }
    };

    const delTag = async (id) => {
        if (!confirm('このタグを削除しますか？')) return;
        try {
            const db = await fetchDb();
            await db.execute('DELETE FROM tags WHERE id = $1', [id]);
            setData(p => ({ ...p, tags: p.tags.filter(t => t.id !== id) }));
            flash('ok', 'タグを削除しました');
        } catch (e) { console.error(e); flash('err', '削除に失敗しました'); }
    };

    const toggleArchiveTag = async (id) => {
        const tag = data.tags.find(t => t.id === id);
        if (!tag) return;
        const newArchived = tag.archived ? 0 : 1;
        setData(p => ({ ...p, tags: p.tags.map(t => t.id === id ? { ...t, archived: newArchived } : t) }));
        try {
            const db = await fetchDb();
            await db.execute('UPDATE tags SET archived = $1 WHERE id = $2', [newArchived, id]);
            flash('ok', newArchived ? 'タグをアーカイブしました' : 'タグのアーカイブを解除しました');
        } catch (e) {
            console.error(e);
            setData(p => ({ ...p, tags: p.tags.map(t => t.id === id ? { ...t, archived: tag.archived } : t) }));
            flash('err', 'アーカイブの変更に失敗しました');
        }
    };

    const moveTag = (index, direction) => {
        const active = data.tags.filter(t => !t.archived);
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= active.length) return;
        setData(p => {
            const a = p.tags.filter(t => !t.archived);
            const archived = p.tags.filter(t => t.archived);
            [a[index], a[newIndex]] = [a[newIndex], a[index]];
            return { ...p, tags: [...a, ...archived] };
        });
    };

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
}
