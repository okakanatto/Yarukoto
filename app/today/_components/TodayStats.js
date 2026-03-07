'use client';

import { formatMin } from '@/lib/utils';

/**
 * Progress ring + task count summary for the today page.
 */
export default function TodayStats({ stats }) {
    return (
        <div className="today-stats">
            <div className="stat-ring-area">
                <svg viewBox="0 0 120 120" className="stat-ring">
                    <circle cx="60" cy="60" r="50" className="ring-bg" />
                    <circle cx="60" cy="60" r="50" className="ring-fill"
                        style={{
                            strokeDasharray: `${stats.pct * 3.14} 314`,
                            stroke: stats.pct === 100 ? 'var(--color-success)' : 'var(--color-primary)'
                        }}
                    />
                </svg>
                <div className="ring-label">
                    <span className="ring-pct">{stats.pct}%</span>
                    <span className="ring-sub">完了</span>
                </div>
            </div>
            <div className="stat-details">
                <div className="stat-row">
                    <span className="stat-icon">📋</span>
                    <span className="stat-text">全 <strong>{stats.total}</strong> 件</span>
                </div>
                <div className="stat-row">
                    <span className="stat-icon">✅</span>
                    <span className="stat-text">完了 <strong>{stats.completed}</strong> 件</span>
                </div>
                <div className="stat-row">
                    <span className="stat-icon">⏳</span>
                    <span className="stat-text">残り <strong>{stats.remaining}</strong> 件</span>
                </div>
                {stats.remainingMin > 0 && (
                    <div className="stat-row">
                        <span className="stat-icon">⏱</span>
                        <span className="stat-text">残り想定 <strong>{formatMin(stats.remainingMin)}</strong></span>
                    </div>
                )}
            </div>

            <style jsx global>{`
        .today-stats {
          display: flex; align-items: center; gap: 2rem;
          background: var(--color-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-lg); padding: 1.5rem 2rem;
          box-shadow: var(--shadow-md); margin-bottom: 1.5rem;
        }
        .stat-ring-area { position: relative; width: 100px; height: 100px; flex-shrink: 0; }
        .stat-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ring-bg { fill: none; stroke: var(--color-surface-hover); stroke-width: 8; }
        .ring-fill { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
        .ring-label {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .ring-pct { font-size: 1.5rem; font-weight: 800; color: var(--color-text); line-height: 1; }
        .ring-sub { font-size: 0.7rem; color: var(--color-text-muted); font-weight: 500; }

        .stat-details { display: flex; flex-direction: column; gap: 0.5rem; }
        .stat-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; color: var(--color-text-secondary); }
        .stat-icon { font-size: 0.85rem; }
      `}</style>
        </div>
    );
}
