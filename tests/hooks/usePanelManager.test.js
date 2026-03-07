/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanelManager } from '../../hooks/usePanelManager';
import { useState } from 'react';

// Wrapper to provide state
function useTestManager(initialItems, options = {}) {
    const [items, setItems] = useState(initialItems);
    const flash = vi.fn();
    const manager = usePanelManager({
        items,
        setItems,
        flash,
        ...options
    });
    return { items, manager, flash };
}

describe('usePanelManager', () => {
    it('togglePalette toggles the open palette key', () => {
        const { result } = renderHook(() => useTestManager([]));
        expect(result.current.manager.openPalette).toBeNull();

        act(() => {
            result.current.manager.togglePalette('color1');
        });
        expect(result.current.manager.openPalette).toBe('color1');

        act(() => {
            result.current.manager.togglePalette('color1');
        });
        expect(result.current.manager.openPalette).toBeNull();
    });

    it('updateItem updates a specific field', () => {
        const initial = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
        const { result } = renderHook(() => useTestManager(initial));

        act(() => {
            result.current.manager.updateItem(2, 'name', 'B2');
        });

        expect(result.current.items).toEqual([
            { id: 1, name: 'A' },
            { id: 2, name: 'B2' }
        ]);
    });

    it('removeItem removes an item', () => {
        const initial = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
        const { result } = renderHook(() => useTestManager(initial));

        act(() => {
            result.current.manager.removeItem(1);
        });

        expect(result.current.items).toEqual([{ id: 2, name: 'B' }]);
    });

    describe('appendItem', () => {
        it('appends to the end when supportsArchive is false', () => {
            const initial = [{ id: 1 }];
            const { result } = renderHook(() => useTestManager(initial));

            act(() => {
                result.current.manager.appendItem({ id: 2 });
            });

            expect(result.current.items).toEqual([{ id: 1 }, { id: 2 }]);
        });

        it('inserts before archived items when supportsArchive is true', () => {
            const initial = [
                { id: 1, archived: false },
                { id: 2, archived: true }
            ];
            const { result } = renderHook(() => useTestManager(initial, {
                supportsArchive: true,
                isArchived: item => item.archived
            }));

            act(() => {
                result.current.manager.appendItem({ id: 3, archived: false });
            });

            expect(result.current.items).toEqual([
                { id: 1, archived: false },
                { id: 3, archived: false },
                { id: 2, archived: true }
            ]);
        });
    });

    describe('moveItem', () => {
        it('swaps items properly without archive support', () => {
            const initial = [{ id: 1 }, { id: 2 }, { id: 3 }];
            const { result } = renderHook(() => useTestManager(initial));

            act(() => {
                result.current.manager.moveItem(0, 1); // move id:1 down
            });

            expect(result.current.items).toEqual([{ id: 2 }, { id: 1 }, { id: 3 }]);
        });

        it('swaps active items properly with archive support', () => {
            const initial = [
                { id: 1, archived: false },
                { id: 2, archived: false },
                { id: 3, archived: true }
            ];
            const { result } = renderHook(() => useTestManager(initial, {
                supportsArchive: true,
                isArchived: item => item.archived
            }));

            act(() => {
                result.current.manager.moveItem(0, 1); // move id:1 down
            });

            expect(result.current.items).toEqual([
                { id: 2, archived: false },
                { id: 1, archived: false },
                { id: 3, archived: true }
            ]);
        });

        it('prevents moving active item into archived section', () => {
            const initial = [
                { id: 1, archived: false },
                { id: 2, archived: true }
            ];
            const { result } = renderHook(() => useTestManager(initial, {
                supportsArchive: true,
                isArchived: item => item.archived
            }));

            act(() => {
                // Try moving index 0 down by 1 (which would exceed active group size)
                result.current.manager.moveItem(0, 1);
            });

            // Should remain unchanged
            expect(result.current.items).toEqual([
                { id: 1, archived: false },
                { id: 2, archived: true }
            ]);
        });
    });

    it('saveAllOrder handles success', async () => {
        const { result } = renderHook(() => useTestManager([]));
        const saveFn = vi.fn().mockResolvedValue(true);

        await act(async () => {
            await result.current.manager.saveAllOrder(saveFn);
        });

        expect(saveFn).toHaveBeenCalled();
        expect(result.current.flash).toHaveBeenCalledWith('ok', '保存しました');
        expect(result.current.manager.saving).toBe(false);
    });

    it('saveAllOrder handles error', async () => {
        const { result } = renderHook(() => useTestManager([]));
        const saveFn = vi.fn().mockRejectedValue(new Error('DB Error'));

        await act(async () => {
            await result.current.manager.saveAllOrder(saveFn);
        });

        expect(saveFn).toHaveBeenCalled();
        expect(result.current.flash).toHaveBeenCalledWith('err', '保存に失敗しました');
        expect(result.current.manager.saving).toBe(false);
    });
});
