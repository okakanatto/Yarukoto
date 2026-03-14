'use client';

import { fetchDb } from '@/lib/utils';
import { AlertTriangle, HardDriveDownload, HardDriveUpload } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { copyFile, exists, remove } from '@tauri-apps/plugin-fs';
import { join, appDataDir } from '@tauri-apps/api/path';
import { relaunch } from '@tauri-apps/plugin-process';

/* ── CSV helpers ── */
const escCSV = (v) => {
    if (v == null || v === '') return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
};

const parseCSVLine = (line) => {
    const cols = [];
    let cur = '', inQ = false, i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (inQ) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    cur += '"'; i += 2;
                } else { inQ = false; i++; }
            } else { cur += ch; i++; }
        } else {
            if (ch === '"') { inQ = true; i++; }
            else if (ch === ',') { cols.push(cur); cur = ''; i++; }
            else { cur += ch; i++; }
        }
    }
    cols.push(cur);
    return cols;
};

export default function DataPanel({ flash }) {

    const handleBackup = async () => {
        try {
            const db = await fetchDb();
            // Checkpoint WAL to flush all data to main DB file
            await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');

            const dataDir = await appDataDir();
            const dbPath = await join(dataDir, 'tasks.db');

            const timestamp = new Date().toLocaleDateString('sv-SE');
            const savePath = await save({
                defaultPath: `yarukoto-backup-${timestamp}.db`,
                filters: [{ name: 'SQLite Database', extensions: ['db'] }]
            });

            if (!savePath) return;

            await copyFile(dbPath, savePath);
            flash('ok', 'バックアップを保存しました');
        } catch (e) { console.error(e); flash('err', 'バックアップに失敗しました'); }
    };

    const handleRestore = async () => {
        try {
            const selectedPath = await open({
                filters: [{ name: 'SQLite Database', extensions: ['db'] }],
                multiple: false
            });

            if (!selectedPath) return;

            if (!confirm('選択したデータベースファイルで現在のデータを置き換えます。\n\n現在のデータは自動的にバックアップされます。\n復元後、アプリは再起動されます。\n\n続行しますか？')) return;

            const db = await fetchDb();
            // Checkpoint WAL to ensure current data is flushed
            await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');

            const dataDir = await appDataDir();
            const dbPath = await join(dataDir, 'tasks.db');

            // Auto-backup current DB before overwriting
            const now = new Date();
            const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
            const backupPath = await join(dataDir, `tasks.backup-${ts}.db`);
            await copyFile(dbPath, backupPath);

            // Close DB connection and clear singleton
            const { closeDb } = await import('@/lib/db');
            await closeDb();

            // Clean up WAL/SHM files
            const walPath = await join(dataDir, 'tasks.db-wal');
            const shmPath = await join(dataDir, 'tasks.db-shm');
            try { if (await exists(walPath)) await remove(walPath); } catch (_) { /* ignore */ }
            try { if (await exists(shmPath)) await remove(shmPath); } catch (_) { /* ignore */ }

            // Replace DB with selected file
            await copyFile(selectedPath, dbPath);

            // Restart app to load new DB
            await relaunch();
        } catch (e) { console.error(e); flash('err', '復元に失敗しました'); }
    };

    const handleExport = async () => {
        try {
            const db = await fetchDb();
            const rows = await db.select(`
                SELECT t.*,
                       GROUP_CONCAT(tg.name, '|') as tag_names,
                       p.name as project_name,
                       im.label as importance_label,
                       um.label as urgency_label,
                       sm.label as status_label
                FROM tasks t
                LEFT JOIN task_tags tt ON t.id = tt.task_id
                LEFT JOIN tags tg ON tt.tag_id = tg.id
                LEFT JOIN projects p ON t.project_id = p.id
                LEFT JOIN importance_master im ON t.importance_level = im.level
                LEFT JOIN urgency_master um ON t.urgency_level = um.level
                LEFT JOIN status_master sm ON t.status_code = sm.code
                GROUP BY t.id
                ORDER BY t.id
            `);
            const header = 'id,title,parent_id,status_code,status,importance_level,importance,urgency_level,urgency,start_date,due_date,estimated_minutes,today_date,notes,tags,project_id,project,sort_order,created_at,updated_at,completed_at,archived_at';
            const csvRows = rows.map(r => [
                r.id,
                escCSV(r.title),
                r.parent_id || '',
                r.status_code || '',
                escCSV(r.status_label),
                r.importance_level || '',
                escCSV(r.importance_label),
                r.urgency_level || '',
                escCSV(r.urgency_label),
                r.start_date || '',
                r.due_date || '',
                r.estimated_hours || '',
                r.today_date || '',
                escCSV(r.notes),
                escCSV(r.tag_names),
                r.project_id || '',
                escCSV(r.project_name),
                r.sort_order != null ? r.sort_order : '',
                r.created_at || '',
                r.updated_at || '',
                r.completed_at || '',
                r.archived_at || ''
            ].join(','));
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
    };

    const handleImport = async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
            if (lines.length < 2) { flash('err', 'CSVにデータ行がありません'); ev.target.value = ''; return; }

            const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
            const titleIdx = headers.indexOf('title');
            if (titleIdx === -1) { flash('err', 'title列が見つかりません'); ev.target.value = ''; return; }

            const col = (name) => headers.indexOf(name);
            const getVal = (cols, name) => {
                const idx = col(name);
                if (idx < 0 || idx >= cols.length) return null;
                const v = cols[idx].trim();
                return v || null;
            };

            const db = await fetchDb();

            // Load master data for label → code lookups (only when raw code column is absent)
            const statusMap = {};
            const importanceMap = {};
            const urgencyMap = {};
            const projectMap = {};

            if (col('status') >= 0 && col('status_code') < 0) {
                (await db.select('SELECT code, label FROM status_master')).forEach(s => { statusMap[s.label] = s.code; });
            }
            if (col('importance') >= 0 && col('importance_level') < 0) {
                (await db.select('SELECT level, label FROM importance_master')).forEach(r => { importanceMap[r.label] = r.level; });
            }
            if (col('urgency') >= 0 && col('urgency_level') < 0) {
                (await db.select('SELECT level, label FROM urgency_master')).forEach(r => { urgencyMap[r.label] = r.level; });
            }
            if (col('project') >= 0 && col('project_id') < 0) {
                (await db.select('SELECT id, name FROM projects WHERE archived_at IS NULL')).forEach(p => { projectMap[p.name] = p.id; });
            }

            // Parse all data rows
            const parsed = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                const title = cols[titleIdx]?.trim();
                if (!title) continue;
                parsed.push({ cols, title, csvId: getVal(cols, 'id') });
            }

            // Pass 1: Insert tasks, build old→new id mapping
            const idMap = {};
            let count = 0;

            for (const row of parsed) {
                const { cols, title, csvId } = row;

                let statusCode = getVal(cols, 'status_code');
                if (!statusCode) {
                    const label = getVal(cols, 'status');
                    statusCode = label ? statusMap[label] : null;
                }
                statusCode = statusCode ? parseInt(statusCode) : 1;

                let impLevel = getVal(cols, 'importance_level');
                if (!impLevel) {
                    const label = getVal(cols, 'importance');
                    impLevel = label ? importanceMap[label] : null;
                }
                impLevel = impLevel ? parseInt(impLevel) : null;

                let urgLevel = getVal(cols, 'urgency_level');
                if (!urgLevel) {
                    const label = getVal(cols, 'urgency');
                    urgLevel = label ? urgencyMap[label] : null;
                }
                urgLevel = urgLevel ? parseInt(urgLevel) : null;

                let projectId = getVal(cols, 'project_id');
                if (!projectId) {
                    const name = getVal(cols, 'project');
                    projectId = name ? projectMap[name] : null;
                }
                projectId = projectId ? parseInt(projectId) : null;

                const estMin = getVal(cols, 'estimated_minutes');
                const sortOrder = getVal(cols, 'sort_order');

                const result = await db.execute(
                    `INSERT INTO tasks (title, status_code, importance_level, urgency_level,
                     start_date, due_date, estimated_hours, today_date, notes,
                     project_id, sort_order, created_at, updated_at, completed_at, archived_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
                    [title, statusCode, impLevel, urgLevel,
                     getVal(cols, 'start_date'), getVal(cols, 'due_date'),
                     estMin ? parseInt(estMin) : null, getVal(cols, 'today_date'), getVal(cols, 'notes'),
                     projectId, sortOrder ? parseInt(sortOrder) : null,
                     getVal(cols, 'created_at'), getVal(cols, 'updated_at'),
                     getVal(cols, 'completed_at'), getVal(cols, 'archived_at')]
                );

                const newId = result.lastInsertId;
                if (csvId) idMap[csvId] = newId;
                row.newId = newId;
                count++;
            }

            // Pass 2: Update parent_id references using id mapping
            if (col('parent_id') >= 0) {
                for (const row of parsed) {
                    const parentCsvId = getVal(row.cols, 'parent_id');
                    if (parentCsvId && idMap[parentCsvId] && row.newId) {
                        await db.execute('UPDATE tasks SET parent_id = $1 WHERE id = $2', [idMap[parentCsvId], row.newId]);
                    }
                }
            }

            // Pass 3: Insert tags
            if (col('tags') >= 0) {
                const existingTags = await db.select('SELECT id, name FROM tags');
                const tagNameToId = {};
                existingTags.forEach(t => { tagNameToId[t.name] = t.id; });

                for (const row of parsed) {
                    const tagStr = getVal(row.cols, 'tags');
                    if (!tagStr || !row.newId) continue;
                    const tagNames = tagStr.split('|').map(t => t.trim()).filter(Boolean);
                    for (const tagName of tagNames) {
                        let tagId = tagNameToId[tagName];
                        if (!tagId) {
                            const r = await db.execute('INSERT INTO tags (name) VALUES ($1)', [tagName]);
                            tagId = r.lastInsertId;
                            tagNameToId[tagName] = tagId;
                        }
                        await db.execute('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [row.newId, tagId]);
                    }
                }
            }

            flash('ok', `${count}件のタスクをインポートしました`);
        } catch (e) { console.error(e); flash('err', 'インポートに失敗しました'); }
        ev.target.value = '';
    };

    const handleDeleteAll = async () => {
        if (!confirm('本当にすべてのタスクとルーティンを削除しますか？\n\nこの操作は元に戻せません。')) return;
        if (!confirm('最終確認：すべてのユーザーデータ（タスク・ルーティン）が完全に削除されます。よろしいですか？')) return;
        try {
            const db = await fetchDb();
            await db.execute('DELETE FROM routine_completions');
            await db.execute('DELETE FROM routine_tags');
            await db.execute('DELETE FROM routines');
            await db.execute('DELETE FROM task_tags');
            await db.execute('DELETE FROM tasks');
            flash('ok', 'すべてのデータを削除しました');
        } catch (e) { console.error(e); flash('err', '削除に失敗しました'); }
    };

    return (
        <>
            <h3 className="s-heading">データ管理</h3>

            <div className="dm-section">
                <div className="dm-card">
                    <div className="dm-card-info">
                        <span className="dm-icon"><HardDriveDownload size={18} /></span>
                        <div>
                            <strong>データベースバックアップ</strong>
                            <p className="dm-desc">データベース全体を指定の場所にバックアップファイルとして保存します</p>
                        </div>
                    </div>
                    <button className="s-btn-primary" onClick={handleBackup}>バックアップ</button>
                </div>

                <div className="dm-card">
                    <div className="dm-card-info">
                        <span className="dm-icon"><HardDriveUpload size={18} /></span>
                        <div>
                            <strong>データベース復元</strong>
                            <p className="dm-desc">バックアップファイルからデータを復元します（現在のデータは自動バックアップされます）</p>
                        </div>
                    </div>
                    <button className="s-btn-primary" onClick={handleRestore}>復元</button>
                </div>

                <div className="dm-divider" />

                <div className="dm-card">
                    <div className="dm-card-info">
                        <span className="dm-icon">📤</span>
                        <div>
                            <strong>CSVエクスポート</strong>
                            <p className="dm-desc">すべてのタスクをCSVファイルとしてダウンロードします（アーカイブ済みを含む全フィールド）</p>
                        </div>
                    </div>
                    <button className="s-btn-primary" onClick={handleExport}>ダウンロード</button>
                </div>

                <div className="dm-card">
                    <div className="dm-card-info">
                        <span className="dm-icon">📥</span>
                        <div>
                            <strong>CSVインポート</strong>
                            <p className="dm-desc">CSVファイルからタスクを一括登録します（title列必須、エクスポートCSVのラウンドトリップ対応）</p>
                        </div>
                    </div>
                    <label className="s-btn-primary dm-file-label">
                        ファイルを選択
                        <input type="file" accept=".csv" hidden onChange={handleImport} />
                    </label>
                </div>

                <div className="dm-divider" />

                <div className="dm-card dm-danger">
                    <div className="dm-card-info">
                        <span className="dm-icon"><AlertTriangle size={18} /></span>
                        <div>
                            <strong>全データ削除</strong>
                            <p className="dm-desc">すべてのタスクおよびルーティンを完全に削除します。この操作は元に戻せません。</p>
                        </div>
                    </div>
                    <button className="s-btn-danger" onClick={handleDeleteAll}>全削除</button>
                </div>
            </div>
        </>
    );
}
