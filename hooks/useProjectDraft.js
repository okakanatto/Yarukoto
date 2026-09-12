'use client';

import { useRef, useState } from 'react';

const cache = new Map();
const keyFor = id => `yarukoto:project-context-draft:${id}`;
const validChanges = value => Object.fromEntries(['outcome', 'due_date']
    .filter(field => typeof value?.[field] === 'string').map(field => [field, value[field]]));

export function readProjectDraft(id) {
    try {
        const stored = typeof window !== 'undefined' && window.localStorage.getItem(keyFor(id));
        if (stored) {
            const changes = validChanges(JSON.parse(stored));
            cache.set(id, changes);
            return changes;
        }
    } catch { /* The in-process copy still protects ordinary navigation. */ }
    return cache.get(id) || {};
}

function persist(id, changes) {
    if (Object.keys(changes).length) cache.set(id, changes);
    else cache.delete(id);
    try {
        if (Object.keys(changes).length) window.localStorage.setItem(keyFor(id), JSON.stringify(changes));
        else window.localStorage.removeItem(keyFor(id));
        return true;
    } catch { return false; }
}

// Mount with key={project.id}. Untouched fields always use fresh DB values.
export function useProjectDraft(project) {
    const [changes, setChanges] = useState(() => readProjectDraft(project.id));
    const [persisted, setPersisted] = useState(true);
    const current = useRef(changes);
    const update = (field, value) => {
        const next = { ...current.current };
        if (value === (project[field] || '')) delete next[field];
        else next[field] = value;
        current.current = next;
        setPersisted(persist(project.id, next));
        setChanges(next);
    };
    const clear = () => {
        current.current = {};
        persist(project.id, {});
        setChanges({});
    };
    return {
        changes,
        outcome: changes.outcome ?? project.outcome ?? '',
        dueDate: changes.due_date ?? project.due_date ?? '',
        dirty: Object.entries(changes).some(([field, value]) => value !== (project[field] || '')),
        persisted, update, clear,
    };
}
