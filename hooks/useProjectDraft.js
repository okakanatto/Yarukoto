'use client';

import { useRef, useState } from 'react';
import { readProjectDraft, writeProjectDraft } from '@/lib/projectDrafts';
export { readProjectDraft } from '@/lib/projectDrafts';

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
        setPersisted(writeProjectDraft(project.id, next));
        setChanges(next);
    };
    const clear = () => {
        current.current = {};
        writeProjectDraft(project.id, {});
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
