// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_BACKUP_PREFIX, retireDraftsForDatabaseRestore } from '@/lib/drafts';
import { clearWorkDraftCache, readWorkDraft, writeWorkDraft } from '@/lib/workDrafts';
import { clearProjectDraftCache, readProjectDraft, writeProjectDraft } from '@/lib/projectDrafts';

const taskKey = 'yarukoto:task-input-draft:v1:work';
const projectKey = 'yarukoto:project-context-draft:1';
const timestamp = '2026-09-12T12:00:00.000Z';
const original = '{"title":"一行目\\n背景","pendingTask":{"id":1}}';

beforeEach(() => { localStorage.clear(); clearWorkDraftCache(); clearProjectDraftCache(); });
afterEach(() => vi.restoreAllMocks());

describe('復元前DBに属する下書きの退避', () => {
    it('以前のDBの見返し位置も退避し、新DBの同じIDには引き継がない', () => {
        const key = 'yarukoto:work-review:v1';
        const originalReview = JSON.stringify({ open: true, current: '[8]', seen: ['[7]'] });
        localStorage.setItem(key, originalReview);
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        expect(localStorage.getItem(key)).toBeNull();
        expect(JSON.parse(localStorage.getItem(result.backupKey)).entries).toContainEqual({ key, value: originalReview });
    });
    it('再起動に失敗しても旧プロジェクトの成果・期限を復元DBの同じIDへ適用しない', () => {
        const draft = { outcome: '旧案件の合意', due_date: '2026-09-30' };
        expect(writeProjectDraft(1, draft)).toBe(true);
        expect(readProjectDraft(1)).toEqual(draft);
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        expect(JSON.parse(localStorage.getItem(result.backupKey)).entries).toEqual([{ key: projectKey, value: JSON.stringify(draft) }]);
        expect(localStorage.getItem(projectKey)).toBeNull();
        expect(readProjectDraft(1)).toEqual({});
        writeProjectDraft(1, { outcome: '復元した案件の合意' });
        expect(readProjectDraft(1)).toEqual({ outcome: '復元した案件の合意' });
    });
    it('プロジェクト下書きの保存失敗後の最新値も退避し、失敗中に古い保存値へ戻さない', () => {
        const old = { outcome: '保存された成果' };
        const latest = { outcome: '最新の成果', due_date: '2026-10-01' };
        writeProjectDraft(1, old);
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
        expect(writeProjectDraft(1, latest)).toBe(false);
        expect(readProjectDraft(1)).toEqual(latest);
        set.mockRestore();
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        const snapshot = JSON.parse(localStorage.getItem(result.backupKey));
        expect(snapshot.entries).toEqual([{ key: projectKey, value: JSON.stringify(old) }]);
        expect(snapshot.memoryEntries).toEqual([{ key: projectKey, value: JSON.stringify(latest) }]);
        expect(readProjectDraft(1)).toEqual({});
    });
    it('プロジェクトのメモリだけの下書きも退避し、退避に失敗したらキャッシュを保つ', () => {
        const draft = { outcome: 'メモリだけの成果' };
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        expect(writeProjectDraft(1, draft)).toBe(false);
        expect(() => retireDraftsForDatabaseRestore(localStorage, timestamp)).toThrow('quota');
        expect(readProjectDraft(1)).toEqual(draft);
        set.mockRestore();
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        expect(JSON.parse(localStorage.getItem(result.backupKey)).entries).toEqual([{ key: projectKey, value: JSON.stringify(draft) }]);
        expect(readProjectDraft(1)).toEqual({});
    });
    it('仕事メモと選択IDを退避し、再起動に失敗しても同じIDへ旧キャッシュを復活させない', () => {
        const workKey = 'yarukoto:work-draft:v1:1';
        const oldDraft = { fields: { notes: '旧DBの仕事の背景\n次の確認', next_step: '旧案件の一歩' }, childText: '作成途中' };
        expect(writeWorkDraft(1, oldDraft)).toBe(true);
        expect(readWorkDraft(1)).toEqual(oldDraft);
        localStorage.setItem('yarukoto:work-selection', '1');
        localStorage.setItem('yarukoto:work-selection-extra', 'keep');
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        expect(result.count).toBe(2);
        expect(JSON.parse(localStorage.getItem(result.backupKey)).entries).toEqual([
            { key: workKey, value: JSON.stringify(oldDraft) }, { key: 'yarukoto:work-selection', value: '1' },
        ]);
        expect(localStorage.getItem(workKey)).toBeNull();
        expect(localStorage.getItem('yarukoto:work-selection')).toBeNull();
        expect(localStorage.getItem('yarukoto:work-selection-extra')).toBe('keep');
        // Same module instance, representing a failed relaunch after DB replacement.
        expect(readWorkDraft(1)).toBeUndefined();
        const newDraft = { fields: { notes: '復元した別DBの仕事' }, childText: '' };
        writeWorkDraft(1, newDraft);
        expect(readWorkDraft(1)).toEqual(newDraft);
    });

    it('保存先に書けなかったメモリ上だけの変更も退避してから解除する', () => {
        const draft = { fields: { notes: 'メモリだけの重要な背景' }, childText: '' };
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
        expect(writeWorkDraft(7, draft)).toBe(false);
        set.mockRestore();
        expect(localStorage.getItem('yarukoto:work-draft:v1:7')).toBeNull();
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        expect(JSON.parse(localStorage.getItem(result.backupKey)).entries).toEqual([{ key: 'yarukoto:work-draft:v1:7', value: JSON.stringify(draft) }]);
        expect(readWorkDraft(7)).toBeUndefined();
    });

    it('保存済み本文と更新に失敗した最新メモリ本文の両方を保持する', () => {
        const oldDraft = { fields: { notes: '保存先の原文' }, childText: '' };
        const latestDraft = { fields: { notes: '保存失敗後の最新原文' }, childText: '最新の子' };
        writeWorkDraft(8, oldDraft);
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
        expect(writeWorkDraft(8, latestDraft)).toBe(false);
        set.mockRestore();
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        const snapshot = JSON.parse(localStorage.getItem(result.backupKey));
        expect(snapshot.entries).toEqual([{ key: 'yarukoto:work-draft:v1:8', value: JSON.stringify(oldDraft) }]);
        expect(snapshot.memoryEntries).toEqual([{ key: 'yarukoto:work-draft:v1:8', value: JSON.stringify(latestDraft) }]);
        expect(readWorkDraft(8)).toBeUndefined();
    });

    it('退避保存または解除の失敗時はMapを消さず、本文は退避に残す', () => {
        const draft = { fields: { notes: '退避対象の背景' }, childText: '' };
        writeWorkDraft(9, draft);
        localStorage.setItem('yarukoto:work-selection', '9');
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('backup failed'); });
        expect(() => retireDraftsForDatabaseRestore(localStorage, timestamp)).toThrow('backup failed');
        expect(readWorkDraft(9)).toEqual(draft);
        set.mockRestore();
        const remove = Storage.prototype.removeItem;
        const removeSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key) {
            if (key === 'yarukoto:work-selection') throw new Error('remove failed');
            return remove.call(this, key);
        });
        expect(() => retireDraftsForDatabaseRestore(localStorage, timestamp)).toThrow('remove failed');
        expect(readWorkDraft(9)).toEqual(draft);
        expect(JSON.parse(localStorage.getItem(`${DRAFT_BACKUP_PREFIX}${timestamp}`)).entries[0].value).toBe(JSON.stringify(draft));
        removeSpy.mockRestore();
        retireDraftsForDatabaseRestore(localStorage, timestamp);
        expect(readWorkDraft(9)).toBeUndefined();
    });
    it('対象prefixだけを原文のまま退避し、他の設定や以前の退避分を保つ', () => {
        localStorage.setItem(taskKey, original);
        localStorage.setItem(projectKey, '{malformed but preserved');
        localStorage.setItem('yarukoto:theme', 'dark');
        localStorage.setItem(`${DRAFT_BACKUP_PREFIX}previous`, 'previous snapshot');
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        const snapshot = JSON.parse(localStorage.getItem(result.backupKey));
        expect(snapshot.entries).toEqual([
            { key: taskKey, value: original },
            { key: projectKey, value: '{malformed but preserved' },
        ]);
        expect(result.count).toBe(2);
        expect(localStorage.getItem(taskKey)).toBeNull();
        expect(localStorage.getItem(projectKey)).toBeNull();
        expect(localStorage.getItem('yarukoto:theme')).toBe('dark');
        expect(localStorage.getItem(`${DRAFT_BACKUP_PREFIX}previous`)).toBe('previous snapshot');
    });

    it('同じ時刻の退避先があっても上書きせず、下書きがなければ書き込まない', () => {
        localStorage.setItem(`${DRAFT_BACKUP_PREFIX}${timestamp}`, 'previous');
        expect(retireDraftsForDatabaseRestore(localStorage, timestamp)).toEqual({ backupKey: null, count: 0 });
        localStorage.setItem(taskKey, original);
        const result = retireDraftsForDatabaseRestore(localStorage, timestamp);
        expect(result.backupKey).toBe(`${DRAFT_BACKUP_PREFIX}${timestamp}:1`);
        expect(localStorage.getItem(`${DRAFT_BACKUP_PREFIX}${timestamp}`)).toBe('previous');
    });

    it('退避保存が失敗した場合はactiveキーを一つも消さない', () => {
        localStorage.setItem(taskKey, original);
        localStorage.setItem(projectKey, 'project draft');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        expect(() => retireDraftsForDatabaseRestore(localStorage, timestamp)).toThrow('quota');
        expect(localStorage.getItem(taskKey)).toBe(original);
        expect(localStorage.getItem(projectKey)).toBe('project draft');
    });

    it('保存内容を読み戻せなければactiveキーを消さない', () => {
        localStorage.setItem(taskKey, original);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
        expect(() => retireDraftsForDatabaseRestore(localStorage, timestamp)).toThrow('退避を確認');
        expect(localStorage.getItem(taskKey)).toBe(original);
    });

    it('activeキーの削除が途中で失敗してもすべての元本文が退避先に残る', () => {
        localStorage.setItem(taskKey, original);
        localStorage.setItem(projectKey, 'project draft');
        const remove = Storage.prototype.removeItem;
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key) {
            if (key === projectKey) throw new Error('remove failed');
            return remove.call(this, key);
        });
        expect(() => retireDraftsForDatabaseRestore(localStorage, timestamp)).toThrow('remove failed');
        const entries = JSON.parse(localStorage.getItem(`${DRAFT_BACKUP_PREFIX}${timestamp}`)).entries;
        expect(entries).toEqual([{ key: taskKey, value: original }, { key: projectKey, value: 'project draft' }]);
    });
});
