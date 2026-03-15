'use client';

import { useState, useEffect } from 'react';
import { loadDashboard } from './_lib/loadDashboard';
import SummarySection from './_components/DashboardSummary';
import FootprintMap from './_components/FootprintMap';
import RhythmSection from './_components/RhythmSection';
import BasecampStrip from './_components/BasecampStrip';

const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export default function DashboardPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboard().then(setData).catch(err => {
            console.error('Dashboard load error', err);
            window.dispatchEvent(new CustomEvent('yarukoto:toast', {
                detail: { message: 'ダッシュボードの読み込みに失敗しました', type: 'error' }
            }));
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ maxWidth: 960, animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <h2 className="page-title">ダッシュボード</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '3rem', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                <span className="spinner" /> 読み込み中...
            </div>
        </div>
    );

    if (!data) return null;

    const now = new Date();
    const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${WEEKDAY_NAMES[now.getDay()]}）`;

    return (
        <div className="db-root">
            <h2 className="page-title">ダッシュボード</h2>
            <p className="db-date">{dateLabel}</p>

            <SummarySection data={data} />
            <div className="db-lower-grid">
                <RhythmSection rhythm={data.rhythm} />
                <FootprintMap heatmap={data.heatmap} />
            </div>
            <BasecampStrip task={data.basecampTask} />

            <style jsx>{`
                .db-root { max-width: 960px; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
                .db-date { color: var(--color-text-muted); font-size: 0.82rem; margin-top: -1.25rem; margin-bottom: 1.5rem; }
                .db-lower-grid {
                    display: grid; grid-template-columns: 260px 1fr;
                    gap: 1rem; margin-top: 1rem;
                }
                @media (max-width: 700px) {
                    .db-lower-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}
