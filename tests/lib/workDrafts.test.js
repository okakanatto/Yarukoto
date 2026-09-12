/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { localStorage.clear(); vi.resetModules(); });
afterEach(() => vi.restoreAllMocks());

describe('work drafts across app restarts', () => {
    it('restores changed fields after the module is loaded in a new session', async () => {
        const initial = await import('@/lib/workDrafts');
        expect(initial.writeWorkDraft(501, { fields: { next_step: '例外を5件見る', notes: '通常分は確認済み' }, childText: '作成途中の子' })).toBe(true);
        vi.resetModules();
        const restored = await import('@/lib/workDrafts');
        expect(restored.readWorkDraft(501)).toEqual({ fields: { next_step: '例外を5件見る', notes: '通常分は確認済み' }, childText: '作成途中の子' });
    });

    it('retains the current edit when local storage is unavailable and reports that failure', async () => {
        const drafts = await import('@/lib/workDrafts');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        const draft = { fields: { notes: '失わないメモ' }, childText: '' };
        expect(drafts.writeWorkDraft(502, draft)).toBe(false);
        expect(drafts.readWorkDraft(502)).toEqual(draft);
    });

    it('does not restore an obsolete draft after saving when removal alone fails', async () => {
        const drafts = await import('@/lib/workDrafts');
        drafts.writeWorkDraft(503, { fields: { notes: '保存前' }, childText: '' });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
        expect(drafts.clearWorkDraft(503)).toBe(true);
        vi.resetModules();
        const restarted = await import('@/lib/workDrafts');
        expect(restarted.readWorkDraft(503)).toBeUndefined();
    });

    it('ignores corrupt storage and never restores unrelated task properties', async () => {
        localStorage.setItem('yarukoto:work-draft:v1:504', '{broken');
        localStorage.setItem('yarukoto:work-draft:v1:505', JSON.stringify({ fields: { notes: '手元のメモ', due_date: '2030-01-01', status_code: 3 }, childText: 123 }));
        const drafts = await import('@/lib/workDrafts');
        expect(drafts.readWorkDraft(504)).toBeUndefined();
        expect(drafts.readWorkDraft(505)).toEqual({ fields: { notes: '手元のメモ' }, childText: '' });
    });
});
