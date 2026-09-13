/** Work results are user-written. Opening or creating a task is not a result. */
export function readWorkEntries(task) {
    try {
        const entries = JSON.parse(task?.work_log || '[]');
        return Array.isArray(entries) ? entries.filter(entry => entry && typeof entry === 'object' && typeof entry.created_at === 'string')
            .map(entry => ({ ...entry,
                id: typeof entry.id === 'string' || typeof entry.id === 'number' ? entry.id : entry.created_at,
                result: typeof entry.result === 'string' ? entry.result : '',
                consumed_step: typeof entry.consumed_step === 'string' ? entry.consumed_step : '',
                kind: typeof entry.kind === 'string' ? entry.kind : 'pause',
            })) : [];
    } catch { return []; }
}

function localTimestamp() {
    const now = new Date();
    return `${now.toLocaleString('sv-SE')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}

/** Build one atomic notes + memo-event fragment for an UPDATE statement. */
export function memoChangeAssignments(bind, notes) {
    const entry = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        created_at: localTimestamp(), kind: 'memo', memo: notes, consumed_step: '', result: '',
    };
    const notesAssignment = bind(notes);
    const notesComparison = bind(notes);
    const serialized = JSON.stringify(entry);
    const replaceMemo = bind(serialized);
    const appendMemo = bind(serialized);
    const initializeMemo = bind(serialized);
    const recoverMemo = bind(serialized);
    return [
        `notes = ${notesAssignment}`,
        `work_log = CASE
          WHEN COALESCE(notes, '') = ${notesComparison} THEN work_log
          WHEN json_valid(work_log) THEN CASE
            WHEN json_type(work_log) = 'array' AND json_array_length(work_log) > 0
              AND json_extract(work_log, '$[#-1].kind') = 'memo'
              THEN json_replace(work_log, '$[#-1]', json(${replaceMemo}))
            WHEN json_type(work_log) = 'array' THEN json_insert(work_log, '$[#]', json(${appendMemo}))
            ELSE json_insert('[]', '$[#]', json(${initializeMemo})) END
          ELSE json_insert('[]', '$[#]', json(${recoverMemo})) END`,
    ];
}

function latestEntry(entries, predicate) {
    return entries.reduce((latest, entry, index) => {
        if (!predicate(entry) || !entry.created_at?.trim()) return latest;
        if (!latest || entry.created_at > latest.entry.created_at
            || (entry.created_at === latest.entry.created_at && index > latest.index)) return { entry, index };
        return latest;
    }, null)?.entry || null;
}

const linesOf = text => String(text || '').split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);

export function captureExcerpt(task) {
    const lines = linesOf(task.capture_text);
    // The generated heading already represents the first line; show its context.
    if (lines[0]?.slice(0, 100) === task.title?.trim()) lines.shift();
    return lines.join(' ') || (task.source_ref || '');
}

export function workSummary(task) {
    const entries = readWorkEntries(task);
    const result = latestEntry(entries, entry => entry.kind !== 'memo' && entry.result?.trim());
    const rawNotes = String(task.notes || '');
    const notes = rawNotes.trim();
    // A memo only has a meaningful date when the current value matches a saved
    // memo snapshot. Notes imported before memo events stay undated background.
    const memo = latestEntry(entries, entry => notes && entry.kind === 'memo' && entry.memo === rawNotes);
    const capture = captureExcerpt(task);
    const updates = [
        result && { kind: 'result', text: result.result, created_at: result.created_at, index: entries.indexOf(result) },
        memo && { kind: 'memo', text: notes, created_at: memo.created_at, index: entries.indexOf(memo) },
    ].filter(Boolean);
    const selectedUpdate = updates.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.index - a.index)[0] || null;
    const latestUpdate = selectedUpdate && { kind: selectedUpdate.kind, text: selectedUpdate.text, created_at: selectedUpdate.created_at };
    const context = latestUpdate?.text || notes || capture;
    const contextKind = latestUpdate?.kind || (notes ? 'memo' : 'capture');
    const backgroundText = latestUpdate?.kind === 'result' ? (notes || capture) : capture;
    return { step: task.next_task_title || task.next_step || '',
        context, contextKind,
        result: result?.result || '', memo: notes,
        latestUpdate,
        background: backgroundText ? { kind: latestUpdate?.kind === 'result' && notes ? 'memo' : 'capture', text: backgroundText } : null,
        lastEntry: entries.at(-1) || null };
}
