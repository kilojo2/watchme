# 🖥️ Electron Desktop Integration — WatchMe Setup Guide

> Превращает Vite + React + Firebase веб-приложение в нативное десктопное приложение
> для Windows, macOS и Linux с единой кодовой базой.

---

## 1. Overview

WatchMe uses **Electron** as its desktop runtime. The app previously used **Tauri v2**,
but was migrated to Electron for full Chromium control — specifically:

- `<webview>` tag for In-App Browser (embedding external/pirate sites)
- `disablewebsecurity="true"` for cross-domain iframe access (video parsing)
- `nodeIntegration: true` for direct Node.js APIs in the renderer

---

## 2. Project Structure (Electron)

```
watch-party/
├── electron/
│   ├── main.js                 # Electron main process
│   └── browser-preload.js      # Preload script for <webview> (injected via executeJavaScript)
├── src/
│   ├── components/
│   │   ├── BrowserPlayer.jsx   # <webview> React component
│   │   ├── VideoPlayer.jsx     # YouTube / HLS.js player
│   │   └── ...
│   ├── lib/
│   │   ├── runtime.js          # Runtime detection (isDesktop / isElectron / getRuntime)
│   │   └── ...
│   └── ...
├── package.json                # main: "dist-electron/main.js"
├── vite.config.js              # vite-plugin-electron integration
└── ...
```

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Electron Main Process                      │
│                   electron/main.js                            │
│  Creates BrowserWindow with:                                  │
│  • webviewTag: true        → enables <webview> tag            │
│  • webSecurity: false      → disables CORS/SOP               │
│  • nodeIntegration: true   → Node.js in renderer             │
│  • contextIsolation: false → required for nodeIntegration    │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                 Renderer Process (Vite + React)               │
│                                                              │
│  ┌─── <webview> (In-App Browser) ─────────────────────────┐ │
│  │  • disablewebsecurity="true"                           │ │
│  │  • executeJavaScript() for preload injection            │ │
│  │  • Events: did-navigate, dom-ready, console-message     │ │
│  │  • Polling: setInterval → executeJavaScript() every 1.5s│ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Key Configuration

### 4.1 BrowserWindow (`electron/main.js`)

```javascript
const win = new BrowserWindow({
  width: 1216,
  height: 839,
  backgroundColor: '#09090b',
  webPreferences: {
    webviewTag: true,        // Enable <webview> tag
    webSecurity: false,      // Disable CORS/SOP for iframe access
    nodeIntegration: true,   // Allow Node.js APIs in renderer
    contextIsolation: false, // Required for nodeIntegration
    sandbox: false,
    spellcheck: false,
  },
});
```

### 4.2 vite-plugin-electron (`vite.config.js`)

```javascript
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: 'electron/main.js',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron'] },
          },
        },
      },
    ]),
    renderer(),
  ],
})
```

### 4.3 Railway / Browser-only mode

When deploying to Railway, set `VITE_RAILWAY=1` in the environment.
The `vite-plugin-electron` plugins will be automatically disabled:

```javascript
const isRailway = process.env.VITE_RAILWAY === '1' || process.env.RAILWAY_ENVIRONMENT != null
const electronPlugins = isRailway ? [] : [electron([...]), renderer()]
```

---

## 5. In-App Browser (`<webview>`)

The `<webview>` tag is the core feature — it embeds a fully-featured Chromium
browser inside the app, with CORS disabled so our preload script can:

1. Scan the top-level page and all iframes for `<video>` elements
2. Access cross-origin iframe contentDocument (normally blocked by SOP)
3. Sniff video stream URLs (HLS .m3u8, direct .mp4, etc.)
4. Control video playback (play/pause/seek) across room members

### Webview lifecycle

| Event | Handler |
|-------|---------|
| `did-start-loading` | Show loading overlay |
| `did-stop-loading` | Hide loading overlay |
| `did-navigate` | Update URL bar |
| `dom-ready` | Inject preload script via `executeJavaScript()` |
| `console-message` | Capture preload logs for debug panel |
| `page-title-updated` | Log page title |

### Video state polling

Every 1.5 seconds, React calls:

```javascript
wv.executeJavaScript(`JSON.stringify({
  alive: window.__browserData?.alive,
  video: window.__browserData?.video,
  frameCount: window.__browserData?.frameCount,
  // ...
})`).then(result => {
  // Parse and update React state
})
```

### Navigation

```javascript
webviewRef.current?.goBack()
webviewRef.current?.goForward()
webviewRef.current?.reload()
```

---

## 6. Development

```powershell
# Start dev mode (Vite HMR + Electron)
npm run dev

# The Vite dev server starts on port 5173
# Electron loads http://localhost:5173
# DevTools open automatically in detached mode
```

---

## 7. Production Build

```powershell
# Build the React app + Electron main process
npm run electron:build

# Output:
# - dist/           → React production build
# - dist-electron/  → Electron main process
# - Installer will be created by electron-builder
```

---

## 8. Scripts (package.json)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (browser-only) |
| `npm run electron:dev` | Start Vite + Electron (desktop dev) |
| `npm run build` | Build React app for production |
| `npm run electron:build` | Build React + Electron |
| `npm run build:railway` | Build for Railway deployment |
| `npm run preview` | Preview production build |

---

## 9. Runtime Detection

Use `isDesktop()` / `isElectron()` from `src/lib/runtime.js`:

```javascript
import { isDesktop, getRuntime } from "../lib/runtime";

if (isDesktop()) {
  // Electron-specific features (In-App Browser)
} else {
  // Browser-only behavior (show "Download Desktop" prompt)
}

console.log(getRuntime()); // "electron" | "browser"
```

Detection logic:

- **Electron**: `navigator.userAgent.includes("Electron")`
- **Browser**: everything else (Chrome, Firefox, Railway, etc.)

---

## 10. Preload Script

The browser preload script (`electron/browser-preload.js`) is **not** loaded
via Electron's `preload` attribute (because `<webview>` preload requires a
`file://` URL). Instead, it's injected on `dom-ready` via:

```javascript
import BROWSER_PRELOAD from "../../electron/browser-preload.js?raw";

// On dom-ready:
wv.executeJavaScript(BROWSER_PRELOAD);
```

The preload script:
- Sets up a `MutationObserver` to watch for `<video>` elements
- Scans all iframes recursively for video content
- Stores state in `window.__browserData`
- Reports CORS access status for each iframe

---

## 11. Migration from Tauri

This project was originally built with **Tauri v2** and migrated to Electron.

### Key differences

| Aspect | Tauri | Electron |
|--------|-------|----------|
| Runtime | Rust + WebView2 (Windows) | Node.js + Chromium |
| In-App Browser | `window.add_child()` (buggy) | `<webview>` tag (native) |
| CORS bypass | `additional_browser_args: --disable-web-security` | `disablewebsecurity="true"` |
| Preload script | `initialization_script` (built-in) | `executeJavaScript()` on dom-ready |
| State polling | `invoke()` + Rust IPC channels | `executeJavaScript()` directly |
| IPC | Tauri `invoke()` / `listen()` | `executeJavaScript()` + webview events |
| Dev experience | `npx tauri dev` (Rust compile) | `npm run dev` (instant HMR) |
| Build | Cargo + Rust toolchain | Node.js + electron-builder |

### What was removed

- `src-tauri/` directory (Rust source, Cargo.toml, tauri.conf.json)
- `@tauri-apps/api` and `@tauri-apps/cli` npm packages
- `tauri-stub/` directory (no longer needed — no Tauri imports remain)
- `TAURI_SETUP.md` (replaced by this file)

### What was added

- `electron/main.js` — BrowserWindow configuration
- `electron/browser-preload.js` — preserved preload logic
- `vite-plugin-electron` and `vite-plugin-electron-renderer`
- Runtime detection updated from `isTauri()` to `isElectron()` / `isDesktop()`
