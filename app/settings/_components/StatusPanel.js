'use client';

import { useState, useCallback } from 'react';
import ColorPalette from '@/components/ColorPalette';
import { fetchDb } from '@/lib/utils';
import { useDragReorder } from '@/hooks/useDragReorder';

export default function StatusPanel({ data, setData, flash }) {
    const [newStatus, setNewStatus] = useState({ label: '', color: '#94a3b8' });
    const [openPalette, setOpenPalette] = useState(null);
    const [saving, setSaving] = useState(false);

    const tp = (key) => setOpenPalette(openPalette === key ? null : key);

    const setStatusList = useCallback((fn) => {
        setData(p => ({ ...p, status: typeof fn === 'function' ? fn(p.status) : fn }));
    }, [setData]);
    const dragStatus = useDragReorder(data.status, setStatusList);

    const upd = (id, field, val) =>
        setData(p => ({ ...p, status: p.status.map(x => x.code === id ? { ...x, [field]: val } : x) }));

    const saveMaster = async () => {
        setSaving(true);
        try {
            const db = await fetchDb();
            for (let i = 0; i < data.status.length; i++) {
                const x = data.status[i];
                await db.execute(
                    'UPDATE status_master SET label = $1, color = $2, sort_order = $3 WHERE code = $4',
                    [x.label, x.color, i, x.code]
                );
            }
            flash('ok', '保存しました');
        } catch (e) { console.error(e); flash('err', '保存に失敗しました'); }
        finally { setSaving(false); }
    };

    const addStatus = async () => {
        if (!newStatus.label.trim()) return;
        try {
            const db = await fetchDb();
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
            const db = await fetchDb();
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

    const moveStatus = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= data.status.length) return;
        setData(p => {
            const arr = [...p.status];
            [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
            return { ...p, status: arr };
        });
    };

    const row = (key, color, label, index, opts = {}) => {
        const { onColor, onLabel, onBlur, onDel, readOnly, onMoveUp, onMoveDown } = opts;
        const isOpen = openPalette === key;
        return (
            <div className="s-item" key={key}
                draggable
                onDragStart={dragStatus.onDragStart(index)}
                onDragEnd={dragStatus.onDragEnd}
                onDragOver={dragStatus.onDragOver(index)}
                onDrop={dragStatus.onDrop(index)}
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
        <>
            <div className="s-head-row">
                <h3 className="s-heading">ステータスの設定</h3>
                <button className="s-btn-primary" onClick={saveMaster} disabled={saving}>
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
                    return row(`st-${s.code}`, s.color, s.label, i, {
                        onColor: c => upd(s.code, 'color', c),
                        onLabel: isSystem ? undefined : v => upd(s.code, 'label', v),
                        onDel: isSystem ? undefined : () => delStatus(s.code),
                        readOnly: isSystem,
                        onMoveUp: i > 0 ? () => moveStatus(i, -1) : undefined,
                        onMoveDown: i < data.status.length - 1 ? () => moveStatus(i, 1) : undefined,
                    });
                })}
                <p className="s-hint">※ {data.status.filter(s => s.code <= 5).map(s => s.label).join('・')} はシステム必須のため名前・削除の変更はできません（並び順は変更可能）</p>
            </div>
        </>
    );
}
