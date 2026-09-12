'use client';

import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/hooks/useWorkspace';
import WorkSignals from './WorkSignals';

export default function GlobalWorkSignals() {
    const { tasks, projects, error, reload } = useWorkspace();
    const router = useRouter();
    return <div className="global-work-signals">
        {error ? <p role="alert" className="work-error">期限と待ち状況を確認できませんでした。<button onClick={reload}>再読み込み</button></p> : <WorkSignals tasks={tasks} projects={projects} onOpenTask={id => window.dispatchEvent(new CustomEvent('yarukoto:openTask', { detail: { id } }))} onOpenProject={id => router.push(`/projects?id=${id}`)} />}
    </div>;
}
