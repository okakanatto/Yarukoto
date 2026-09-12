export const DRAFT_BACKUP_PREFIX = 'yarukoto:db-restore-draft-backup:v1:';

const ACTIVE_DRAFT_PREFIXES = [
    'yarukoto:task-input-draft:v1:',
    'yarukoto:project-context-draft:',
];

// Keep opaque values intact: pending task/project IDs belong to the replaced DB.
// Write and verify the entire snapshot before removing any active draft key.
export function retireDraftsForDatabaseRestore(storage = window.localStorage, restoredAt = new Date().toISOString()) {
    const entries = [];
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key || !ACTIVE_DRAFT_PREFIXES.some(prefix => key.startsWith(prefix))) continue;
        const value = storage.getItem(key);
        if (value !== null) entries.push({ key, value });
    }
    if (!entries.length) return { backupKey: null, count: 0 };

    const baseKey = `${DRAFT_BACKUP_PREFIX}${restoredAt}`;
    let backupKey = baseKey;
    let suffix = 0;
    while (storage.getItem(backupKey) !== null) backupKey = `${baseKey}:${++suffix}`;
    const snapshot = JSON.stringify({ version: 1, restoredAt, entries });
    storage.setItem(backupKey, snapshot);
    if (storage.getItem(backupKey) !== snapshot) throw new Error('下書きの退避を確認できませんでした');

    for (const { key } of entries) {
        storage.removeItem(key);
        if (storage.getItem(key) !== null) throw new Error('下書きを使用中の保存先から外せませんでした');
    }
    return { backupKey, count: entries.length };
}
