/**
 * Tauri API Stub — Index (re-exports)
 *
 * Entry point for `@tauri-apps/api` bare import (no subpath).
 * Re-exports everything from `core.js` and `event.js`.
 *
 * ## Usage
 *
 * This directory is NOT imported directly. Instead, `vite.config.js` uses
 * `resolve.alias` to redirect `@tauri-apps/api` → `./src/lib/tauri-stub`
 * when the `VITE_RAILWAY` environment variable is set.
 *
 * The subpath aliases are resolved automatically by Vite:
 * - `@tauri-apps/api`         → `tauri-stub/index.js`
 * - `@tauri-apps/api/core`    → `tauri-stub/core.js`
 * - `@tauri-apps/api/event`   → `tauri-stub/event.js`
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
 *
 * @module tauri-stub
 */

export { invoke, transformCallback } from './core.js';
export { listen, once, emit, emitTo } from './event.js';
