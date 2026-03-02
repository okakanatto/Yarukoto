/**
 * Mock for @tauri-apps/plugin-http.
 * Returns a failed response so updateHolidayCache silently skips the CSV fetch.
 */
export async function fetch(_url, _options) {
  return {
    ok: false,
    status: 503,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}
