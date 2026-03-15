'use client';

import { useState, useEffect } from 'react';
import { fetchDb } from '@/lib/utils';
import { Tag, BarChart3, FolderOpen, Wrench, Database, Palette, CircleCheck, XCircle } from 'lucide-react';
import TagsPanel from './_components/TagsPanel';
import StatusPanel from './_components/StatusPanel';
import ProjectsPanel from './_components/ProjectsPanel';
import OptionsPanel from './_components/OptionsPanel';
import DataPanel from './_components/DataPanel';
import ThemePanel from './_components/ThemePanel';

const TAB_ICON_SIZE = 15;
const TAB_ICON_STROKE = 1.75;

const TABS = [
    { key: 'tags', label: 'タグ', icon: <Tag size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} /> },
    { key: 'status', label: 'ステータス', icon: <BarChart3 size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} /> },
    { key: 'projects', label: 'プロジェクト', icon: <FolderOpen size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} /> },
    { key: 'theme', label: 'テーマ', icon: <Palette size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} /> },
    { key: 'options', label: 'オプション', icon: <Wrench size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} /> },
    { key: 'data', label: 'データ管理', icon: <Database size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} /> },
];

export default function Settings() {
    const [tab, setTab] = useState('tags');
    const [data, setData] = useState({ tags: [], importance: [], urgency: [], status: [], projects: [] });
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [appSettings, setAppSettings] = useState({});

    useEffect(() => { load(); }, []);
    const flash = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

    const load = async () => {
        setLoading(true);
        try {
            const db = await fetchDb();
            const [importance, urgency, status, tagsData, projectsData] = await Promise.all([
                db.select('SELECT * FROM importance_master ORDER BY level'),
                db.select('SELECT * FROM urgency_master ORDER BY level'),
                db.select('SELECT * FROM status_master ORDER BY sort_order, code'),
                db.select('SELECT * FROM tags ORDER BY sort_order, id'),
                db.select('SELECT * FROM projects ORDER BY sort_order, id'),
            ]);
            setData({ importance, urgency, status, tags: tagsData, projects: projectsData });
            const settingsRows = await db.select('SELECT key, value FROM app_settings');
            const settingsMap = {};
            settingsRows.forEach(r => { settingsMap[r.key] = r.value; });
            setAppSettings(settingsMap);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    return (
        <div className="s-page">
            <h2 className="page-title">設定</h2>
            <p className="s-sub">タグやマスターデータをカスタマイズ</p>

            <div className="s-tabs">
                {TABS.map(t => (
                    <button key={t.key} className={`s-tab ${tab === t.key ? 'on' : ''}`}
                        onClick={() => setTab(t.key)}>
                        <span>{t.icon}</span><span>{t.label}</span>
                    </button>
                ))}
            </div>

            <div className="s-panel">
                {loading ? (
                    <div className="s-center"><span className="spinner" /> 読み込み中...</div>
                ) : (
                    <>
                        {tab === 'tags' && <TagsPanel data={data} setData={setData} flash={flash} />}
                        {tab === 'status' && <StatusPanel data={data} setData={setData} flash={flash} />}
                        {tab === 'projects' && <ProjectsPanel data={data} setData={setData} flash={flash} />}
                        {tab === 'theme' && <ThemePanel appSettings={appSettings} setAppSettings={setAppSettings} flash={flash} />}
                        {tab === 'options' && <OptionsPanel appSettings={appSettings} setAppSettings={setAppSettings} flash={flash} />}
                        {tab === 'data' && <DataPanel flash={flash} />}
                    </>
                )}
            </div>

            {toast && <div className={`s-toast ${toast.type === 'ok' ? 's-toast-ok' : 's-toast-err'}`}>{toast.type === 'ok' ? <CircleCheck size={16} /> : <XCircle size={16} />} {toast.msg}</div>}

            {process.env.NEXT_PUBLIC_APP_VERSION && (
                <p className="s-version">Yarukoto v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
            )}

            <style jsx global>{`
        .s-page { max-width:700px; animation:s-up .35s ease }
        @keyframes s-up { from{opacity:0} to{opacity:1} }
        .s-sub { color:var(--color-text-muted); font-size:.82rem; margin-top:-1rem; margin-bottom:1.25rem }

        .s-tabs { display:flex; gap:0; margin-bottom:1rem; border-bottom:1px solid var(--border-color); background:transparent }
        .s-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:.3rem; padding:8px 6px; border:none; border-bottom:2px solid transparent; background:transparent; color:var(--color-text-muted); font-size:.78rem; font-weight:500; border-radius:0; cursor:pointer; transition:color .2s, border-color .2s; font-family:inherit }
        .s-tab:hover { color:var(--color-text) }
        .s-tab.on { color:var(--color-accent); font-weight:600; border-bottom-color:var(--color-accent) }

        .s-panel { background:transparent; border:none; border-radius:0; padding:10px 0; min-height:200px }
        .s-center { display:flex; align-items:center; justify-content:center; gap:.5rem; padding:2rem; color:var(--color-text-muted) }

        .s-head-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px }
        .s-heading { font-size:.88rem; font-weight:700; color:var(--color-text); margin:0 0 8px }
        .s-head-row .s-heading { margin-bottom:0 }

        .s-add-row { display:flex; align-items:center; gap:6px; padding-bottom:8px; margin-bottom:6px; border-bottom:1px solid var(--border-color) }
        .s-add-pal { margin-bottom:6px }

        .s-list { display:flex; flex-direction:column; gap:0 }
        .s-item { cursor:grab; }
        .s-item:active { cursor:grabbing; }
        .s-row {
          display:flex; align-items:center; gap:6px;
          padding:6px 8px; background:transparent;
          border-radius:0; border:none; border-bottom:1px solid var(--border-color); transition:background .18s;
        }
        .s-row:hover { background:var(--color-surface-hover) }

        .s-grip {
          color:var(--color-text-disabled); font-size:.88rem;
          cursor:grab; user-select:none; line-height:1;
          width:18px; text-align:center; flex-shrink:0;
          transition:color .15s;
        }
        .s-row:hover .s-grip { color:var(--color-text-muted); }

        .s-move-btns {
          display:flex; flex-direction:column; gap:1px; flex-shrink:0;
        }
        .s-move-btn {
          background:transparent; border:none;
          color:var(--color-text-disabled); cursor:pointer;
          width:20px; height:13px; border-radius:var(--radius-sm);
          display:flex; align-items:center; justify-content:center;
          font-size:.55rem; line-height:1; padding:0;
          transition:color .15s; font-family:inherit;
        }
        .s-move-btn:hover:not(:disabled) {
          color:var(--color-accent);
        }
        .s-move-btn:disabled { opacity:.2; cursor:default }

        .s-swatch {
          width:28px; height:28px; min-width:28px;
          border-radius:var(--radius-sm); border:2px solid var(--border-color);
          cursor:pointer; padding:0;
          transition:border-color .15s;
        }
        .s-swatch:hover { border-color:var(--border-color-hover) }

        .s-bar { width:3px; height:20px; border-radius:2px; flex-shrink:0; opacity:.8 }

        .s-palette {
          margin-top:4px; padding:8px;
          background:var(--color-surface-hover); border-radius:var(--radius-sm);
          border:1px solid var(--border-color); animation:s-pal .2s ease;
        }
        @keyframes s-pal { from{opacity:0} to{opacity:1} }

        .s-input {
          flex:1; background:transparent; border:1px solid transparent;
          padding:4px 8px; color:var(--color-text); border-radius:var(--radius-sm);
          font-size:.82rem; font-weight:500; outline:none; transition:border-color .18s; font-family:inherit;
        }
        .s-input:focus { background:var(--color-surface-hover); border-color:var(--color-accent) }
        .s-input::placeholder { color:var(--color-text-disabled); font-weight:400 }
        .s-label { flex:1; font-size:.82rem; font-weight:500; color:var(--color-text); padding:4px 8px }

        .s-btn-primary {
          background:var(--color-accent); border:none; color:#fff;
          padding:5px 10px; border-radius:var(--radius-sm); font-size:.78rem;
          font-weight:600; cursor:pointer; white-space:nowrap; transition:filter .18s; font-family:inherit;
        }
        .s-btn-primary:hover:not(:disabled) { filter:brightness(1.1) }
        .s-btn-primary:disabled { opacity:.4; cursor:not-allowed }

        .s-del {
          background:transparent; border:none;
          color:var(--color-text-disabled); cursor:pointer;
          width:26px; height:26px; min-width:26px; border-radius:var(--radius-sm);
          display:flex; align-items:center; justify-content:center;
          font-size:.75rem; transition:color .18s; opacity:0;
        }
        .s-row:hover .s-del { opacity:1 }
        .s-del:hover { color:var(--color-danger) }

        .s-empty { color:var(--color-text-disabled); font-size:.8rem; padding:1.5rem; text-align:center }
        .s-hint { color:var(--color-text-muted); font-size:.72rem; padding:6px 0 0; margin:0; font-style:italic; }

        .s-archive-btn {
          background:transparent; border:none;
          color:var(--color-text-disabled); cursor:pointer;
          width:26px; height:26px; min-width:26px; border-radius:var(--radius-sm);
          display:flex; align-items:center; justify-content:center;
          font-size:.75rem; transition:color .18s; opacity:0;
        }
        .s-row:hover .s-archive-btn { opacity:1 }
        .s-archive-btn:hover { color:var(--color-accent) }
        .s-unarchive-btn { opacity:1 !important; }
        .s-unarchive-btn:hover { color:var(--color-accent) }

        .s-archived-header {
          display:flex; align-items:center; gap:6px;
          margin-top:10px; padding:8px 0 6px;
          border-top:1px solid var(--border-color);
        }
        .s-archived-label { font-size:.78rem; font-weight:600; color:var(--color-text-muted); }

        .s-archived-section { margin-top:8px; }
        .s-archived-toggle {
          background:none; border:none; cursor:pointer; font-size:.78rem;
          font-weight:600; color:var(--color-text-muted); padding:4px 0;
          display:flex; align-items:center; gap:.3rem; font-family:inherit;
        }
        .s-archived-toggle:hover { color:var(--color-text-secondary); }
        .s-archived-chev { display:inline-block; transition:transform .2s; font-size:.88rem; line-height:1; }
        .s-archived-chev.open { transform:rotate(90deg); }
        .s-label-archived { flex:1; font-size:.8rem; color:var(--color-text-muted); padding:4px 8px; opacity:.7; }
        .s-list-archived { opacity:.75; }
        .s-item-archived { cursor:default; }
        .s-item-archived .s-row { background:transparent; }
        .s-item-archived .s-del { opacity:0; }
        .s-item-archived .s-row:hover .s-del { opacity:1; }

        .dm-section { display:flex; flex-direction:column; gap:0 }
        .dm-card { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0; border:none; border-bottom:1px solid var(--border-color); border-radius:0; background:transparent; transition:none }
        .dm-card:hover { }
        .dm-card-info { display:flex; align-items:center; gap:8px; flex:1 }
        .dm-icon { font-size:1.1rem }
        .dm-card-info strong { font-size:.82rem; color:var(--color-text); display:block }
        .dm-desc { font-size:.75rem; color:var(--color-text-muted); margin:.1rem 0 0 }
        .dm-file-label { cursor:pointer }
        .dm-divider { height:1px; background:var(--border-color); margin:4px 0 }
        .dm-danger { background:transparent; border-bottom-color:rgba(220,38,38,.2) }
        .dm-danger:hover { }
        .s-btn-danger { background:var(--color-danger,#dc2626); border:none; color:#fff; padding:5px 10px; border-radius:var(--radius-sm); font-size:.78rem; font-weight:600; cursor:pointer; font-family:inherit; transition:filter .18s; white-space:nowrap }
        .s-btn-danger:hover { filter:brightness(1.1) }

        .opt-section { display:flex; flex-direction:column; gap:0 }
        .opt-card {
          display:flex; align-items:center; justify-content:space-between; gap:8px;
          padding:10px 0; border:none; border-bottom:1px solid var(--border-color);
          border-radius:0; background:transparent; transition:none;
        }
        .opt-card:hover { }
        .opt-info { display:flex; align-items:flex-start; gap:8px; flex:1 }
        .opt-icon { font-size:1.1rem; margin-top:2px }
        .opt-title { font-size:.82rem; color:var(--color-text); display:block }
        .opt-desc { font-size:.75rem; color:var(--color-text-muted); margin:.2rem 0 0; line-height:1.4 }

        .opt-toggle {
          position:relative; width:44px; height:24px; border-radius:12px;
          background:var(--color-text-disabled); border:none; cursor:pointer;
          transition:background .25s; flex-shrink:0; padding:0;
        }
        .opt-toggle.on { background:var(--color-accent) }
        .opt-toggle-knob {
          position:absolute; top:3px; left:3px; width:18px; height:18px;
          border-radius:50%; background:#fff;
          transition:transform .25s cubic-bezier(.34,1.56,.64,1);
        }
        .opt-toggle.on .opt-toggle-knob { transform:translateX(20px) }

        .opt-number-group {
          display:flex; align-items:center; gap:4px; flex-shrink:0;
        }
        .opt-number-input {
          width:60px; padding:4px 6px; border:1px solid var(--border-color);
          border-radius:var(--radius-sm); background:var(--color-surface-hover);
          color:var(--color-text); font-size:.82rem; font-family:inherit;
          text-align:center; transition:border-color .2s;
        }
        .opt-number-input:focus {
          outline:none; border-color:var(--color-accent);
          background:var(--color-surface);
        }
        .opt-number-unit { font-size:.78rem; color:var(--color-text-muted); font-weight:500; white-space:nowrap; }

        .s-version { text-align:center; color:var(--color-text-disabled); font-size:.72rem; margin-top:1.25rem; }

        .s-toast {
          position:fixed; bottom:1.5rem; right:1.5rem;
          padding:8px 12px; border-radius:var(--radius-sm);
          font-size:.8rem; font-weight:500; z-index:9999;
          animation:s-tIn .3s cubic-bezier(.16,1,.3,1);
        }
        .s-toast-ok  { background:var(--toast-success-bg); border:1px solid var(--toast-success-border); color:var(--toast-success-text) }
        .s-toast-err { background:var(--toast-error-bg); border:1px solid var(--toast-error-border); color:var(--toast-error-text) }
        @keyframes s-tIn { from{opacity:0} to{opacity:1} }
      `}</style>
        </div>
    );
}
