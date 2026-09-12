// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_BACKUP_PREFIX, retireDraftsForDatabaseRestore } from '@/lib/drafts';

const taskKey = 'yarukoto:task-input-draft:v1:work';
const projectKey = 'yarukoto:project-context-draft:1';
const timestamp = '2026-09-12T12:00:00.000Z';
const original = '{"title":"一行目\\n背景","pendingTask":{"id":1}}';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('復元前DBに属する下書きの退避', () => {
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
