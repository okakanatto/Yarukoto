import { useMemo } from 'react';

/**
 * Generates filter option arrays for MultiSelectFilter components.
 * Shared between TaskList, routines/page.js and today/page.js.
 *
 * @param {Array} statuses  - status_master rows
 * @param {Array} tags      - tags rows
 * @param {Array} importance - importance_master rows
 * @param {Array} urgency   - urgency_master rows
 * @param {Array} [projects] - projects rows (optional)
 * @returns {{ statusOptions, tagOptions, importanceOptions, urgencyOptions, projectOptions }}
 */
export function useFilterOptions(statuses, tags, importance, urgency, projects = []) {
    const statusOptions = useMemo(
        () => statuses.map(s => ({ value: s.code, label: s.label, color: s.color })),
        [statuses]
    );
    const tagOptions = useMemo(
        () => tags.filter(t => !t.archived).map(t => ({ value: t.id, label: t.name, color: t.color })),
        [tags]
    );
    const importanceOptions = useMemo(
        () => importance.map(i => ({ value: i.level, label: i.label, color: i.color })),
        [importance]
    );
    const urgencyOptions = useMemo(
        () => urgency.map(u => ({ value: u.level, label: u.label, color: u.color })),
        [urgency]
    );
    const projectOptions = useMemo(
        () => projects.map(p => ({ value: p.id, label: p.name, color: p.color })),
        [projects]
    );

    return { statusOptions, tagOptions, importanceOptions, urgencyOptions, projectOptions };
}
