'use client';

import { DM_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, Suspense } from 'react';
import TaskInput from '@/components/TaskInput';
import Sidebar from '@/components/Sidebar';
import { fetchDb } from '@/lib/utils';
import { Plus, X, CircleCheck, XCircle } from 'lucide-react';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans-loaded' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-heading-loaded' });

export default function RootLayout({ children }) {
    return (
        <html lang="ja" suppressHydrationWarning>
            <body className={`${dmSans.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
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
    const [fabOpen, setFabOpen] = useState(false);
    const [toast, setToast] = useState(null); // { message, type }
    const [dbError, setDbError] = useState(null);
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

    // Listen for FAB open request (from Basecamp strip etc.)
    useEffect(() => {
        if (!mounted) return;
        const handler = () => setFabOpen(true);
        window.addEventListener('yarukoto:openFab', handler);
        return () => window.removeEventListener('yarukoto:openFab', handler);
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

    return (
        <>
            <div className="layout-container" suppressHydrationWarning>
                <Sidebar mounted={mounted} />
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
                                    defaultProjectId={pathname === '/projects' ? (parseInt(searchParams.get('id')) || null) : null}
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
                    {toast.type === 'error' ? <XCircle size={16} /> : <CircleCheck size={16} />} {toast.message}
                </div>
            )}

            <style jsx global>{`
                    .fab {
                        position: fixed;
                        bottom: 20px;
                        right: 28px;
                        width: 44px;
                        height: 44px;
                        border-radius: var(--radius-pill);
                        border: none;
                        background: var(--color-accent);
                        color: #fff;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: background 120ms var(--ease-out), box-shadow 120ms var(--ease-out);
                        z-index: 1000;
                        box-shadow: var(--shadow-card);
                    }
                    .fab:hover {
                        background: var(--color-accent-hover);
                        box-shadow: var(--shadow-card-hover);
                    }
                    .fab:active { opacity: 0.85; }
                    .fab.fab-open {
                        background: var(--color-text-muted);
                    }
                    .fab-icon {
                        line-height: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .fab-backdrop {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.2);
                        z-index: 999;
                        animation: fabBdIn 0.15s var(--ease-out);
                    }
                    @keyframes fabBdIn {
                        from { opacity: 0; }
                        to   { opacity: 1; }
                    }

                    .fab-modal {
                        position: fixed;
                        bottom: calc(20px + 44px + 8px);
                        right: 28px;
                        width: min(480px, calc(100vw - 48px));
                        max-height: calc(100vh - 20px - 44px - 8px - 16px);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                        background: var(--color-surface);
                        border: 1px solid var(--border-color);
                        border-radius: var(--radius-lg);
                        box-shadow: var(--shadow-lg);
                        z-index: 1001;
                        animation: fabModalIn 0.15s var(--ease-out);
                        transform-origin: bottom right;
                    }
                    @keyframes fabModalIn {
                        from { opacity: 0; transform: translateY(8px); }
                        to   { opacity: 1; transform: translateY(0); }
                    }

                    .fab-modal-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 10px 16px 8px;
                        border-bottom: 1px solid var(--border-color);
                    }
                    .fab-modal-title {
                        font-size: 0.82rem;
                        font-weight: 600;
                        color: var(--color-text-secondary);
                    }
                    .fab-modal-close {
                        background: transparent;
                        border: none;
                        color: var(--color-text-muted);
                        cursor: pointer;
                        width: 24px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: var(--radius-sm);
                        transition: color 120ms var(--ease-out);
                    }
                    .fab-modal-close:hover {
                        color: var(--color-text);
                    }

                    .fab-modal .task-input-wrapper {
                        border: none;
                        border-radius: 0 0 var(--radius-lg) var(--radius-lg);
                        box-shadow: none;
                        padding: 12px 16px 16px;
                        background: transparent;
                        overflow-y: auto;
                        flex: 1;
                        min-height: 0;
                    }
                    .fab-modal .task-input-wrapper.expanded {
                        box-shadow: none;
                        border: none;
                    }
                    .fab-modal .btn-add.expanded {
                        display: none;
                    }

                    .global-toast {
                        position: fixed;
                        bottom: calc(20px + 44px + 8px);
                        right: 28px;
                        padding: 8px 16px;
                        border-radius: var(--radius-md);
                        font-size: 0.82rem;
                        font-weight: 500;
                        z-index: 10000;
                        animation: gtIn 0.2s var(--ease-out);
                        white-space: nowrap;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .toast-ok  { background: var(--toast-success-bg); border: 1px solid var(--toast-success-border); color: var(--toast-success-text); }
                    .toast-err { background: var(--toast-error-bg); border: 1px solid var(--toast-error-border); color: var(--toast-error-text); }
                    @keyframes gtIn {
                        from { opacity: 0; transform: translateY(8px); }
                        to   { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
        </>
    );
}
