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

const linesOf = text => String(text || '').split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);

export function captureExcerpt(task) {
    const lines = linesOf(task.capture_text);
    // The generated heading already represents the first line; show its context.
    if (lines[0]?.slice(0, 100) === task.title?.trim()) lines.shift();
    return lines.join(' ') || (task.source_ref || '');
}

export function workSummary(task) {
    const entries = readWorkEntries(task);
    const result = [...entries].reverse().find(entry => entry.result?.trim());
    const notes = linesOf(task.notes).slice(-2).join(' ');
    return { step: task.next_task_title || task.next_step || '',
        context: result?.result || notes || captureExcerpt(task),
        result: result?.result || '', memo: notes,
        lastEntry: entries.at(-1) || null };
}
