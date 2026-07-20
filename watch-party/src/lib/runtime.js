/**
 * Runtime Detection Utility
 *
 * Reliably determines whether the app is running inside a desktop wrapper
 * (Electron) or in a regular browser (including Railway deployment).
 *
 * ## Detection Logic
 *
 * - **Electron**: `navigator.userAgent` contains `"Electron"` and
 *   `window.process?.versions?.electron` is defined when
 *   `nodeIntegration: true` and `contextIsolation: false`.
 * - **Browser**: Neither condition is true (standard browser or Railway).
 *
 * @module runtime
 */

/**
 * Returns `true` if the code is running inside an Electron desktop app.
 *
 * @returns {boolean}
 */
export function isElectron() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.userAgent.includes("Electron")
  );
}

/**
 * Returns `true` if the code is running inside any desktop wrapper
 * (currently only Electron).
 *
 * @returns {boolean}
 */
export function isDesktop() {
  return isElectron();
}

/**
 * Returns a human-readable runtime name for display / debugging.
 *
 * @returns {"electron" | "browser"}
 */
export function getRuntime() {
  return isElectron() ? "electron" : "browser";
}
