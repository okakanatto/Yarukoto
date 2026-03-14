'use client';

import { fetchDb } from '@/lib/utils';
import { AlertTriangle, HardDriveDownload, HardDriveUpload } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { copyFile, exists, remove } from '@tauri-apps/plugin-fs';
import { join, appDataDir } from '@tauri-apps/api/path';
import { relaunch } from '@tauri-apps/plugin-process';

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
                       im.label as importance_label, um.label as urgency_label, sm.label as status_label
                FROM tasks t
                LEFT JOIN importance_master im ON t.importance_level = im.level
                LEFT JOIN urgency_master um ON t.urgency_level = um.level
                LEFT JOIN status_master sm ON t.status_code = sm.code
                WHERE t.archived_at IS NULL
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
    };

    const handleImport = async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const lines = text.replace(/^\uFEFF/, '').split('\n').filter(l => l.trim());
            if (lines.length < 2) { flash('err', 'CSVにデータ行がありません'); ev.target.value = ''; return; }
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"(.*)"$/, '$1'));
            const titleIdx = headers.indexOf('title');
            if (titleIdx === -1) { flash('err', 'title列が見つかりません'); ev.target.value = ''; return; }
            const db = await fetchDb();
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
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
                            <p className="dm-desc">アクティブなタスクをCSVファイルとしてダウンロードします（アーカイブ済みは除外）</p>
                        </div>
                    </div>
                    <button className="s-btn-primary" onClick={handleExport}>ダウンロード</button>
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
