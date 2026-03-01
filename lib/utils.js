/**
 * Shared utility functions used across the Yarukoto app.
 * Phase 0 extraction from refactoring-plan.md.
 */

/**
 * Returns the Tauri SQLite database instance (singleton).
 * Wraps the dynamic import + getDb() two-liner into a single async call.
 * @returns {Promise<import('@tauri-apps/plugin-sql').default>}
 */
export async function fetchDb() {
    const { getDb } = await import('@/lib/db');
    return getDb();
}

/**
 * Returns today's date as 'YYYY-MM-DD' string using sv-SE locale.
 * @returns {string}
 */
export function todayStr() {
    return new Date().toLocaleDateString('sv-SE');
}

/**
 * Formats a number of minutes into a human-readable string.
 * e.g. 90 → "1h 30分", 30 → "30分", 0 → "0分"
 * @param {number} m - minutes
 * @returns {string}
 */
export function formatMin(m) {
    if (!m || m <= 0) return '0分';
    if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60 ? m % 60 + '分' : ''}`.trim();
    return `${m}分`;
}

/**
 * Parses SQLite json_group_array results (tag_ids, tag_names, tag_colors)
 * from a row into a JS array of { id, name, color } objects.
 * @param {object} row - DB row with tag_ids, tag_names, tag_colors columns
 * @returns {Array<{id: number, name: string, color: string}>}
 */
export function parseTags(row) {
    return JSON.parse(row.tag_ids || '[]').map((id, index) => ({
        id,
        name: JSON.parse(row.tag_names || '[]')[index],
        color: JSON.parse(row.tag_colors || '[]')[index]
    })).filter(t => t.id);
}
