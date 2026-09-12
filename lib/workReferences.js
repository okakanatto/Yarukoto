const DOCUMENT_TYPES = /\.(pdf|txt|md|csv|tsv|docx?|xlsx?|pptx?|odt|ods|odp|rtf|png|jpe?g|gif|webp)$/i;

export function classifyWorkReference(value) {
    let target = String(value || '').trim().replace(/^"(.*)"$/, '$1');
    const fallback = { kind: 'text', target, label: target };
    if (!target || /[\u0000-\u001f]/.test(target)) return fallback;
    if (/^https?:\/\//i.test(target)) {
        try {
            const url = new URL(target);
            if (!url.hostname || url.username || url.password) return fallback;
            return { kind: 'url', target: url.href, label: url.hostname + (url.pathname === '/' ? '' : decodeURI(url.pathname)) };
        } catch { return fallback; }
    }
    if (/^file:\/\//i.test(target)) {
        try {
            const url = new URL(target);
            if (url.hostname) return fallback;
            target = decodeURIComponent(url.pathname).replace(/^\/([a-z]:)/i, '$1').replaceAll('/', '\\');
        } catch { return fallback; }
    }
    if (/^[a-z]:[\\/]/i.test(target) && !target.slice(2).includes(':') && DOCUMENT_TYPES.test(target)) {
        return { kind: 'file', target, label: target.split(/[\\/]/).pop() };
    }
    return fallback;
}

export async function openWorkReference(value) {
    const reference = classifyWorkReference(value);
    if (reference.kind === 'text') throw new Error('資料のURLかファイルを指定してください。');
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_work_reference', { target: reference.target });
}
