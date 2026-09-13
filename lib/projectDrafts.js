const cache = new Map();
const keyFor = id => `yarukoto:project-context-draft:${id}`;
const validChanges = value => Object.fromEntries(['outcome', 'due_date']
    .filter(field => typeof value?.[field] === 'string').map(field => [field, value[field]]));

export function snapshotProjectDraftCache() {
    return [...cache].filter(([, value]) => value !== undefined)
        .map(([id, value]) => ({ key: keyFor(id), value: JSON.stringify(value) }));
}

export function clearProjectDraftCache() {
    cache.clear();
}

export function readProjectDraft(id) {
    // A newer in-memory edit can exist when writing localStorage failed.
    if (cache.has(id)) return cache.get(id) || {};
    try {
        const stored = typeof window !== 'undefined' && window.localStorage.getItem(keyFor(id));
        if (stored) {
            const changes = validChanges(JSON.parse(stored));
            cache.set(id, changes);
            return changes;
        }
    } catch { /* The in-process copy still protects ordinary navigation. */ }
    return {};
}

export function writeProjectDraft(id, changes) {
    // Keep a tombstone after clearing so a failed storage removal cannot
    // resurrect the saved or discarded draft during this process.
    cache.set(id, Object.keys(changes).length ? changes : undefined);
    try {
        if (Object.keys(changes).length) window.localStorage.setItem(keyFor(id), JSON.stringify(changes));
        else window.localStorage.removeItem(keyFor(id));
        return true;
    } catch { return false; }
}
