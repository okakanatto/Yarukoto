'use client';

import { useState, useEffect } from 'react';
import { fetchDb } from '@/lib/utils';
import TagsPanel from './_components/TagsPanel';
import StatusPanel from './_components/StatusPanel';
import ProjectsPanel from './_components/ProjectsPanel';
import OptionsPanel from './_components/OptionsPanel';
import DataPanel from './_components/DataPanel';

const TABS = [
    { key: 'tags', label: 'タグ', icon: '🏷️' },
    { key: 'status', label: 'ステータス', icon: '📊' },
    { key: 'projects', label: 'プロジェクト', icon: '📁' },
    { key: 'options', label: 'オプション', icon: '🔧' },
    { key: 'data', label: 'データ管理', icon: '💾' },
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
            <h2 className="page-title">⚙️ 設定</h2>
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
                        {tab === 'options' && <OptionsPanel appSettings={appSettings} setAppSettings={setAppSettings} flash={flash} />}
                        {tab === 'data' && <DataPanel flash={flash} />}
                    </>
                )}
            </div>

            {toast && <div className={`s-toast ${toast.type === 'ok' ? 's-toast-ok' : 's-toast-err'}`}>{toast.type === 'ok' ? '✅' : '❌'} {toast.msg}</div>}

            <style jsx global>{`
        .s-page { max-width:700px; animation:s-up .35s ease }
        @keyframes s-up { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .s-sub { color:var(--color-text-muted); font-size:.88rem; margin-top:-1rem; margin-bottom:1.75rem }

        .s-tabs { display:flex; gap:3px; margin-bottom:1.25rem; padding:4px; background:var(--color-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); box-shadow:var(--shadow-sm) }
        .s-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:.35rem; padding:.6rem .5rem; border:none; background:transparent; color:var(--color-text-muted); font-size:.85rem; font-weight:500; border-radius:9px; cursor:pointer; transition:all .2s; font-family:inherit }
        .s-tab:hover { background:var(--color-surface-hover); color:var(--color-text) }
        .s-tab.on { background:var(--color-primary); color:#fff; font-weight:600; box-shadow:0 2px 10px rgba(79,110,247,.18) }

        .s-panel { background:var(--color-surface); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:1.5rem; min-height:200px; box-shadow:var(--shadow-sm) }
        .s-center { display:flex; align-items:center; justify-content:center; gap:.6rem; padding:3rem; color:var(--color-text-muted) }

        .s-head-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem }
        .s-heading { font-size:1rem; font-weight:700; color:var(--color-text); margin:0 0 1rem }
        .s-head-row .s-heading { margin-bottom:0 }

        .s-add-row { display:flex; align-items:center; gap:.65rem; padding-bottom:1rem; margin-bottom:.75rem; border-bottom:1px solid var(--border-color) }
        .s-add-pal { margin-bottom:.75rem }

        .s-list { display:flex; flex-direction:column; gap:4px }
        .s-item { cursor:grab; }
        .s-item:active { cursor:grabbing; }
        .s-row {
          display:flex; align-items:center; gap:.5rem;
          padding:.55rem .65rem; background:var(--color-surface);
          border-radius:var(--radius-sm); border:1px solid transparent; transition:all .18s;
        }
        .s-row:hover { background:var(--color-surface-hover); border-color:var(--border-color) }

        .s-grip {
          color:var(--color-text-disabled); font-size:1rem;
          cursor:grab; user-select:none; line-height:1;
          width:20px; text-align:center; flex-shrink:0;
          transition:color .15s;
        }
        .s-row:hover .s-grip { color:var(--color-text-muted); }

        .s-move-btns {
          display:flex; flex-direction:column; gap:1px; flex-shrink:0;
        }
        .s-move-btn {
          background:transparent; border:1px solid transparent;
          color:var(--color-text-disabled); cursor:pointer;
          width:22px; height:14px; border-radius:3px;
          display:flex; align-items:center; justify-content:center;
          font-size:.55rem; line-height:1; padding:0;
          transition:all .15s; font-family:inherit;
        }
        .s-move-btn:hover:not(:disabled) {
          background:var(--color-surface-hover); border-color:var(--border-color);
          color:var(--color-primary);
        }
        .s-move-btn:active:not(:disabled) { transform:scale(.9) }
        .s-move-btn:disabled { opacity:.2; cursor:default }

        .s-swatch {
          width:34px; height:34px; min-width:34px;
          border-radius:var(--radius-sm); border:2px solid var(--border-color);
          cursor:pointer; padding:0;
          transition:transform .15s, box-shadow .15s, border-color .15s;
          box-shadow:var(--shadow-sm);
        }
        .s-swatch:hover { transform:scale(1.1); box-shadow:var(--shadow-md); border-color:var(--border-color-hover) }

        .s-bar { width:3px; height:22px; border-radius:2px; flex-shrink:0; opacity:.8 }

        .s-palette {
          margin-top:4px; padding:.75rem;
          background:var(--color-surface-hover); border-radius:var(--radius-sm);
          border:1px solid var(--border-color); animation:s-pal .2s ease;
        }
        @keyframes s-pal { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }

        .s-input {
          flex:1; background:transparent; border:1px solid transparent;
          padding:.35rem .55rem; color:var(--color-text); border-radius:6px;
          font-size:.88rem; font-weight:500; outline:none; transition:all .18s; font-family:inherit;
        }
        .s-input:focus { background:var(--color-surface-hover); border-color:var(--color-primary); box-shadow:0 0 0 2px var(--color-primary-glow) }
        .s-input::placeholder { color:var(--color-text-disabled); font-weight:400 }
        .s-label { flex:1; font-size:.88rem; font-weight:500; color:var(--color-text); padding:.35rem .55rem }

        .s-btn-primary {
          background:var(--color-primary); border:none; color:#fff;
          padding:.42rem .9rem; border-radius:var(--radius-sm); font-size:.82rem;
          font-weight:600; cursor:pointer; white-space:nowrap; transition:all .18s; font-family:inherit;
        }
        .s-btn-primary:hover:not(:disabled) { filter:brightness(1.1); transform:translateY(-1px) }
        .s-btn-primary:active:not(:disabled) { transform:translateY(0) }
        .s-btn-primary:disabled { opacity:.4; cursor:not-allowed }

        .s-del {
          background:transparent; border:1px solid transparent;
          color:var(--color-text-disabled); cursor:pointer;
          width:28px; height:28px; min-width:28px; border-radius:7px;
          display:flex; align-items:center; justify-content:center;
          font-size:.75rem; transition:all .18s; opacity:0;
        }
        .s-row:hover .s-del { opacity:1 }
        .s-del:hover { background:var(--color-danger-bg); border-color:rgba(220,38,38,.15); color:var(--color-danger) }

        .s-empty { color:var(--color-text-disabled); font-size:.85rem; padding:2rem; text-align:center }
        .s-hint { color:var(--color-text-muted); font-size:.75rem; padding:.75rem 0 0; margin:0; font-style:italic; }

        .s-archive-btn {
          background:transparent; border:1px solid transparent;
          color:var(--color-text-disabled); cursor:pointer;
          width:28px; height:28px; min-width:28px; border-radius:7px;
          display:flex; align-items:center; justify-content:center;
          font-size:.75rem; transition:all .18s; opacity:0;
        }
        .s-row:hover .s-archive-btn { opacity:1 }
        .s-archive-btn:hover { background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.2); }
        .s-unarchive-btn { opacity:1 !important; }
        .s-unarchive-btn:hover { background:rgba(79,110,247,.1); border-color:rgba(79,110,247,.2); }

        .s-archived-header {
          display:flex; align-items:center; gap:.5rem;
          margin-top:1.25rem; padding:.6rem 0 .4rem;
          border-top:1px solid var(--border-color);
        }
        .s-archived-label { font-size:.82rem; font-weight:600; color:var(--color-text-muted); }
        .s-list-archived { opacity:.75; }
        .s-item-archived { cursor:default; }
        .s-item-archived .s-row { background:var(--color-surface); }
        .s-item-archived .s-del { opacity:0; }
        .s-item-archived .s-row:hover .s-del { opacity:1; }

        .dm-section { display:flex; flex-direction:column; gap:.75rem }
        .dm-card { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.25rem; border:1px solid var(--border-color); border-radius:var(--radius-md); transition:border-color .2s }
        .dm-card:hover { border-color:var(--border-color-hover) }
        .dm-card-info { display:flex; align-items:center; gap:.75rem; flex:1 }
        .dm-icon { font-size:1.3rem }
        .dm-card-info strong { font-size:.88rem; color:var(--color-text); display:block }
        .dm-desc { font-size:.78rem; color:var(--color-text-muted); margin:.15rem 0 0 }
        .dm-file-label { cursor:pointer }
        .dm-divider { height:1px; background:var(--border-color); margin:.5rem 0 }
        .dm-danger { border-color:rgba(220,38,38,.15); background:rgba(220,38,38,.02) }
        .dm-danger:hover { border-color:rgba(220,38,38,.3) }
        .s-btn-danger { background:var(--color-danger,#dc2626); border:none; color:#fff; padding:.45rem 1rem; border-radius:var(--radius-sm); font-size:.82rem; font-weight:600; cursor:pointer; font-family:inherit; transition:all .18s; white-space:nowrap }
        .s-btn-danger:hover { filter:brightness(1.1); transform:translateY(-1px) }

        .opt-section { display:flex; flex-direction:column; gap:.75rem }
        .opt-card {
          display:flex; align-items:center; justify-content:space-between; gap:1rem;
          padding:1rem 1.25rem; border:1px solid var(--border-color);
          border-radius:var(--radius-md); transition:border-color .2s;
        }
        .opt-card:hover { border-color:var(--border-color-hover) }
        .opt-info { display:flex; align-items:flex-start; gap:.75rem; flex:1 }
        .opt-icon { font-size:1.3rem; margin-top:2px }
        .opt-title { font-size:.88rem; color:var(--color-text); display:block }
        .opt-desc { font-size:.78rem; color:var(--color-text-muted); margin:.25rem 0 0; line-height:1.45 }

        .opt-toggle {
          position:relative; width:48px; height:26px; border-radius:13px;
          background:var(--color-text-disabled); border:none; cursor:pointer;
          transition:background .25s; flex-shrink:0; padding:0;
        }
        .opt-toggle.on { background:var(--color-primary) }
        .opt-toggle-knob {
          position:absolute; top:3px; left:3px; width:20px; height:20px;
          border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.2);
          transition:transform .25s cubic-bezier(.34,1.56,.64,1);
        }
        .opt-toggle.on .opt-toggle-knob { transform:translateX(22px) }

        .opt-number-group {
          display:flex; align-items:center; gap:.4rem; flex-shrink:0;
        }
        .opt-number-input {
          width:70px; padding:.4rem .5rem; border:1px solid var(--border-color);
          border-radius:var(--radius-sm); background:var(--color-surface-hover);
          color:var(--color-text); font-size:.88rem; font-family:inherit;
          text-align:center; transition:border-color .2s, box-shadow .2s;
        }
        .opt-number-input:focus {
          outline:none; border-color:var(--color-primary);
          box-shadow:0 0 0 3px var(--color-primary-glow);
          background:var(--color-surface);
        }
        .opt-number-unit { font-size:.82rem; color:var(--color-text-muted); font-weight:500; white-space:nowrap; }

        .s-toast {
          position:fixed; bottom:1.5rem; right:1.5rem;
          padding:.75rem 1.25rem; border-radius:var(--radius-md);
          font-size:.85rem; font-weight:500; z-index:9999;
          box-shadow:0 8px 24px rgba(0,0,0,0.1);
          animation:s-tIn .3s cubic-bezier(.16,1,.3,1);
        }
        .s-toast-ok  { background:#ecfdf5; border:1px solid #bbf7d0; color:#15803d }
        .s-toast-err { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c }
        @keyframes s-tIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
        </div>
    );
}
