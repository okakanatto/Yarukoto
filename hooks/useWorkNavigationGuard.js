'use client';

import { useEffect, useRef } from 'react';
import { registerWorkNavigationGuard } from '@/lib/workNavigation';

export function useWorkNavigationGuard(guard, enabled = true) {
    const latest = useRef(guard);
    useEffect(() => { latest.current = guard; });
    useEffect(() => {
        if (!enabled) return;
        return registerWorkNavigationGuard(() => latest.current());
    }, [enabled]);
}
