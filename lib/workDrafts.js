const drafts = new Map();
const keyFor = id => `yarukoto:work-draft:v1:${id}`;

// Include volatile edits when storage was unavailable. The caller must preserve
// this snapshot before clearing the cache for a database identity change.
export function snapshotWorkDraftCache() {
    return [...drafts].filter(([, value]) => value !== undefined)
        .map(([id, value]) => ({ key: keyFor(id), value: JSON.stringify(value) }));
}

export function clearWorkDraftCache() {
    drafts.clear();
}

export function readWorkDraft(id) {
    if (drafts.has(id)) return drafts.get(id);
    try {
        const value = JSON.parse(localStorage.getItem(keyFor(id)) || 'null');
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const fields = value.fields && typeof value.fields === 'object' ? Object.fromEntries(
                ['notes', 'source_ref', 'next_step', 'waiting_on', 'review_date', 'next_task_id']
                    .filter(name => typeof value.fields[name] === 'string').map(name => [name, value.fields[name]])
            ) : undefined;
            const draft = { fields, childText: typeof value.childText === 'string' ? value.childText : '' };
            drafts.set(id, draft);
            return draft;
        }
    } catch { /* The current session can still keep edits if storage is unavailable. */ }
    return undefined;
}

export function writeWorkDraft(id, value) {
    drafts.set(id, value);
    try { localStorage.setItem(keyFor(id), JSON.stringify(value)); return true; }
    catch { return false; }
}

export function clearWorkDraft(id) {
    // Keep a tombstone in this process if disk removal fails, so revisiting a
    // saved task cannot restore an obsolete draft from the storage fallback.
    drafts.set(id, undefined);
    try { localStorage.removeItem(keyFor(id)); return true; }
    catch {
        try { localStorage.setItem(keyFor(id), 'null'); return true; }
        catch { return false; }
    }
}
