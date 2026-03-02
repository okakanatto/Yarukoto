import { vi } from 'vitest';

// Mock Tauri plugins with in-memory replacements
vi.mock('@tauri-apps/plugin-sql', () => import('../__mocks__/tauri-plugin-sql.js'));
vi.mock('@tauri-apps/plugin-http', () => import('../__mocks__/tauri-plugin-http.js'));

// Provide a minimal window object for code that checks window.__TAURI_INTERNALS__
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    __TAURI_INTERNALS__: undefined,
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
  };
}

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = globalThis.window.CustomEvent;
}
