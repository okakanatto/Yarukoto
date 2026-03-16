'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchDb } from '@/lib/utils';
import { BarChart3, Sun, CircleCheckBig, ListTodo, Repeat, Settings, ChevronDown } from 'lucide-react';

const ICON_SIZE = 17;
const ICON_STROKE = 1.75;

const navItems = [
    { href: '/dashboard', label: 'ダッシュボード', icon: <BarChart3 size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
    { href: '/today', label: '今日やるタスク', icon: <Sun size={ICON_SIZE} strokeWidth={ICON_STROKE} />, showProgress: true },
    { href: '/done', label: 'やったタスク', icon: <CircleCheckBig size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
    { href: '/tasks', label: 'タスク一覧', icon: <ListTodo size={ICON_SIZE} strokeWidth={ICON_STROKE} />, hasProjects: true },
    { href: '/routines', label: 'ルーティン', icon: <Repeat size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
];

export default function Sidebar({ mounted }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [todayProgress, setTodayProgress] = useState({ total: 0, completed: 0 });
    const [projects, setProjects] = useState([]);
    const [projectsOpen, setProjectsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Fetch projects
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

    // Fetch today progress
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
        } catch (e) { console.error("Tauri nav progress error:", e); }
    }, [mounted]);

    useEffect(() => {
        if (!mounted) return;
        fetchTodayProgress();
        const interval = setInterval(fetchTodayProgress, 30000);
        return () => clearInterval(interval);
    }, [mounted, fetchTodayProgress, pathname]);

    // Close projects dropdown on outside click
    useEffect(() => {
        if (!projectsOpen) return;
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setProjectsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [projectsOpen]);

    // Close dropdown on navigation
    useEffect(() => {
        setProjectsOpen(false);
    }, [pathname, searchParams]);

    return (
        <nav className="topnav" suppressHydrationWarning>
            <div className="topnav-brand" suppressHydrationWarning>
                <span className="topnav-logo" suppressHydrationWarning>Yarukoto</span>
            </div>

            <div className="topnav-items" suppressHydrationWarning>
                {navItems.map(item => {
                    const isTasksItem = item.hasProjects;
                    const isActive = pathname === item.href || (isTasksItem && pathname === '/projects');
                    const showProjectsTrigger = isTasksItem && mounted && projects.length > 0;

                    return (
                        <div
                            key={item.href}
                            className="topnav-item-group"
                            ref={isTasksItem ? dropdownRef : null}
                            suppressHydrationWarning
                        >
                            <Link
                                href={item.href}
                                className={`topnav-item ${isActive ? 'active' : ''}`}
                                suppressHydrationWarning
                            >
                                <span className="topnav-icon" suppressHydrationWarning>{item.icon}</span>
                                <span className="topnav-label" suppressHydrationWarning>{item.label}</span>
                                {item.showProgress && mounted && todayProgress.total > 0 && (
                                    <span className="topnav-badge" suppressHydrationWarning>
                                        {todayProgress.completed}/{todayProgress.total}
                                    </span>
                                )}
                            </Link>

                            {showProjectsTrigger && (
                                <button
                                    className="topnav-dropdown-trigger"
                                    onClick={() => setProjectsOpen(!projectsOpen)}
                                    suppressHydrationWarning
                                >
                                    <ChevronDown size={12} style={{
                                        transform: projectsOpen ? 'rotate(180deg)' : 'none',
                                        transition: 'transform 150ms'
                                    }} />
                                </button>
                            )}

                            {isTasksItem && projectsOpen && projects.length > 0 && (
                                <div className="topnav-dropdown" suppressHydrationWarning>
                                    {projects.map(p => (
                                        <Link
                                            key={p.id}
                                            href={`/projects?id=${p.id}`}
                                            className={`topnav-dropdown-item ${pathname === '/projects' && searchParams.get('id') === String(p.id) ? 'active' : ''}`}
                                            onClick={() => setProjectsOpen(false)}
                                            suppressHydrationWarning
                                        >
                                            <span
                                                className="topnav-project-dot"
                                                style={{ backgroundColor: p.color }}
                                                suppressHydrationWarning
                                            />
                                            {p.name}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="topnav-right" suppressHydrationWarning>
                <Link
                    href="/settings"
                    className={`topnav-item topnav-settings ${pathname === '/settings' ? 'active' : ''}`}
                    suppressHydrationWarning
                >
                    <Settings size={ICON_SIZE} strokeWidth={ICON_STROKE} />
                </Link>
            </div>
        </nav>
    );
}
