/**
 * Tauri API Stub — `@tauri-apps/api/core`
 *
 * Browser-compatible mock for the Tauri IPC `invoke()` function.
 * In a plain browser (no Tauri runtime), IPC channels don't exist,
 * so we log a warning and return a rejected promise.
 *
 * @module tauri-stub/core
 */

/**
 * Mock for `invoke()` from `@tauri-apps/api/core`.
 *
 * @param {string} cmd     — Command name (e.g. "create_browser_webview")
 * @param {object} [args]  — Command arguments
 * @returns {Promise<never>} Rejected promise
 */
export async function invoke(cmd, args) {
  console.warn(
    `[Tauri Stub] invoke("${cmd}") — Tauri backend is not available in browser mode.`,
    args ? `Args: ${JSON.stringify(args)}` : "",
  );
  return Promise.reject(new Error(`Tauri IPC not available (cmd: ${cmd})`));
}

/**
 * Mock for `transformCallback()` — rarely used directly, but exported for completeness.
 *
 * @returns {number} Always returns 0
 */
export function transformCallback() {
  console.warn("[Tauri Stub] transformCallback() — not available in browser mode.");
  return 0;
}
