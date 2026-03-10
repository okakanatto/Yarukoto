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
