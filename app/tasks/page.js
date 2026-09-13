'use client';

import TaskList from '@/components/TaskList';

export default function TasksPage() {
  return (
    <div className="task-management-page">
      <h1 className="page-heading task-page-heading">すべてのタスク</h1>
      <div className="task-management-body"><TaskList fullPage /></div>

      <style jsx>{`
        .task-management-page {
          max-width: 1440px;
          margin: 0 auto;
          width:100%; flex:1; min-height:0; display:flex; flex-direction:column;
        }
        .task-management-body { flex:1; min-height:0; }
      `}</style>
    </div>
  );
}
