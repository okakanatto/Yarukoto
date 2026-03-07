/**
 * Date utility functions used across the Yarukoto app.
 * Extracted from today/page.js and done/page.js (IMP-16).
 */

/**
 * Formats a Date object as 'YYYY-MM-DD' string using sv-SE locale.
 * @param {Date} d
 * @returns {string}
 */
export function toDateStr(d) {
    return d.toLocaleDateString('sv-SE');
}

/**
 * Returns a new Date that is `days` days after `base`.
 * @param {Date|string} base
 * @param {number} days
 * @returns {Date}
 */
export function addDays(base, days) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
}
