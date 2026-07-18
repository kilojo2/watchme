/**
 * Runtime Detection Utility
 *
 * Reliably determines whether the app is running inside a Tauri desktop
 * wrapper or in a regular browser (including Railway deployment).
 *
 * ## Detection Logic
 *
 * Tauri v2 injects `window.__TAURI_INTERNALS__` into every webview.
 * This object is present in both the main window and child webviews.
 *
 * In a regular browser or on Railway, this object is undefined.
 *
 * @module runtime
 */

/**
 * Returns `true` if the code is running inside a Tauri desktop app.
 *
 * @returns {boolean}
 */
export function isTauri() {
  return (
    typeof window !== "undefined" &&
    window.__TAURI_INTERNALS__ != null
  );
}

/**
 * Returns a human-readable runtime name for display / debugging.
 *
 * @returns {"tauri" | "browser"}
 */
export function getRuntime() {
  return isTauri() ? "tauri" : "browser";
}
