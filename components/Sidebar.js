'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { fetchDb } from '@/lib/utils';
import { BarChart3, Sun, CircleCheckBig, ListTodo, Repeat, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const ICON_SIZE = 20;
const ICON_STROKE = 1.75;

const navItemsTop = [
    { href: '/dashboard', label: 'ダッシュボード', icon: <BarChart3 size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
    { href: '/today', label: '今日やるタスク', icon: <Sun size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
    { href: '/done', label: 'やったタスク', icon: <CircleCheckBig size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
    { href: '/tasks', label: 'タスク一覧', icon: <ListTodo size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
];
const navItemsBottom = [
    { href: '/routines', label: 'ルーティン', icon: <Repeat size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
    { href: '/settings', label: '設定', icon: <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
];

export default function Sidebar({ mounted }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [todayProgress, setTodayProgress] = useState({ total: 0, completed: 0 });
    const [projects, setProjects] = useState([]);
    const [projectsExpanded, setProjectsExpanded] = useState(true);

    // Fetch projects for sidebar
    const fetchProjects = useCallback(async () => {
        if (!mounted) return;
        try {
            const db = await fetchDb();
            const rows = await db.select('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY sort_order, id');
            setProjects(rows);
        } catch (e) { console.error('Failed to fetch projects:', e); }
    }, [mounted]);

    useEffect(() => {
        if (!mounted) return;
        fetchProjects();
        const handleProjectsChanged = () => fetchProjects();
        window.addEventListener('yarukoto:projectsChanged', handleProjectsChanged);
        window.addEventListener('yarukoto:taskAdded', handleProjectsChanged);
        return () => {
            window.removeEventListener('yarukoto:projectsChanged', handleProjectsChanged);
            window.removeEventListener('yarukoto:taskAdded', handleProjectsChanged);
        };
    }, [mounted, fetchProjects]);

    const fetchTodayProgress = useCallback(async () => {
        if (!mounted) return;
        try {
            const db = await fetchDb();
            const date = new Date().toLocaleDateString('sv-SE');

            const tasksRes = await db.select(`
                SELECT status_code FROM tasks
                WHERE status_code != 5 AND archived_at IS NULL AND (
                    today_date = $1
                    OR due_date = $2
                    OR (due_date < $3 AND status_code != 3)
                    OR (status_code = 3 AND date(completed_at) = $4)
                )
            `, [date, date, date, date]);

            const dObj = new Date(date + 'T00:00:00');
            const dayOfWeek = dObj.getDay();
            const dayOfMonth = dObj.getDate();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            const routinesRes = await db.select(`
              SELECT r.id, r.frequency, r.weekdays_only, rc.completion_date
              FROM routines r
              LEFT JOIN routine_completions rc ON r.id = rc.routine_id AND rc.completion_date = $1
              WHERE r.enabled = 1
                AND (r.end_date IS NULL OR r.end_date >= $2)
                AND (
                  r.frequency = 'daily'
                  OR (r.frequency = 'weekly' AND r.days_of_week LIKE $3)
                  OR (r.frequency = 'monthly' AND r.day_of_month = $4)
                )
            `, [date, date, `%${dayOfWeek}%`, dayOfMonth]);

            let total = 0;
            let completed = 0;

            tasksRes.forEach(t => {
                total++;
                if (t.status_code === 3) completed++;
            });

            routinesRes.forEach(r => {
                if (r.frequency === 'daily' && r.weekdays_only === 1 && isWeekend) return;
                total++;
                if (r.completion_date) completed++;
            });

            setTodayProgress({ total, completed });
        } catch (e) { console.error("Tauri sidebar progress error:", e); }
    }, [mounted]);

    useEffect(() => {
        if (!mounted) return;
        fetchTodayProgress();
        const interval = setInterval(fetchTodayProgress, 30000);
        return () => clearInterval(interval);
    }, [mounted, fetchTodayProgress, pathname]);

    return (
        <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} suppressHydrationWarning>
            <div className="sidebar-header" suppressHydrationWarning>
                <div className="logo" suppressHydrationWarning>
                    <h1 suppressHydrationWarning>
                        {isCollapsed ? 'Y' : 'Yarukoto'}
                    </h1>
                </div>
                <button
                    className="sidebar-toggle"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    title={isCollapsed ? "サイドバーを開く" : "サイドバーをたたむ"}
                    suppressHydrationWarning
                >
                    {isCollapsed
                        ? <PanelLeftOpen size={18} strokeWidth={ICON_STROKE} />
                        : <PanelLeftClose size={18} strokeWidth={ICON_STROKE} />
                    }
                </button>
            </div>
            <ul className="nav-links" suppressHydrationWarning>
                {navItemsTop.map(item => {
                    const isTasksItem = item.href === '/tasks';
                    const showProjects = isTasksItem && mounted && projects.length > 0 && !isCollapsed;
                    const isTasksActive = pathname === item.href || (isTasksItem && pathname === '/projects');
                    return (
                        <li key={item.href} suppressHydrationWarning>
                            <div className="nav-link-row" suppressHydrationWarning>
                                <Link href={item.href} className={isTasksActive ? 'active' : ''} suppressHydrationWarning>
                                    <span className="nav-icon" suppressHydrationWarning>{item.icon}</span>
                                    <span className="nav-label" suppressHydrationWarning>{item.label}</span>
                                </Link>
                                {showProjects && (
                                    <button
                                        className="sidebar-projects-toggle"
                                        onClick={() => setProjectsExpanded(!projectsExpanded)}
                                        suppressHydrationWarning
                                    >
                                        <span className={`sidebar-projects-chev ${projectsExpanded ? 'open' : ''}`}>›</span>
                                    </button>
                                )}
                            </div>
                            {showProjects && projectsExpanded && (
                                <ul className="sidebar-projects-list" suppressHydrationWarning>
                                    {projects.map(p => (
                                        <li key={p.id} suppressHydrationWarning>
                                            <Link
                                                href={`/projects?id=${p.id}`}
                                                className={pathname === '/projects' && searchParams.get('id') === String(p.id) ? 'active' : ''}
                                                suppressHydrationWarning
                                            >
                                                <span className="sidebar-project-dot" style={{ backgroundColor: p.color }} suppressHydrationWarning />
                                                <span className="nav-label" suppressHydrationWarning>{p.name}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
                {navItemsBottom.map(item => (
                    <li key={item.href} suppressHydrationWarning>
                        <Link href={item.href} className={pathname === item.href ? 'active' : ''} suppressHydrationWarning>
                            <span className="nav-icon" suppressHydrationWarning>{item.icon}</span>
                            <span className="nav-label" suppressHydrationWarning>{item.label}</span>
                        </Link>
                    </li>
                ))}
            </ul>
            {mounted && todayProgress.total > 0 && (
                <div className="sidebar-progress" suppressHydrationWarning>
                    <div className="sidebar-progress-label" suppressHydrationWarning>
                        <span>今日 {todayProgress.completed}/{todayProgress.total}</span>
                        <span>{todayProgress.total > 0 ? Math.round((todayProgress.completed / todayProgress.total) * 100) : 0}%</span>
                    </div>
                    <div className="sidebar-progress-track" suppressHydrationWarning>
                        <div
                            className="sidebar-progress-fill"
                            style={{
                                width: `${todayProgress.total > 0 ? (todayProgress.completed / todayProgress.total) * 100 : 0}%`,
                                background: todayProgress.completed === todayProgress.total ? 'var(--color-success)' : 'var(--color-accent)'
                            }}
                            suppressHydrationWarning
                        />
                    </div>
                </div>
            )}
        </nav>
    );
}
