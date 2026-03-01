'use client';

import { fetchDb } from '@/lib/utils';

export default function DataPanel({ flash }) {

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
                        <span className="dm-icon">⚠️</span>
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
