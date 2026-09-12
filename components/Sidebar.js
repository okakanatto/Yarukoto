'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Compass, Sun, ListTodo, FolderOpen, Repeat, CircleCheckBig, BarChart3, Settings, Plus } from 'lucide-react';
import { fetchDb } from '@/lib/utils';

const items = [
    ['/work', 'いまの仕事', Compass], ['/today', '今日', Sun], ['/tasks', 'すべてのタスク', ListTodo],
    ['/projects', 'プロジェクト', FolderOpen], ['/routines', 'ルーティン', Repeat],
    ['/done', 'やったタスク', CircleCheckBig], ['/dashboard', '振り返り', BarChart3],
];
export default function Sidebar({ mounted }) {
    const pathname = usePathname();
    const params = useSearchParams();
    const [projects, setProjects] = useState([]);
    useEffect(() => {
        if (!mounted) return;
        let active = true, request = 0;
        const reload = async () => {
            if (!active) return;
            const id = ++request;
            try {
                const db = await fetchDb();
                const rows = await db.select('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY sort_order, id');
                if (active && id === request) setProjects(rows);
            } catch (error) { console.error('Failed to load projects', error); }
        };
        Promise.resolve().then(reload);
        window.addEventListener('yarukoto:projectsChanged', reload);
        window.addEventListener('yarukoto:tasksChanged', reload);
        return () => { active = false; window.removeEventListener('yarukoto:projectsChanged', reload); window.removeEventListener('yarukoto:tasksChanged', reload); };
    }, [mounted]);
    return <aside className="work-nav">
        <Link href="/work" className="work-brand"><span className="work-brand-mark">y.</span><span>Yarukoto</span></Link>
        <button className="work-nav-capture" onClick={() => window.dispatchEvent(new CustomEvent('yarukoto:openFab'))} aria-label="仕事を記録する"><Plus size={17} /><span>記録する</span><kbd>Ctrl ⇧ K</kbd></button>
        <nav className="work-nav-links" aria-label="メインナビゲーション">{items.map(([href, label, Icon]) => <Link key={href} href={href} title={label} aria-label={label} aria-current={pathname === href ? 'page' : undefined} className={pathname === href ? 'active' : ''}><Icon size={18} /><span>{label}</span></Link>)}</nav>
        <div className="work-nav-projects"><div className="work-nav-caption">PROJECTS</div>{projects.map(project => <Link key={project.id} href={`/projects?id=${project.id}`} className={pathname === '/projects' && params.get('id') === String(project.id) ? 'active' : ''}><i style={{ background: project.color }} /><span>{project.name}</span></Link>)}</div>
        <div className="work-nav-bottom"><Link href="/settings" title="設定" aria-label="設定" aria-current={pathname === '/settings' ? 'page' : undefined}><Settings size={17} /><span>設定</span></Link><small>v{process.env.NEXT_PUBLIC_APP_VERSION}</small></div>
    </aside>;
}
