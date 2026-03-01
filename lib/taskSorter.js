/**
 * Shared task sorting logic.
 * Extracted from TaskList.js and today/page.js (Phase 0).
 */

/**
 * Sort key definitions for the sort dropdown.
 */
export const SORT_OPTIONS = [
    { key: 'created_desc', label: '作成日（新しい順）' },
    { key: 'created_asc', label: '作成日（古い順）' },
    { key: 'due_asc', label: '期限日（近い順）' },
    { key: 'due_desc', label: '期限日（遠い順）' },
    { key: 'importance', label: '重要度（高い順）' },
    { key: 'urgency', label: '緊急度（高い順）' },
    { key: 'title', label: 'タイトル（あいう順）' },
    { key: 'status', label: 'ステータス順' },
    { key: 'tag', label: 'タグ順' },
];

/**
 * Comparator function for sorting tasks by the given sortKey.
 * Used by both TaskList (parent tasks) and today/page (unified tasks).
 *
 * @param {string} sortKey - one of the SORT_OPTIONS keys, or 'priority'
 * @param {Array} statuses - status_master rows (needed for 'status' sort)
 * @returns {(a: object, b: object) => number} comparator
 */
export function taskComparator(sortKey, statuses = []) {
    return (a, b) => {
        switch (sortKey) {
            case 'created_desc':
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            case 'created_asc':
                return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            case 'due_asc': {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
            }
            case 'due_desc': {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(b.due_date) - new Date(a.due_date);
            }
            case 'importance':
                return (b.importance_level || 0) - (a.importance_level || 0);
            case 'urgency':
                return (b.urgency_level || 0) - (a.urgency_level || 0);
            case 'title':
                return (a.title || '').localeCompare(b.title || '', 'ja');
            case 'status': {
                const aOrder = statuses.find(s => s.code === a.status_code)?.sort_order || 0;
                const bOrder = statuses.find(s => s.code === b.status_code)?.sort_order || 0;
                return aOrder - bOrder;
            }
            case 'tag': {
                const aTag = a.tags && a.tags.length > 0 ? a.tags[0].name : '\uFFFF';
                const bTag = b.tags && b.tags.length > 0 ? b.tags[0].name : '\uFFFF';
                return aTag.localeCompare(bTag, 'ja');
            }
            case 'priority':
            default: {
                const aDone = a.status_code === 3;
                const bDone = b.status_code === 3;
                if (aDone && !bDone) return 1;
                if (!aDone && bDone) return -1;
                const aImp = a.importance_level || 0;
                const bImp = b.importance_level || 0;
                if (aImp !== bImp) return bImp - aImp;
                const aUrg = a.urgency_level || 0;
                const bUrg = b.urgency_level || 0;
                if (aUrg !== bUrg) return bUrg - aUrg;
                return 0;
            }
        }
    };
}
