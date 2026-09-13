/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { guardWorkNavigation, registerWorkNavigationGuard } from '@/lib/workNavigation';

describe('work route changes', () => {
    it('shares a save in progress and uses only the last requested destination', async () => {
        let finish;
        const save = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        const dispose = registerWorkNavigationGuard(save);
        try {
            const first = vi.fn(), second = vi.fn();
            const firstNavigation = guardWorkNavigation(first);
            const secondNavigation = guardWorkNavigation(second);
            expect(save).toHaveBeenCalledOnce();
            finish(true);
            expect(await firstNavigation).toBe(false);
            expect(await secondNavigation).toBe(true);
            expect(first).not.toHaveBeenCalled();
            expect(second).toHaveBeenCalledOnce();
        } finally { dispose(); }
    });
});
