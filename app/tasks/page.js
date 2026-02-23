'use client';

import { useState, useEffect } from 'react';
import TaskInput from '@/components/TaskInput';
import TaskList from '@/components/TaskList';

export default function TasksPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh task list when a task is added from the global FAB
  useEffect(() => {
    const handleTaskAdded = () => setRefreshKey(k => k + 1);
    window.addEventListener('taskflow:taskAdded', handleTaskAdded);
    return () => window.removeEventListener('taskflow:taskAdded', handleTaskAdded);
  }, []);

  return (
    <div className="page-container">
      <h2 className="page-title">📋 タスク一覧</h2>
      <TaskInput onTaskAdded={() => setRefreshKey(k => k + 1)} />
      <div style={{ marginTop: '1.5rem' }}>
        <TaskList key={refreshKey} />
      </div>

      <style jsx>{`
        .page-container {
          max-width: 900px;
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
