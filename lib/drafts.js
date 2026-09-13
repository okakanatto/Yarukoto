import { clearWorkDraftCache, snapshotWorkDraftCache } from './workDrafts';
import { clearProjectDraftCache, snapshotProjectDraftCache } from './projectDrafts';

export const DRAFT_BACKUP_PREFIX = 'yarukoto:db-restore-draft-backup:v1:';

const ACTIVE_DRAFT_PREFIXES = [
    'yarukoto:task-input-draft:v1:',
    'yarukoto:project-context-draft:',
    'yarukoto:work-draft:v1:',
];
const ACTIVE_DRAFT_KEYS = new Set(['yarukoto:work-selection', 'yarukoto:work-review:v1']);

// Keep opaque values intact: pending task/project IDs belong to the replaced DB.
// Write and verify the entire snapshot before removing any active draft key.
export function retireDraftsForDatabaseRestore(storage = window.localStorage, restoredAt = new Date().toISOString()) {
    const entries = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key || (!ACTIVE_DRAFT_KEYS.has(key) && !ACTIVE_DRAFT_PREFIXES.some(prefix => key.startsWith(prefix)))) continue;
        const value = storage.getItem(key);
        if (value !== null) entries.push({ key, value });
    }
    const cachedEntries = [...snapshotWorkDraftCache(), ...snapshotProjectDraftCache()];
    const persistedByKey = new Map(entries.map(entry => [entry.key, entry.value]));
    // A failed earlier localStorage write can leave a newer in-memory version.
    // Preserve both versions without rewriting the opaque stored original.
    const memoryEntries = cachedEntries.filter(entry => persistedByKey.has(entry.key) && persistedByKey.get(entry.key) !== entry.value);
    for (const entry of cachedEntries) if (!persistedByKey.has(entry.key)) entries.push(entry);
    if (!entries.length) { clearWorkDraftCache(); clearProjectDraftCache(); return { backupKey: null, count: 0 }; }

    const baseKey = `${DRAFT_BACKUP_PREFIX}${restoredAt}`;
    let backupKey = baseKey;
    let suffix = 0;
    while (storage.getItem(backupKey) !== null) backupKey = `${baseKey}:${++suffix}`;
    const snapshot = JSON.stringify({ version: 1, restoredAt, entries, ...(memoryEntries.length ? { memoryEntries } : {}) });
    storage.setItem(backupKey, snapshot);
    if (storage.getItem(backupKey) !== snapshot) throw new Error('下書きの退避を確認できませんでした');

    for (const { key } of entries) {
        storage.removeItem(key);
        if (storage.getItem(key) !== null) throw new Error('下書きを使用中の保存先から外せませんでした');
    }
    // Do this only after verified backup and removal. A relaunch can fail after
    // restore; the live process must not apply the previous DB's ID-based cache.
    clearWorkDraftCache();
    clearProjectDraftCache();
    return { backupKey, count: entries.length };
}
