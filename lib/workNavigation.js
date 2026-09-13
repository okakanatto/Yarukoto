const guards = new Set();
let navigation = null;
let latestRequest = 0;
const replayed = new WeakSet();

// Both list selection and real route changes wait for the same save boundary.
export async function guardWorkNavigation(action) {
    const request = ++latestRequest;
    if (!navigation) {
        navigation = (async () => {
            for (const guard of [...guards].reverse()) {
                if (await guard() === false) return false;
            }
            return true;
        })().finally(() => { navigation = null; });
    }
    if (!await navigation || request !== latestRequest) return false;
    action?.();
    return true;
}

function interceptLink(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return;
    if (replayed.has(anchor)) { replayed.delete(anchor); return; }
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !['http:', 'https:', 'tauri:'].includes(url.protocol)) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void guardWorkNavigation(() => {
        if (!anchor.isConnected) return;
        replayed.add(anchor);
        anchor.click();
        replayed.delete(anchor);
    });
}

export function registerWorkNavigationGuard(guard) {
    if (!guards.size) document.addEventListener('click', interceptLink, true);
    guards.add(guard);
    return () => {
        guards.delete(guard);
        if (!guards.size) document.removeEventListener('click', interceptLink, true);
    };
}
