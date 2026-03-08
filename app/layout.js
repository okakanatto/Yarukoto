'use client';

import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import TaskInput from '@/components/TaskInput';
import { fetchDb } from '@/lib/utils';
import { BarChart3, Sun, CircleCheckBig, ListTodo, Repeat, Settings, Plus, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-heading' });

export default function RootLayout({ children }) {
    return (
        <html lang="ja" suppressHydrationWarning>
            <body className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
                <Suspense fallback={null}>
                    <LayoutInner>{children}</LayoutInner>
                </Suspense>
            </body>
        </html>
    );
}

function LayoutInner({ children }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [mounted, setMounted] = useState(false);
    const [todayProgress, setTodayProgress] = useState({ total: 0, completed: 0 });
    const [fabOpen, setFabOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [toast, setToast] = useState(null); // { message, type }
    const [dbError, setDbError] = useState(null);
    const [projects, setProjects] = useState([]);
    const [projectsExpanded, setProjectsExpanded] = useState(true);
    const [themeMode, setThemeMode] = useState('light');
    const [themeAccent, setThemeAccent] = useState('coral');
    const modalRef = useRef(null);

    useEffect(() => {
        // Prevent hydration mismatch and avoid synchronous update warnings
        setTimeout(() => {
            setMounted(true);
            if (typeof document !== 'undefined') {
                document.title = 'Yarukoto';
            }
        }, 0);
    }, []);

    // Load theme settings from DB on mount
    useEffect(() => {
        if (!mounted) return;
        (async () => {
            try {
                const db = await fetchDb();
                const rows = await db.select("SELECT key, value FROM app_settings WHERE key IN ('theme_mode', 'theme_accent')");
                for (const row of rows) {
                    if (row.key === 'theme_mode') setThemeMode(row.value || 'light');
                    if (row.key === 'theme_accent') setThemeAccent(row.value || 'coral');
                }
            } catch (e) { console.error('Failed to load theme settings:', e); }
        })();
    }, [mounted]);

    // Apply theme attributes to <html>
    useEffect(() => {
        if (typeof document === 'undefined') return;
        document.documentElement.setAttribute('data-theme', themeMode);
        document.documentElement.setAttribute('data-accent', themeAccent);
    }, [themeMode, themeAccent]);

    // Listen for theme changes from settings page
    useEffect(() => {
        if (!mounted) return;
        const handler = (e) => {
            if (e.detail?.theme_mode !== undefined) setThemeMode(e.detail.theme_mode);
            if (e.detail?.theme_accent !== undefined) setThemeAccent(e.detail.theme_accent);
        };
        window.addEventListener('yarukoto:themeChanged', handler);
        return () => window.removeEventListener('yarukoto:themeChanged', handler);
    }, [mounted]);

    // Global DB Error Listener (Triggers error.js)
    useEffect(() => {
        if (!mounted) return;
        const hd = (e) => setDbError(e.detail || new Error('Database initialization failed'));
        window.addEventListener('yarukoto:dberror', hd);
        return () => window.removeEventListener('yarukoto:dberror', hd);
    }, [mounted]);

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

    if (dbError) throw dbError; // Throws during render so Next.js error.js catches it

    // Global Toast Listener
    useEffect(() => {
        if (!mounted) return;
        const handleToast = (e) => {
            if (e.detail) {
                setToast(e.detail);
                setTimeout(() => setToast(null), 3000);
            }
        };
        window.addEventListener('yarukoto:toast', handleToast);
        return () => window.removeEventListener('yarukoto:toast', handleToast);
    }, [mounted]);

    // Close FAB modal on Escape key
    useEffect(() => {
        if (!fabOpen) return;
        const handler = (e) => { if (e.key === 'Escape') setFabOpen(false); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [fabOpen]);

    // Close FAB modal when navigating
    useEffect(() => {
        const timer = setTimeout(() => setFabOpen(prev => prev ? false : prev), 0);
        return () => clearTimeout(timer);
    }, [pathname]);

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

    return (
        <>
            <div className="layout-container" suppressHydrationWarning>
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
                <main className="content" suppressHydrationWarning>
                    {mounted && children}
                </main>
            </div>

            {/* Floating Action Button */}
            {mounted && (
                <>
                    <button
                        className={`fab ${fabOpen ? 'fab-open' : ''}`}
                        onClick={() => setFabOpen(v => !v)}
                        title="新しいタスクを追加"
                        aria-label="新しいタスクを追加"
                    >
                        <span className="fab-icon">
                            {fabOpen
                                ? <X size={22} strokeWidth={2} />
                                : <Plus size={26} strokeWidth={2.5} />
                            }
                        </span>
                    </button>

                    {fabOpen && (
                        <>
                            <div className="fab-backdrop" onClick={() => setFabOpen(false)} />
                            <div className="fab-modal" ref={modalRef}>
                                <div className="fab-modal-header">
                                    <span className="fab-modal-title">新しいタスク</span>
                                    <button className="fab-modal-close" onClick={() => setFabOpen(false)}>
                                        <X size={14} strokeWidth={2} />
                                    </button>
                                </div>
                                <TaskInput
                                    autoFocus
                                    onTaskAdded={() => {
                                        // IMP-24: Don't close modal — allow continuous input
                                        // TaskInput internally resets the form and re-focuses the title input
                                        window.dispatchEvent(new CustomEvent('yarukoto:taskAdded'));
                                    }}
                                />
                            </div>
                        </>
                    )}
                </>
            )}

            {/* Global Toast */}
            {toast && (
                <div className={`global-toast ${toast.type === 'error' ? 'toast-err' : 'toast-ok'}`}>
                    {toast.type === 'error' ? '❌' : '✅'} {toast.message}
                </div>
            )}

            <style jsx global>{`
                    .fab {
                        position: fixed;
                        bottom: 1.75rem;
                        right: 1.75rem;
                        width: 52px;
                        height: 52px;
                        border-radius: 50%;
                        border: none;
                        background: var(--color-accent);
                        color: #fff;
                        font-size: 1.6rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 20px color-mix(in srgb, var(--color-accent) 40%, transparent);
                        transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                        z-index: 1000;
                    }
                    .fab:hover {
                        transform: scale(1.1);
                        box-shadow: 0 6px 28px color-mix(in srgb, var(--color-accent) 50%, transparent);
                    }
                    .fab:active { transform: scale(0.95); }
                    .fab.fab-open {
                        background: var(--color-text-secondary);
                        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
                        transform: rotate(90deg);
                    }
                    .fab-icon {
                        line-height: 1;
                        font-weight: 300;
                        transition: transform 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .fab-backdrop {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.25);
                        backdrop-filter: blur(2px);
                        z-index: 999;
                        animation: fabBdIn 0.2s ease;
                    }
                    @keyframes fabBdIn {
                        from { opacity: 0; }
                        to   { opacity: 1; }
                    }

                    .fab-modal {
                        position: fixed;
                        bottom: calc(1.75rem + 52px + 0.75rem);
                        right: 1.75rem;
                        width: min(520px, calc(100vw - 3.5rem));
                        max-height: calc(100vh - 1.75rem - 52px - 0.75rem - 1rem);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        background: var(--color-surface);
                        border: 1px solid var(--border-color);
                        border-radius: var(--radius-xl);
                        box-shadow: var(--shadow-lg);
                        z-index: 1001;
                        animation: fabModalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                        transform-origin: bottom right;
                    }
                    @keyframes fabModalIn {
                        from { opacity: 0; transform: scale(0.9) translateY(12px); }
                        to   { opacity: 1; transform: scale(1) translateY(0); }
                    }

                    .fab-modal-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 0.9rem 1.25rem 0.5rem;
                        border-bottom: 1px solid var(--border-color);
                    }
                    .fab-modal-title {
                        font-size: 0.88rem;
                        font-weight: 700;
                        color: var(--color-text-secondary);
                        letter-spacing: 0.02em;
                    }
                    .fab-modal-close {
                        background: transparent;
                        border: none;
                        color: var(--color-text-disabled);
                        cursor: pointer;
                        font-size: 0.8rem;
                        width: 26px;
                        height: 26px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: var(--radius-sm);
                        transition: all 0.15s;
                    }
                    .fab-modal-close:hover {
                        background: var(--color-surface-hover);
                        color: var(--color-text);
                    }

                    /* TaskInput inside FAB modal: strip outer padding to fit cleanly */
                    .fab-modal .task-input-wrapper {
                        border: none;
                        border-radius: 0 0 var(--radius-xl) var(--radius-xl);
                        box-shadow: none;
                        padding: 1rem 1.25rem 1.25rem;
                        background: transparent;
                        overflow-y: auto;
                        flex: 1;
                        min-height: 0;
                    }
                    .fab-modal .task-input-wrapper.expanded {
                        box-shadow: none;
                        border: none;
                    }

                    .global-toast {
                        position: fixed;
                        bottom: calc(1.75rem + 52px + 0.75rem);
                        right: 1.75rem;
                        padding: 0.75rem 1.25rem;
                        border-radius: var(--radius-md);
                        font-size: 0.85rem;
                        font-weight: 500;
                        z-index: 10000;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.1);
                        animation: gtIn 0.3s cubic-bezier(0.16,1,0.3,1);
                        white-space: nowrap;
                    }
                    .toast-ok  { background: var(--toast-success-bg); border: 1px solid var(--toast-success-border); color: var(--toast-success-text); }
                    .toast-err { background: var(--toast-error-bg); border: 1px solid var(--toast-error-border); color: var(--toast-error-text); }
                    @keyframes gtIn {
                        from { opacity: 0; transform: translateY(16px); }
                        to   { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
        </>
    );
}
