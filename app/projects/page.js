'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import TaskInput from '@/components/TaskInput';
import TaskList from '@/components/TaskList';
import { fetchDb } from '@/lib/utils';

export default function ProjectPage() {
    const searchParams = useSearchParams();
    const projectId = parseInt(searchParams.get('id')) || null;
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!projectId) { setLoading(false); return; }
        (async () => {
            try {
                const db = await fetchDb();
                const rows = await db.select('SELECT * FROM projects WHERE id = $1', [projectId]);
                setProject(rows[0] || null);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        })();
    }, [projectId]);

    // Refresh task list when a task is added from the global FAB
    useEffect(() => {
        const handleTaskAdded = () => setRefreshKey(k => k + 1);
        window.addEventListener('yarukoto:taskAdded', handleTaskAdded);
        return () => window.removeEventListener('yarukoto:taskAdded', handleTaskAdded);
    }, []);

    if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}><span className="spinner" /> 読み込み中...</div>;
    if (!projectId || !project) return <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>プロジェクトが見つかりません</div>;

    return (
        <div className="page-container">
            <div className="project-header">
                <span className="project-header-dot" style={{ backgroundColor: project.color }} />
                <h2 className="page-title">{project.name}</h2>
            </div>
            <TaskInput onTaskAdded={() => setRefreshKey(k => k + 1)} defaultProjectId={projectId} />
            <div style={{ marginTop: '1.5rem' }}>
                <TaskList key={`${projectId}-${refreshKey}`} projectId={projectId} />
            </div>

            <style jsx>{`
                .page-container {
                    max-width: 900px;
                    animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .project-header {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .project-header-dot {
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .project-header .page-title {
                    margin-bottom: 0;
                }
            `}</style>
        </div>
    );
}
