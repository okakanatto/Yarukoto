'use client';

import { fetchDb } from '@/lib/utils';

export default function OptionsPanel({ appSettings, setAppSettings, flash }) {

    const toggleSetting = async (key) => {
        const current = appSettings[key] || '0';
        const next = current === '1' ? '0' : '1';
        setAppSettings(prev => ({ ...prev, [key]: next }));
        try {
            const db = await fetchDb();
            await db.execute(
                'INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)',
                [key, next]
            );
        } catch (e) {
            console.error(e);
            setAppSettings(prev => ({ ...prev, [key]: current }));
            flash('err', '設定の保存に失敗しました');
        }
    };

    return (
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
                                    const db = await fetchDb();
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
    );
}
