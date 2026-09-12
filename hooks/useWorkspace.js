'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadWorkspace } from '@/lib/workspace';

export function useWorkspace() {
    const [data, setData] = useState({ tasks: [], projects: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const request = useRef(0);
    const reload = useCallback(async () => {
        const id = ++request.current;
        try {
            const next = await loadWorkspace();
            if (id === request.current) { setData(next); setError(''); }
        } catch {
            if (id === request.current) setError('仕事を読み込めませんでした。もう一度お試しください。');
        } finally {
            if (id === request.current) setLoading(false);
        }
    }, []);
    const invalidateRequests = useCallback(() => { request.current++; }, []);
    useEffect(() => {
        reload();
        const events = ['yarukoto:tasksChanged', 'yarukoto:taskAdded', 'yarukoto:projectsChanged'];
        events.forEach(event => window.addEventListener(event, reload));
        return () => { invalidateRequests(); events.forEach(event => window.removeEventListener(event, reload)); };
    }, [reload, invalidateRequests]);
    const setTasks = useCallback(update => setData(previous => ({
        ...previous, tasks: typeof update === 'function' ? update(previous.tasks) : update,
    })), []);
    return { ...data, loading, error, reload, setTasks };
}
