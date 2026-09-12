/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaskEditModal from '@/components/TaskEditModal';
import { createTestDb, seedTasks, seedTags, linkTaskTags } from '../__helpers__/testDb.js';

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

describe('TaskEditModal save failure recovery', () => {
    let db;
    beforeEach(async () => {
        db = await createTestDb();
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('keeps the edited form open after a partial write fails and safely completes a retry', async () => {
        const [taskId] = await seedTasks(db, [{ title: 'Old Title', notes: '背景メモ', project_id: 1 }]);
        const [tagId] = await seedTags(db, [{ name: 'TagA' }]);
        await linkTaskTags(db, taskId, [tagId]);

        const task = { id: taskId, title: 'Old Title', notes: '背景メモ', project_id: 1, tags: [{ id: tagId, name: 'TagA' }], status_code: 1 };
        const onClose = vi.fn();
        const onSaved = vi.fn();
        const dispatched = vi.spyOn(window, 'dispatchEvent');

        render(<TaskEditModal task={task} onClose={onClose} onSaved={onSaved} />);
        const titleInput = await screen.findByDisplayValue('Old Title');
        fireEvent.change(titleInput, { target: { value: 'New Title' } });
        const notesInput = screen.getByDisplayValue('背景メモ');
        fireEvent.change(notesInput, { target: { value: '方式の判断理由を残す' } });

        // Production uses individually committed SQL statements (Tauri pool).
        // Check observable recovery, not unsupported cross-call rollback semantics.
        const originalExecute = db.execute.bind(db);
        let failureInjected = false;
        db.execute = async (sql, params) => {
            if (!failureInjected && sql.includes('DELETE FROM task_tags')) {
                failureInjected = true;
                throw new Error('Simulated DB error during tags update');
            }
            return originalExecute(sql, params);
        };

        const saveBtn = screen.getByRole('button', { name: '保存' });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(failureInjected).toBe(true);
            expect(saveBtn.disabled).toBe(false);
        }, { timeout: 1000 });
        expect(titleInput.value).toBe('New Title');
        expect(notesInput.value).toBe('方式の判断理由を残す');
        expect(onClose).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
        expect(dispatched.mock.calls.some(([event]) => event.type === 'yarukoto:toast' && event.detail?.message === '保存に失敗しました')).toBe(true);

        fireEvent.click(saveBtn);
        await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
        expect(onClose).toHaveBeenCalledOnce();
        const rows = await db.select('SELECT title, notes FROM tasks WHERE id = $1', [taskId]);
        expect(rows[0]).toMatchObject({ title: 'New Title', notes: '方式の判断理由を残す' });
        const tags = await db.select('SELECT tag_id FROM task_tags WHERE task_id = $1', [taskId]);
        expect(tags.map(tag => tag.tag_id)).toEqual([tagId]);
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
