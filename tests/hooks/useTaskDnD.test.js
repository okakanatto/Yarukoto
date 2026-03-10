/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskDnD } from '@/hooks/useTaskDnD';
import { createTestDb, seedTasks } from '../__helpers__/testDb.js';

describe('useTaskDnD Eventual Consistency', () => {
    let db;
    beforeEach(async () => {
        db = await createTestDb();
        // Mock global event listener for toast errors
        vi.spyOn(window, 'dispatchEvent').mockImplementation(() => { });
    });

    it('should dispatch toast (not alert) when trying to nest a task that has children', async () => {
        // STEP B #2 regression: alert() was replaced with yarukoto:toast for consistency
        const [parentId, childId, targetId] = await seedTasks(db, [
            { title: 'Parent Task', project_id: 1 },
            { title: 'Child Task', parent_id: null, project_id: 1 },
            { title: 'Target Task', project_id: 1 },
        ]);
        // childId is a child of parentId in UI state (simulate: parentId has children)
        const tasks = [
            { id: parentId, title: 'Parent Task', parent_id: null, project_id: 1 },
            { id: childId, title: 'Child Task', parent_id: parentId, project_id: 1 },
            { id: targetId, title: 'Target Task', parent_id: null, project_id: 1 },
        ];

        const setTasks = vi.fn();
        const fetchTasks = vi.fn();

        const { result } = renderHook(() => useTaskDnD({
            tasks,
            setTasks,
            fetchTasks,
            sortMode: 'auto',
            getSortedParentTasks: () => tasks.filter(t => !t.parent_id),
            getChildTasks: (pid) => tasks.filter(t => t.parent_id === pid),
        }));

        // Drag parentId (which has children) onto targetId
        await act(async () => {
            await result.current.handleDragEnd({
                active: { id: parentId },
                over: { id: targetId }
            });
        });

        // Toast event should be dispatched
        expect(window.dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'yarukoto:toast',
                detail: expect.objectContaining({ type: 'error' }),
            })
        );

        // Nest should NOT have been applied (setTasks not called for nest update)
        // setTasks may be called for other reasons, but parent_id in DB should be unchanged
        const rows = await db.select('SELECT parent_id FROM tasks WHERE id = $1', [parentId]);
        expect(rows[0].parent_id).toBeNull();
    });

    it('should persist earlier writes and call fetchTasks when NEST operation fails midway', async () => {
        // safeTransaction was removed (BUG-10/BUG-11 fix) because @tauri-apps/plugin-sql
        // uses a connection pool where BEGIN/COMMIT are dispatched to different connections.
        // Individual db.execute() calls are auto-committed, so partial writes persist.

        // Seed a parent and a child
        const [parentId, childId] = await seedTasks(db, [
            { title: 'Parent Task', project_id: 1 },
            { title: 'Child Task', parent_id: null, project_id: null }
        ]);

        const tasks = [
            { id: parentId, title: 'Parent Task', parent_id: null, project_id: 1 },
            { id: childId, title: 'Child Task', parent_id: null, project_id: null }
        ];

        const setTasks = vi.fn();
        const fetchTasks = vi.fn();
        const sortMode = 'manual';

        const { result } = renderHook(() => useTaskDnD({
            tasks,
            setTasks,
            fetchTasks,
            sortMode,
            getSortedParentTasks: () => tasks,
            getChildTasks: () => []
        }));

        // Mock DB to fail during IMP-39 project sync (after parent_id is updated)
        const originalExecute = db.execute.bind(db);
        db.execute = async (sql, params) => {
            if (sql.includes('UPDATE tasks SET project_id')) {
                throw new Error('Simulated error during project sync');
            }
            return originalExecute(sql, params);
        };

        // Trigger DnD handleDragEnd
        await act(async () => {
            await result.current.handleDragEnd({
                active: { id: childId },
                over: { id: parentId }
            });
        });

        // fetchTasks is called to reload current DB state after error
        expect(fetchTasks).toHaveBeenCalled();

        // With eventual consistency, parent_id update was already committed
        // before project sync failed — earlier writes persist
        const rows = await db.select('SELECT parent_id, project_id FROM tasks WHERE id = $1', [childId]);
        expect(rows[0].parent_id).toBe(parentId); // parent_id committed before failure
        expect(rows[0].project_id).toBeNull();     // project sync failed, not applied
    });
});
