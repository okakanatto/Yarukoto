import { notifyTasksChanged } from './taskHierarchy';

export const escapeCSV = value => {
    if (value == null || value === '') return '';
    const text = String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Parse records, not physical lines: quoted notes may contain CRLF, commas and quotes.
export function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    const pushRow = () => {
        row.push(field);
        if (row.some(value => value !== '')) rows.push(row);
        row = []; field = ''; closed = false;
    };
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') { quoted = false; closed = true; }
            else field += ch;
        } else if (ch === '"' && !field && !closed) quoted = true;
        else if (ch === ',') { row.push(field); field = ''; closed = false; }
        else if (ch === '\r' || ch === '\n') {
            pushRow();
            if (ch === '\r' && text[i + 1] === '\n') i++;
        } else if (closed || ch === '"') throw new Error('CSVの引用符が正しくありません');
        else field += ch;
    }
    if (quoted) throw new Error('CSVの引用符が閉じていません');
    if (field || row.length || closed) pushRow();
    return rows;
}

export const TASK_CSV_FIELDS = [
    'id', 'title', 'parent_id', 'status_code', 'status', 'importance_level', 'importance',
    'urgency_level', 'urgency', 'start_date', 'due_date', 'estimated_minutes', 'today_date',
    'notes', 'tags', 'project_id', 'project', 'sort_order', 'created_at', 'updated_at',
    'completed_at', 'archived_at', 'today_sort_order', 'capture_text', 'source_ref',
    'waiting_on', 'review_date', 'next_task_id', 'last_opened_at', 'next_step', 'work_started_at', 'work_log',
];
const aliases = { status: 'status_label', importance: 'importance_label', urgency: 'urgency_label',
    estimated_minutes: 'estimated_hours', tags: 'tag_names', project: 'project_name' };
const DATE_FIELDS = ['start_date', 'due_date', 'today_date', 'review_date'];

function normalizeDate(value, field, recordNumber) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    // Accept unambiguous year-first spreadsheet dates; do not guess local
    // month/day order or let Date silently roll an impossible date forward.
    const match = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/.exec(trimmed);
    const year = Number(match?.[1]);
    const month = Number(match?.[3]);
    const day = Number(match?.[4]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!match || year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
        throw new Error(`CSVのデータ${recordNumber}件目の${field}が不正です。YYYY-MM-DD形式の実在する日付を指定してください`);
    }
    return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function exportTasksCSV(rows) {
    return '\uFEFF' + TASK_CSV_FIELDS.join(',') + '\r\n' + rows.map(row =>
        TASK_CSV_FIELDS.map(field => escapeCSV(row[aliases[field] || field])).join(',')).join('\r\n');
}

export function readTaskCSV(text) {
    const records = parseCSV(text);
    if (records.length < 2) throw new Error('CSVにデータ行がありません');
    const headers = records[0].map(value => value.trim().toLowerCase());
    if (!headers.includes('title')) throw new Error('title列が見つかりません');
    if (new Set(headers).size !== headers.length) throw new Error('CSVに同じ列名が複数あります');
    const rows = records.slice(1).map((cols, index) => {
        const row = Object.fromEntries(headers.map((header, i) => [header, cols[i] ?? '']));
        if (row.title?.trim()) {
            for (const field of DATE_FIELDS) if (Object.hasOwn(row, field)) row[field] = normalizeDate(row[field], field, index + 1);
            if (Object.hasOwn(row, 'work_log')) {
                if (!row.work_log.trim()) row.work_log = '[]';
                try {
                    if (!Array.isArray(JSON.parse(row.work_log))) throw new Error('not an array');
                } catch {
                    throw new Error(`CSVのデータ${index + 1}件目のwork_logが不正です。JSON配列を指定してください`);
                }
            }
        }
        return row;
    })
        .filter(row => row.title?.trim());
    const byId = new Map();
    for (const row of rows) {
        if (!row.id) continue;
        if (byId.has(row.id)) throw new Error('CSV内でタスクIDが重複しています');
        byId.set(row.id, row);
    }
    for (const row of rows) {
        const visited = new Set(row.id ? [row.id] : []);
        let parentId = row.parent_id;
        while (parentId) {
            if (!byId.has(parentId)) throw new Error('CSV内に親タスクがありません。親タスクを含めてインポートしてください');
            if (visited.has(parentId)) throw new Error('CSVの親子関係が循環しています');
            visited.add(parentId); parentId = byId.get(parentId).parent_id;
        }
        if (row.next_task_id) {
            let next = byId.get(row.next_task_id);
            if (!next || next.id === row.id || next.archived_at || ['3', '5'].includes(next.status_code)) throw new Error('CSVの次の一手が有効な子孫タスクではありません');
            const nextVisited = new Set();
            while (next && next.parent_id !== row.id) {
                if (nextVisited.has(next.id)) throw new Error('CSVの親子関係が循環しています');
                nextVisited.add(next.id); next = byId.get(next.parent_id);
            }
            if (!row.id || !next) throw new Error('CSVの次の一手が子孫タスクではありません');
        }
    }
    return rows;
}

export async function importTasksCSV(db, text) {
    const rows = readTaskCSV(text); // Validate every relationship and date before writing anything.
    const statuses = await db.select('SELECT code, label FROM status_master');
    const importance = await db.select('SELECT level, label FROM importance_master');
    const urgency = await db.select('SELECT level, label FROM urgency_master');
    const projects = await db.select('SELECT id, name FROM projects');
    const number = value => value === '' || value == null ? null : Number(value);
    const masterValue = (row, codeName, labelName, master, codeKey, fallback = null) => {
        const code = row[codeName] ? number(row[codeName]) : master.find(m => m.label === row[labelName])?.[codeKey] ?? fallback;
        if (code != null && !master.some(m => m[codeKey] === code)) throw new Error(`CSVの${codeName}が設定にありません`);
        return code;
    };
    const prepared = rows.map(row => {
        // IDs belong to one DB. A named export must match by name when moved elsewhere.
        const project = row.project ? projects.find(p => p.name === row.project) : projects.find(p => p.id === number(row.project_id));
        if ((row.project_id || row.project) && !project) throw new Error('CSVのプロジェクトが設定にありません。先に同名のプロジェクトを作成してください');
        const result = {
            title: row.title, status_code: masterValue(row, 'status_code', 'status', statuses, 'code', 1),
            importance_level: masterValue(row, 'importance_level', 'importance', importance, 'level'),
            urgency_level: masterValue(row, 'urgency_level', 'urgency', urgency, 'level'),
            project_id: project?.id ?? null,
        };
        for (const field of ['start_date', 'due_date', 'today_date', 'notes', 'created_at', 'updated_at', 'completed_at', 'archived_at', 'capture_text', 'source_ref', 'waiting_on', 'review_date', 'last_opened_at', 'next_step', 'work_started_at', 'work_log']) {
            if (Object.hasOwn(row, field)) result[field] = row[field] || (['capture_text', 'source_ref', 'waiting_on', 'next_step'].includes(field) ? '' : null);
        }
        for (const [csvName, dbName] of [['estimated_minutes', 'estimated_hours'], ['sort_order', 'sort_order'], ['today_sort_order', 'today_sort_order']]) {
            if (Object.hasOwn(row, csvName)) {
                const value = number(row[csvName]);
                if (value != null && (!Number.isFinite(value) || (csvName === 'estimated_minutes' ? value < 0 : !Number.isInteger(value)))) throw new Error(`CSVの${csvName}が不正です`);
                result[dbName] = value;
            }
        }
        return result;
    });
    const idMap = new Map();
    for (let i = 0; i < prepared.length; i++) {
        const fields = Object.keys(prepared[i]);
        const values = Object.values(prepared[i]);
        const inserted = await db.execute(`INSERT INTO tasks (${fields.join(',')}) VALUES (${fields.map((_, j) => `$${j + 1}`).join(',')})`, values);
        rows[i].newId = inserted.lastInsertId;
        if (rows[i].id) idMap.set(rows[i].id, inserted.lastInsertId);
    }
    for (const row of rows) {
        await db.execute('UPDATE tasks SET parent_id = $1, next_task_id = $2 WHERE id = $3',
            [idMap.get(row.parent_id) ?? null, idMap.get(row.next_task_id) ?? null, row.newId]);
    }
    const tagIds = new Map((await db.select('SELECT id, name FROM tags')).map(tag => [tag.name, tag.id]));
    for (const row of rows) {
        for (const name of (row.tags || '').split('|').map(t => t.trim()).filter(Boolean)) {
            if (!tagIds.has(name)) tagIds.set(name, (await db.execute('INSERT INTO tags (name) VALUES ($1)', [name])).lastInsertId);
            await db.execute('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES ($1, $2)', [row.newId, tagIds.get(name)]);
        }
    }
    notifyTasksChanged();
    return rows.length;
}
