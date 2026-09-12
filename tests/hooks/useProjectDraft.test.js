/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useProjectDraft, readProjectDraft } from '@/hooks/useProjectDraft';

describe('プロジェクトの下書き', () => {
    it('プロジェクトから移動しても未保存の成果と期限を復元できる', () => {
        const project = { id: 801, outcome: '元の成果', due_date: '2026-10-01' };
        const first = renderHook(() => useProjectDraft(project));
        act(() => {
            first.result.current.update('outcome', '定義を揃えて合意する');
            first.result.current.update('due_date', '2026-10-05');
        });
        first.unmount();
        const resumed = renderHook(() => useProjectDraft(project));
        expect(resumed.result.current.outcome).toBe('定義を揃えて合意する');
        expect(resumed.result.current.dueDate).toBe('2026-10-05');
        expect(resumed.result.current.dirty).toBe(true);
        act(() => resumed.result.current.clear());
        resumed.unmount();
    });
    it('成果だけ編集中にDBの期限が変わっても古い期限を保存patchに含めない', () => {
        const project = { id: 802, outcome: '元の成果', due_date: '2026-10-01' };
        const hook = renderHook(({ value }) => useProjectDraft(value), { initialProps: { value: project } });
        act(() => hook.result.current.update('outcome', '新しい成果'));
        hook.rerender({ value: { ...project, due_date: '2026-10-08' } });
        expect(hook.result.current.dueDate).toBe('2026-10-08');
        expect(hook.result.current.changes).toEqual({ outcome: '新しい成果' });
        act(() => hook.result.current.clear());
    });
    it('保存・破棄した下書きは再訪時に復活しない', () => {
        const project = { id: 803, outcome: '', due_date: null };
        const hook = renderHook(() => useProjectDraft(project));
        act(() => hook.result.current.update('outcome', '下書き'));
        act(() => hook.result.current.clear());
        hook.unmount();
        expect(readProjectDraft(project.id)).toEqual({});
        expect(window.localStorage.getItem('yarukoto:project-context-draft:803')).toBeNull();
        const resumed = renderHook(() => useProjectDraft(project));
        expect(resumed.result.current.dirty).toBe(false);
    });
});
