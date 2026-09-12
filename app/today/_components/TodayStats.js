'use client';

import { formatMin } from '@/lib/utils';
import { Clock } from 'lucide-react';

export default function TodayStats({ stats }) {
    return <div className="today-stats" aria-label="この日のタスク件数">
        <span>全 <strong>{stats.total}</strong> 件</span>
        <span>完了 <strong>{stats.completed}</strong></span>
        <span>未完了 <strong>{stats.remaining}</strong></span>
        {stats.remainingMin > 0 && <span className="today-stats-estimate"><Clock size={13} />残り見積 <strong>{formatMin(stats.remainingMin)}</strong></span>}
        <style jsx>{`
            .today-stats { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-bottom: 20px; padding: 6px 0; color: var(--color-text-muted); font-size: 0.78rem; }
            .today-stats strong { color: var(--color-text-secondary); font-weight: 550; }
            .today-stats-estimate { display: inline-flex; align-items: center; gap: 5px; }
        `}</style>
    </div>;
}
