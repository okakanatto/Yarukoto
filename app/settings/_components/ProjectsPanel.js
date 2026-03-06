'use client';

import { useState, useCallback, useMemo } from 'react';
import ColorPalette from '@/components/ColorPalette';
import { fetchDb } from '@/lib/utils';
import { useDragReorder } from '@/hooks/useDragReorder';

export default function ProjectsPanel({ data, setData, flash }) {
    const [newProject, setNewProject] = useState({ name: '', color: '#8b5cf6' });
    const [openPalette, setOpenPalette] = useState(null);
    const [saving, setSaving] = useState(false);

    const tp = (key) => setOpenPalette(openPalette === key ? null : key);

    const [showArchived, setShowArchived] = useState(false);

    const activeProjects = useMemo(
        () => (data.projects || []).filter(p => !p.archived_at),
        [data.projects]
    );

    const archivedProjects = useMemo(
        () => (data.projects || []).filter(p => p.archived_at),
        [data.projects]
    );

    const setActiveProjects = useCallback((fn) => {
        setData(p => {
            const active = (p.projects || []).filter(pr => !pr.archived_at);
            const archived = (p.projects || []).filter(pr => pr.archived_at);
            const newActive = typeof fn === 'function' ? fn(active) : fn;
            return { ...p, projects: [...newActive, ...archived] };
        });
    }, [setData]);

    const dragProjects = useDragReorder(activeProjects, setActiveProjects);

    const saveOrder = async () => {
        setSaving(true);
        try {
            const db = await fetchDb();
            const active = (data.projects || []).filter(p => !p.archived_at);
            for (let i = 0; i < active.length; i++) {
                await db.execute(
                    'UPDATE projects SET name = $1, color = $2, sort_order = $3, updated_at = datetime(\'now\', \'localtime\') WHERE id = $4',
                    [active[i].name, active[i].color, i, active[i].id]
                );
            }
            flash('ok', '保存しました');
            window.dispatchEvent(new Event('yarukoto:projectsChanged'));
        } catch (e) { console.error(e); flash('err', '保存に失敗しました'); }
        finally { setSaving(false); }
    };

    const addProject = async (e) => {
        e.preventDefault();
        if (!newProject.name.trim()) return;
        try {
            const db = await fetchDb();
            const maxSort = await db.select('SELECT MAX(sort_order) as ms FROM projects');
            const nextSort = (maxSort[0]?.ms || 0) + 1;
            const result = await db.execute(
                'INSERT INTO projects (name, color, sort_order) VALUES ($1, $2, $3)',
                [newProject.name, newProject.color, nextSort]
            );
            const newId = result.lastInsertId;
            setData(p => ({
                ...p,
                projects: [...(p.projects || []), {
                    id: newId, name: newProject.name, color: newProject.color,
                    sort_order: nextSort, is_default: 0, archived_at: null
                }]
            }));
            setNewProject({ name: '', color: '#8b5cf6' });
            flash('ok', 'プロジェクトを追加しました');
            window.dispatchEvent(new Event('yarukoto:projectsChanged'));
        } catch (e) { console.error(e); flash('err', '追加に失敗しました'); }
    };

    const updProject = (id, field, val) => {
        setData(p => ({
            ...p,
            projects: (p.projects || []).map(pr => pr.id === id ? { ...pr, [field]: val } : pr)
        }));
    };

    const commitProject = async (id, overrides = {}) => {
        const proj = (data.projects || []).find(p => p.id === id);
        if (!proj) return;
        const name = overrides.name ?? proj.name;
        const color = overrides.color ?? proj.color;
        try {
            const db = await fetchDb();
            await db.execute(
                'UPDATE projects SET name = $1, color = $2, updated_at = datetime(\'now\', \'localtime\') WHERE id = $3',
                [name, color, id]
            );
            window.dispatchEvent(new Event('yarukoto:projectsChanged'));
        } catch (e) { console.error(e); flash('err', '保存に失敗しました'); }
    };

    const delProject = async (id) => {
        const proj = (data.projects || []).find(p => p.id === id);
        if (!proj || proj.is_default) return;
        if (!confirm('このプロジェクトを削除しますか？')) return;
        try {
            const db = await fetchDb();
            // Check usage in tasks
            const taskUsage = await db.select(
                'SELECT COUNT(*) as cnt FROM tasks WHERE project_id = $1', [id]
            );
            if (taskUsage[0]?.cnt > 0) {
                flash('err', `このプロジェクトは ${taskUsage[0].cnt} 件のタスクで使用中のため削除できません`);
                return;
            }
            // Check usage in routines
            const routineUsage = await db.select(
                'SELECT COUNT(*) as cnt FROM routines WHERE project_id = $1', [id]
            );
            if (routineUsage[0]?.cnt > 0) {
                flash('err', `このプロジェクトは ${routineUsage[0].cnt} 件のルーティンで使用中のため削除できません`);
                return;
            }
            await db.execute('DELETE FROM projects WHERE id = $1', [id]);
            setData(p => ({ ...p, projects: (p.projects || []).filter(pr => pr.id !== id) }));
            flash('ok', 'プロジェクトを削除しました');
            window.dispatchEvent(new Event('yarukoto:projectsChanged'));
        } catch (e) { console.error(e); flash('err', '削除に失敗しました'); }
    };

    const archiveProject = async (id) => {
        const proj = (data.projects || []).find(p => p.id === id);
        if (!proj || proj.is_default) return;
        if (!confirm(`「${proj.name}」をアーカイブしますか？`)) return;
        try {
            const db = await fetchDb();
            await db.execute(
                'UPDATE projects SET archived_at = datetime(\'now\', \'localtime\'), updated_at = datetime(\'now\', \'localtime\') WHERE id = $1',
                [id]
            );
            const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
            setData(p => ({
                ...p,
                projects: (p.projects || []).map(pr => pr.id === id ? { ...pr, archived_at: now } : pr)
            }));
            flash('ok', 'アーカイブしました');
            window.dispatchEvent(new Event('yarukoto:projectsChanged'));
        } catch (e) { console.error(e); flash('err', 'アーカイブに失敗しました'); }
    };

    const restoreProject = async (id) => {
        try {
            const db = await fetchDb();
            await db.execute(
                'UPDATE projects SET archived_at = NULL, updated_at = datetime(\'now\', \'localtime\') WHERE id = $1',
                [id]
            );
            setData(p => ({
                ...p,
                projects: (p.projects || []).map(pr => pr.id === id ? { ...pr, archived_at: null } : pr)
            }));
            flash('ok', '復元しました');
            window.dispatchEvent(new Event('yarukoto:projectsChanged'));
        } catch (e) { console.error(e); flash('err', '復元に失敗しました'); }
    };

    const moveProject = (index, direction) => {
        const active = (data.projects || []).filter(p => !p.archived_at);
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= active.length) return;
        setData(p => {
            const a = (p.projects || []).filter(pr => !pr.archived_at);
            const archived = (p.projects || []).filter(pr => pr.archived_at);
            [a[index], a[newIndex]] = [a[newIndex], a[index]];
            return { ...p, projects: [...a, ...archived] };
        });
    };

    return (
        <>
            <div className="s-head-row">
                <h3 className="s-heading">プロジェクト管理</h3>
                <button className="s-btn-primary" onClick={saveOrder} disabled={saving}>
                    {saving ? '保存中...' : '並び順を保存'}
                </button>
            </div>
            <form onSubmit={addProject}>
                <div className="s-add-row">
                    <button type="button" className="s-swatch" style={{ backgroundColor: newProject.color }} onClick={() => tp('new-proj')} />
                    <input type="text" className="s-input" placeholder="新しいプロジェクト名を入力..." value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })} />
                    <button type="submit" className="s-btn-primary" disabled={!newProject.name.trim()}>+ 追加</button>
                </div>
            </form>
            {openPalette === 'new-proj' && <div className="s-palette s-add-pal"><ColorPalette value={newProject.color} onChange={c => setNewProject({ ...newProject, color: c })} /></div>}
            <div className="s-list">
                {activeProjects.length === 0 && <p className="s-empty">プロジェクトがまだありません</p>}
                {activeProjects.map((proj, i) => (
                    <div className="s-item" key={`proj-${proj.id}`}
                        draggable
                        onDragStart={dragProjects.onDragStart(i)}
                        onDragEnd={dragProjects.onDragEnd}
                        onDragOver={dragProjects.onDragOver(i)}
                        onDrop={dragProjects.onDrop(i)}
                    >
                        <div className="s-row">
                            <span className="s-grip" title="ドラッグして並べ替え">&#x2807;</span>
                            <div className="s-move-btns">
                                <button className="s-move-btn" onClick={() => moveProject(i, -1)} disabled={i === 0} type="button" title="上に移動">&#x25B2;</button>
                                <button className="s-move-btn" onClick={() => moveProject(i, 1)} disabled={i === activeProjects.length - 1} type="button" title="下に移動">&#x25BC;</button>
                            </div>
                            <button className="s-swatch" style={{ backgroundColor: proj.color }} onClick={() => tp(`proj-${proj.id}`)} type="button" title="色を変更" />
                            <div className="s-bar" style={{ backgroundColor: proj.color }} />
                            {proj.is_default
                                ? <span className="s-label">{proj.name}</span>
                                : <input className="s-input" type="text" value={proj.name} onChange={e => updProject(proj.id, 'name', e.target.value)} onBlur={() => commitProject(proj.id)} />
                            }
                            {!proj.is_default && (
                                <button className="s-archive-btn" onClick={() => archiveProject(proj.id)} type="button" title="アーカイブ">&#x1F4E6;</button>
                            )}
                            {!proj.is_default && (
                                <button className="s-del" onClick={() => delProject(proj.id)} type="button" title="削除">&#x1F5D1;</button>
                            )}
                        </div>
                        {openPalette === `proj-${proj.id}` && (
                            <div className="s-palette">
                                <ColorPalette value={proj.color} onChange={c => { updProject(proj.id, 'color', c); commitProject(proj.id, { color: c }); }} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {archivedProjects.length > 0 && (
                <div className="s-archived-section">
                    <button className="s-archived-toggle" onClick={() => setShowArchived(!showArchived)} type="button">
                        <span className={`s-archived-chev ${showArchived ? 'open' : ''}`}>&#x203A;</span>
                        アーカイブ済み ({archivedProjects.length})
                    </button>
                    {showArchived && (
                        <div className="s-list">
                            {archivedProjects.map(proj => (
                                <div className="s-item s-item-archived" key={`proj-arch-${proj.id}`}>
                                    <div className="s-row">
                                        <div className="s-swatch" style={{ backgroundColor: proj.color, opacity: 0.5 }} />
                                        <div className="s-bar" style={{ backgroundColor: proj.color, opacity: 0.3 }} />
                                        <span className="s-label s-label-archived">{proj.name}</span>
                                        <button className="s-del s-unarchive-btn" onClick={() => restoreProject(proj.id)} type="button" title="復元">&#x21A9;</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <p className="s-hint">※ デフォルトプロジェクト（General）は名前の変更・削除ができません</p>
        </>
    );
}
