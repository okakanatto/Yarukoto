const HOLIDAY_UPDATE_KEY = '__yarukoto_holiday_update_promise';

export function updateHolidayCache(db) {
    // Global singleton Promise: survives HMR and ensures exactly one execution
    if (globalThis[HOLIDAY_UPDATE_KEY]) return globalThis[HOLIDAY_UPDATE_KEY];
    globalThis[HOLIDAY_UPDATE_KEY] = _updateHolidayCacheImpl(db);
    return globalThis[HOLIDAY_UPDATE_KEY];
}

async function _updateHolidayCacheImpl(db) {
    try {
        // To keep up with newly announced holidays, we should re-fetch periodically.
        // We will check 'app_settings' for the last fetch date and re-fetch if it's been > 30 days.
        const settingRows = await db.select("SELECT value FROM app_settings WHERE key = 'holiday_last_fetch_date'");
        const lastFetchStr = settingRows.length > 0 ? settingRows[0].value : null;
        const todayStr = new Date().toISOString().split('T')[0];

        let shouldFetch = false;

        if (!lastFetchStr) {
            shouldFetch = true;
        } else {
            const lastDate = new Date(lastFetchStr);
            const todayDate = new Date(todayStr);
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
            if (diffDays > 30) {
                shouldFetch = true;
            }
        }

        // Failsafe: if somehow the table is empty, force fetch regardless of date
        const existing = await db.select('SELECT COUNT(*) as count FROM holidays');
        if ((existing[0]?.count || 0) === 0) {
            shouldFetch = true;
        }

        if (!shouldFetch) {
            console.log(`Holiday cache is valid (last fetched: ${lastFetchStr}), skipping fetch.`);
            return;
        }

        let fetchFn = fetch;
        try {
            if (window.__TAURI_INTERNALS__) {
                const tauriHttp = await import('@tauri-apps/plugin-http');
                fetchFn = tauriHttp.fetch;
            }
        } catch (e) {
            console.warn('Tauri HTTP plugin not available, falling back to native fetch', e);
        }

        const response = await fetchFn('https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', {
            method: 'GET',
        });

        if (!response.ok) {
            console.warn('Failed to fetch holidays CSV. Using existing cache if available.');
            return;
        }

        // CSV response is usually Shift_JIS, but recent versions use modern encodings or standard.
        // We will decode as best-effort. Node fetch doesn't auto-decode Shift_JIS easily,
        // but JavaScript TextDecoder works in standard browsers/Tauri.
        const arrayBuffer = await response.arrayBuffer();
        const decoder = new TextDecoder('shift_jis');
        let csvText = decoder.decode(arrayBuffer);

        // Fallback or handle cases if it was UTF-8
        if (csvText.indexOf('\ufffd') > -1) {
            const utf8Decoder = new TextDecoder('utf-8');
            csvText = utf8Decoder.decode(arrayBuffer);
        }

        const lines = csvText.split('\n');

        // Build a single bulk INSERT statement to avoid SQLite connection pool deadlocks and lock contention.
        // Tauri plugin-sql uses a Rust connection pool. Calling db.execute() 500 times individually floods the pool
        // and creates severe contention with concurrent UI SELECT queries, leading to 'database is locked' errors.

        let valueStrings = [];
        let params = [];
        let pCount = 1;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Format: 1955/01/01,元日
            const parts = line.split(',');
            if (parts.length >= 2) {
                const dateStr = parts[0].trim();
                const name = parts[1].trim();

                // Normalizing date to YYYY-MM-DD
                const dateParts = dateStr.split('/');
                if (dateParts.length === 3) {
                    const year = dateParts[0];
                    const month = dateParts[1].padStart(2, '0');
                    const day = dateParts[2].padStart(2, '0');
                    const normalizedDate = `${year}-${month}-${day}`;

                    valueStrings.push(`($${pCount++}, $${pCount++})`);
                    params.push(normalizedDate, name);
                }
            }
        }

        if (valueStrings.length > 0) {
            // SQLite natively supports chunks of inserts, typically up to 32766 parameters per statement.
            // Since we have ~500 entries (1000 params), a single statement is perfectly safe and extremely fast.
            const sql = `INSERT OR IGNORE INTO holidays (date, name) VALUES ${valueStrings.join(', ')}`;
            await db.execute(sql, params);
            console.log(`Holiday cache populated. Mass inserted ${valueStrings.length} holidays in one transaction.`);
        }

        // Record the fetch date so we don't fetch again for another 30 days
        await db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('holiday_last_fetch_date', $1)", [todayStr]);

        // Invalidate memory cache so next read uses fresh data from DB
        holidayCache = null;

    } catch (err) {
        console.error('Error updating holiday cache:', err);
        // Silently let it fail so app startup won't block, e.g. when offline
    }
}

/**
 * Parses days of week string like "1,3,5" into an array of numbers.
 */
function parseDaysOfWeek(str) {
    if (!str) return [];
    return str.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
}

// Global memory cache for holidays to prevent N+1 DB queries
let holidayCache = null;

async function loadHolidayCache(db) {
    if (holidayCache) return holidayCache;
    try {
        const rows = await db.select('SELECT date FROM holidays');
        holidayCache = new Set(rows.map(r => r.date));
    } catch (e) {
        console.error("Failed to load holiday cache into memory", e);
        holidayCache = new Set();
    }
    return holidayCache;
}

/**
 * Checks if a date string 'YYYY-MM-DD' is a weekend or holiday.
 * Uses an in-memory Set to avoid N+1 DB query issues in tight loops.
 */
export async function isHolidayOrWeekend(db, dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
        return true; // Weekend
    }

    const holidays = await loadHolidayCache(db);
    return holidays.has(dateStr);
}

/**
 * Core logic to check if a specific routine should run on the target date.
 * Takes the routine object from the DB, the target date string, and the database instance (for holiday lookup).
 * 
 * Target date format: 'YYYY-MM-DD'
 */
export async function isRoutineActiveOnDate(db, routine, targetDateStr) {
    if (routine.enabled === 0) return false;

    // Check end_date
    if (routine.end_date && targetDateStr > routine.end_date) {
        return false;
    }

    const targetDate = new Date(targetDateStr + 'T00:00:00');

    // First, let's identify what the "intended/base" dates for this routine are.
    // Instead of iterating through all days, we reverse the logic: 
    // Since we want to know if targetDateStr is active, we check its nearby days to see if they were shifted to today.
    // However, the cleanest logic is: does the target date match the effective date of a scheduled occurrence near today?

    // Because shifts can move a task by a few days, we'll check the base schedule for 
    // [targetDate - 7 days] to [targetDate + 7 days] range.

    for (let offset = -7; offset <= 7; offset++) {
        const baseDate = new Date(targetDate);
        baseDate.setDate(targetDate.getDate() + offset);
        const baseDateStr = baseDate.toLocaleDateString('sv-SE');

        // Is baseDate a scheduled day for this routine?
        let isScheduled = false;

        if (routine.frequency === 'daily') {
            // weekdays_only: skip weekends (Sat=6, Sun=0) unless holiday_action handles shifting
            if (routine.weekdays_only === 1) {
                const dow = baseDate.getDay();
                isScheduled = (dow !== 0 && dow !== 6);
            } else {
                isScheduled = true;
            }
        }
        else if (routine.frequency === 'weekly') {
            const dow = baseDate.getDay();
            const selectedDays = parseDaysOfWeek(routine.days_of_week);
            if (selectedDays.includes(dow)) {
                isScheduled = true;
            }
        }
        else if (routine.frequency === 'monthly') {
            if (routine.monthly_type === 'end_of_month') {
                // Check if baseDate is the last day of its month
                const nextDay = new Date(baseDate);
                nextDay.setDate(nextDay.getDate() + 1);
                if (nextDay.getDate() === 1) {
                    isScheduled = true;
                }
            } else {
                // Fixed date
                if (baseDate.getDate() === routine.day_of_month) {
                    isScheduled = true;
                }
            }
        }

        if (isScheduled) {
            // Apply holiday action to baseDate to get the effectiveDate
            const effectiveDateStr = await getEffectiveDate(db, baseDateStr, routine.holiday_action);

            // If the effective date matching this schedule is our target date, then yes!
            if (effectiveDateStr === targetDateStr) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Calculates the shifted effective date given a base date and an action rule.
 * actions: 'none', 'skip', 'forward', 'backward'
 */
async function getEffectiveDate(db, baseDateStr, action) {
    // Legacy mapping (weekdays_only) maps to 'skip' in the UI/data translation, 
    // but just in case, we default to 'none'.
    if (!action) action = 'none';

    if (action === 'none') {
        return baseDateStr;
    }

    const isBaseHoliday = await isHolidayOrWeekend(db, baseDateStr);

    if (!isBaseHoliday) {
        return baseDateStr; // Normal day
    }

    if (action === 'skip') {
        return null; // Should not run
    }

    if (action === 'forward') {
        // Shift to the *previous* available business day
        let current = new Date(baseDateStr + 'T00:00:00');
        let attempts = 0;
        while (attempts < 14) { // safety limit
            current.setDate(current.getDate() - 1);
            const checkStr = current.toLocaleDateString('sv-SE');
            const isH = await isHolidayOrWeekend(db, checkStr);
            if (!isH) return checkStr;
            attempts++;
        }
        return null;
    }

    if (action === 'backward') {
        // Shift to the *next* available business day
        let current = new Date(baseDateStr + 'T00:00:00');
        let attempts = 0;
        while (attempts < 14) {
            current.setDate(current.getDate() + 1);
            const checkStr = current.toLocaleDateString('sv-SE');
            const isH = await isHolidayOrWeekend(db, checkStr);
            if (!isH) return checkStr;
            attempts++;
        }
        return null;
    }

    return baseDateStr;
}
