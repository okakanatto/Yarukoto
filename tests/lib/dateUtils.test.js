import { describe, it, expect } from 'vitest';
import { toDateStr, addDays } from '../../lib/dateUtils';

describe('dateUtils', () => {
    describe('toDateStr', () => {
        it('formats Date object to YYYY-MM-DD string', () => {
            // sv-SE throws local YYYY-MM-DD
            const date = new Date(2026, 2, 7); // March 7, 2026
            expect(toDateStr(date)).toBe('2026-03-07');
        });

        it('handles single digit month and day padding', () => {
            const date = new Date(2026, 0, 5); // January 5, 2026
            expect(toDateStr(date)).toBe('2026-01-05');
        });
    });

    describe('addDays', () => {
        it('adds positive days correctly', () => {
            const base = new Date('2026-03-07T00:00:00');
            const result = addDays(base, 5);
            expect(result.getDate()).toBe(12);
            expect(result.getMonth()).toBe(2); // March
        });

        it('subtracts days correctly with negative numbers', () => {
            const base = new Date('2026-03-07T00:00:00');
            const result = addDays(base, -2);
            expect(result.getDate()).toBe(5);
        });

        it('crosses month boundaries correctly', () => {
            const base = new Date('2026-03-30T00:00:00');
            const result = addDays(base, 2);
            expect(result.getDate()).toBe(1);
            expect(result.getMonth()).toBe(3); // April
        });

        it('accepts string as base date', () => {
            const result = addDays('2026-03-07T00:00:00', 1);
            expect(result.getDate()).toBe(8);
        });
    });
});
