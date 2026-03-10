/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskEditModal from '@/components/TaskEditModal';
import { createTestDb, seedTasks } from '../__helpers__/testDb.js';

vi.mock('@/hooks/useMasterData', () => ({
    useMasterData: () => ({
        masters: {
            importance: [{ level: 1, label: '高' }],
            urgency: [{ level: 1, label: '高' }],
            status: [{ code: 1, label: '未着手' }, { code: 3, label: '完了' }]
        },
        tags: [{ id: 1, name: 'TagA' }],
        projects: [{ id: 1, name: 'ProjectA', is_default: 1 }]
    })
}));

describe('TaskEditModal Transactional Atomicity', () => {
    let db;
    beforeEach(async () => {
        db = await createTestDb();
    });

    it('should rollback all changes if DB update fails midway (prevents partial update)', async () => {
        // Seed initial task
        const [taskId] = await seedTasks(db, [{ title: 'Old Title', project_id: 1 }]);

        const task = { id: taskId, title: 'Old Title', project_id: 1, tags: [], status_code: 1 };
        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(<TaskEditModal task={task} onClose={onClose} onSaved={onSaved} />);

        // Wait for initial render (title input)
        const titleInput = await screen.findByDisplayValue('Old Title');

        // Edit title
        fireEvent.change(titleInput, { target: { value: 'New Title' } });

        // Mock db.execute to fail ONLY after tasks table is updated
        // specifically when deleting task_tags
        const originalExecute = db.execute.bind(db);
        db.execute = async (sql, params) => {
            if (sql.includes('DELETE FROM task_tags')) {
                throw new Error('Simulated DB error during tags update');
            }
            return originalExecute(sql, params);
        };

        const saveBtn = screen.getByRole('button', { name: '保存' });
        fireEvent.click(saveBtn);

        // Wait for the simulated failure
        await waitFor(() => {
            expect(saveBtn).not.toBeDisabled();
        }, { timeout: 1000 });

        // Verify that the title update was rolled back
        const rows = await db.select('SELECT title FROM tasks WHERE id = $1', [taskId]);
        expect(rows[0].title).toBe('Old Title'); // Should be restored to Old Title
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('should save successfully if no DB error occurs', async () => {
        const [taskId] = await seedTasks(db, [{ title: 'Old Title', project_id: 1 }]);
        const task = { id: taskId, title: 'Old Title', project_id: 1, tags: [], status_code: 1 };
        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(<TaskEditModal task={task} onClose={onClose} onSaved={onSaved} />);
        const titleInput = await screen.findByDisplayValue('Old Title');

        fireEvent.change(titleInput, { target: { value: 'New Title' } });
        const saveBtn = screen.getByRole('button', { name: '保存' });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(onSaved).toHaveBeenCalled();
        });

        const rows = await db.select('SELECT title FROM tasks WHERE id = $1', [taskId]);
        expect(rows[0].title).toBe('New Title');
    });
});
