'use client';

import TaskList from '@/components/TaskList';

export default function TasksPage() {
  return (
    <div className="task-management-page">
      <TaskList fullPage />

      <style jsx>{`
        .task-management-page {
          max-width: 1600px;
          margin: 0 auto;
          width:100%; flex:1; min-height:0;
        }
      `}</style>
    </div>
  );
}
