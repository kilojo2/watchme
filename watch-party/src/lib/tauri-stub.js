/**
 * Tauri API Stub — browser-compatible mock for `@tauri-apps/api`.
 *
 * ## Purpose
 *
 * This module replaces `@tauri-apps/api/core` and `@tauri-apps/api/event`
 * when building for **Railway** (or any browser-only environment).
 *
 * In Tauri v2, the real modules talk to the Rust backend via IPC.
 * In a plain browser (no Tauri runtime), those IPC channels don't exist,
 * so we provide no-op / stubs that log warnings instead of crashing.
 *
 * ## Usage
 *
 * This file is NOT imported directly. Instead, `vite.config.js` uses
 * `resolve.alias` to redirect `@tauri-apps/api` → `./src/lib/tauri-stub.js`
 * when the `VITE_RAILWAY` environment variable is set.
 *
 * ## Exports
 *
 * | Export   | Real module                  | Stub behaviour                     |
 * |----------|------------------------------|------------------------------------|
 * | `invoke` | `@tauri-apps/api/core`       | Returns rejected promise + warning |
 * | `listen` | `@tauri-apps/api/event`      | Returns no-op unsubscribe function |
 * | `once`   | `@tauri-apps/api/event`      | Returns no-op unsubscribe function |
 * | `emit`   | `@tauri-apps/api/event`      | Returns resolved promise + warning |
 * | `emitTo` | `@tauri-apps/api/event`      | Returns resolved promise + warning |
 * | `isTauri`| — (custom)                   | Returns `false`                    |
 *
 * @module tauri-stub
 */

// ─── Core ────────────────────────────────────────────────────────

/**
 * Mock for `invoke()` from `@tauri-apps/api/core`.
 *
 * In Tauri, this sends an IPC message to the Rust backend.
 * In the browser, it logs a warning and returns a rejected promise.
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
 * Mock for `transformCallback()` from `@tauri-apps/api/core`.
 * Returns a dummy callback ID.
 *
 * @param {Function} fn  — Callback function (ignored)
 * @returns {number} Always 0
 */
export function transformCallback(fn) {
  console.warn("[Tauri Stub] transformCallback() — no-op in browser mode");
  return 0;
}

// ─── Event ───────────────────────────────────────────────────────

/**
 * Mock for `listen()` from `@tauri-apps/api/event`.
 *
 * In Tauri, this registers a JS listener for a Rust-emitted event.
 * In the browser, it logs a warning and returns a no-op unlisten function.
 *
 * @param {string}   event    — Event name (e.g. "browser-video-play")
 * @param {Function} handler  — Event handler function
 * @param {object}   [options]— Listen options (ignored)
 * @returns {Promise<Function>} Resolves with no-op unsubscribe
 */
export async function listen(event, handler, options) {
  console.warn(
    `[Tauri Stub] listen("${event}") — Tauri events are not available in browser mode.`,
  );
  return async () => {
    /* no-op */
  };
}

/**
 * Mock for `once()` from `@tauri-apps/api/event`.
 *
 * Same as `listen()` but for one-shot listeners.
 *
 * @param {string}   event    — Event name
 * @param {Function} handler  — Event handler function
 * @param {object}   [options]— Listen options (ignored)
 * @returns {Promise<Function>} Resolves with no-op unsubscribe
 */
export async function once(event, handler, options) {
  console.warn(
    `[Tauri Stub] once("${event}") — Tauri events are not available in browser mode.`,
  );
  return async () => {
    /* no-op */
  };
}

/**
 * Mock for `emit()` from `@tauri-apps/api/event`.
 *
 * In Tauri, this sends an event to the Rust backend.
 * In the browser, it logs a warning and resolves.
 *
 * @param {string} event   — Event name
 * @param {*}      payload — Event payload
 * @returns {Promise<void>} Resolved promise
 */
export async function emit(event, payload) {
  console.warn(
    `[Tauri Stub] emit("${event}") — Tauri events are not available in browser mode.`,
    payload ? `Payload: ${JSON.stringify(payload).slice(0, 200)}` : "",
  );
}

/**
 * Mock for `emitTo()` from `@tauri-apps/api/event`.
 *
 * @param {string|object} target  — Event target
 * @param {string}        event   — Event name
 * @param {*}             payload — Event payload
 * @returns {Promise<void>} Resolved promise
 */
export async function emitTo(target, event, payload) {
  console.warn(
    `[Tauri Stub] emitTo("${typeof target === "string" ? target : JSON.stringify(target)}", "${event}") — Tauri events not available in browser mode.`,
  );
}

// ─── Detection ───────────────────────────────────────────────────

/**
 * Checks whether the app is running inside a Tauri webview.
 *
 * Detects the `window.__TAURI_INTERNALS__` object, which is injected
 * by Tauri's initialization script.
 *
 * @returns {boolean} `true` if running in Tauri, `false` otherwise
 */
export function isTauri() {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ != null;
}

/**
 * Returns the current runtime environment.
 *
 * @returns {"tauri" | "browser"} Environment name
 */
export function getRuntime() {
  return isTauri() ? "tauri" : "browser";
}

// ─── Default export ──────────────────────────────────────────────

export default {
  invoke,
  transformCallback,
  listen,
  once,
  emit,
  emitTo,
  isTauri,
  getRuntime,
};
