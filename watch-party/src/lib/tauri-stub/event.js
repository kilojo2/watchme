/**
 * Tauri API Stub — `@tauri-apps/api/event`
 *
 * Browser-compatible mock for Tauri event system functions.
 * In a plain browser (no Tauri runtime), we provide no-op stubs
 * that log warnings instead of crashing.
 *
 * @module tauri-stub/event
 */

/**
 * Mock for `listen()` from `@tauri-apps/api/event`.
 *
 * @param {string} event   — Event name
 * @param {Function} handler — Event handler
 * @returns {Promise<{(): void}>} No-op unsubscribe function
 */
export async function listen(event, handler) {
  console.warn(
    `[Tauri Stub] listen("${event}") — Tauri events not available in browser mode.`,
  );
  return () => {};
}

/**
 * Mock for `once()` from `@tauri-apps/api/event`.
 *
 * @param {string} event   — Event name
 * @param {Function} handler — Event handler
 * @returns {Promise<{(): void}>} No-op unsubscribe function
 */
export async function once(event, handler) {
  console.warn(
    `[Tauri Stub] once("${event}") — Tauri events not available in browser mode.`,
  );
  return () => {};
}

/**
 * Mock for `emit()` from `@tauri-apps/api/event`.
 *
 * @param {string} event   — Event name
 * @param {unknown} payload — Event payload
 * @returns {Promise<void>} Resolved promise
 */
export async function emit(event, payload) {
  console.warn(
    `[Tauri Stub] emit("${event}") — Tauri events not available in browser mode.`,
    payload ? `Payload: ${JSON.stringify(payload)}` : "",
  );
}

/**
 * Mock for `emitTo()` from `@tauri-apps/api/event`.
 *
 * @param {unknown} target — Event target
 * @param {string} event   — Event name
 * @param {unknown} payload — Event payload
 * @returns {Promise<void>} Resolved promise
 */
export async function emitTo(target, event, payload) {
  console.warn(
    `[Tauri Stub] emitTo(${JSON.stringify(target)}, "${event}") — Tauri events not available in browser mode.`,
    payload ? `Payload: ${JSON.stringify(payload)}` : "",
  );
}
