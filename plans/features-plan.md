# Feature Implementation Plan

## Overview

This document outlines a detailed, step-by-step plan for implementing 4 new features in the Watch Party Electron app. Each feature is designed to be independently implementable in a logical order.

---

## Feature 1: Quick Access Start Page

### Goal
Replace the generic "Enter a URL to start browsing" placeholder in [`BrowserPlayer.jsx`](watch-party/src/components/BrowserPlayer.jsx:756) with a visually appealing grid of popular streaming/pirate site shortcuts, similar to a browser's new-tab page.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| [`src/data/quickAccessSites.js`](watch-party/src/data/quickAccessSites.js) | **Create** | Site config constants (name, URL, SVG icon component) |
| [`src/components/QuickAccess.jsx`](watch-party/src/components/QuickAccess.jsx) | **Create** | Grid component rendering site cards |
| [`src/components/BrowserPlayer.jsx`](watch-party/src/components/BrowserPlayer.jsx) | **Modify** | Replace empty-state placeholder with `<QuickAccess>` |

### Steps

1. **Create `src/data/quickAccessSites.js`**

   Define an array of site objects:
   ```js
   export const QUICK_ACCESS_SITES = [
     {
       name: 'Example',
       url: 'https://example.com',
       category: 'movies', // for future filtering
       icon: ({ className }) => ( /* inline SVG */ ),
     },
     // ... 8-12 popular sites
   ];
   ```
   - Each site has an inline SVG icon function component (dark-theme compatible, ~24×24)
   - Icons should be simple, one-color `currentColor` SVGs fitting the zinc theme
   - Sites to include examples: YouTube, Kinogo, Animego, HDTor, LostFilm, etc. (user can customize)

2. **Create `src/components/QuickAccess.jsx`**

   ```jsx
   export default function QuickAccess({ onNavigate }) {
     return (
       <div className="...">
         <h2>Quick Access</h2>
         <div className="grid grid-cols-4 gap-3">
           {QUICK_ACCESS_SITES.map(site => (
             <button key={site.url} onClick={() => onNavigate(site.url)}>
               <site.icon className="..." />
               <span>{site.name}</span>
             </button>
           ))}
         </div>
       </div>
     );
   }
   ```
   - Dark theme: `bg-zinc-900/50` cards, hover effect, rounded-xl
   - Responsive grid: 4 columns on wide, 2 on narrow
   - `onNavigate(url)` callback calls `navigateTo(url)` in parent

3. **Modify [`BrowserPlayer.jsx`](watch-party/src/components/BrowserPlayer.jsx:756-773)**

   Replace the empty-state div (lines 757-772) with:
   ```jsx
   {currentUrlRef.current ? (
     <webview ... />
   ) : (
     <QuickAccess onNavigate={(url) => { navigateTo(url); handleGo(); }} />
   )}
   ```
   - The `QuickAccess` component replaces the placeholder globe SVG and text
   - When user clicks a shortcut, it calls `navigateTo(site.url)` + `handleGo()`

### Architecture

```
BrowserPlayer (no URL loaded)
  └── QuickAccess
       ├── SiteCard (YouTube)     ─click→ navigateTo("https://youtube.com")
       ├── SiteCard (Kinogo)      ─click→ navigateTo("https://kinogo.xyz")
       ├── SiteCard (Animego)     ─click→ navigateTo("https://animego.org")
       └── SiteCard (... more)
```

---

## Feature 2: Global Keyboard Hotkeys

### Goal
Register system-level and app-level hotkeys for Space (play/pause), Left/Right arrows (seek ±5s), and F (fullscreen) that work even when the `<webview>` has focus.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| [`electron/main.js`](watch-party/electron/main.js) | **Modify** | Add `before-input-event` handler for hotkeys |
| [`electron/main.js`](watch-party/electron/main.js) | **Modify** | Add IPC handler for `set-fullscreen` |
| [`src/components/BrowserPlayer.jsx`](watch-party/src/components/BrowserPlayer.jsx) | **Modify** | Expose video control functions for IPC invocation |
| *(none)* | | Hotkeys work via `executeJavaScript` targeting `window.__WATCHME_PLAYER` |

### Steps

1. **Extend `before-input-event` handler in [`electron/main.js`](watch-party/electron/main.js:92-100)**

   Current handler handles F12/Ctrl+Shift+I. Expand it:
   ```js
   win.webContents.on('before-input-event', (_event, input) => {
     // DevTools (existing)
     if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
       win.webContents.toggleDevTools();
       return;
     }

     // Only process hotkeys when not typing in an input
     if (input.type !== 'keyUp') {
       switch (input.key) {
         case ' ':   // Space → play/pause toggle
           input.preventDefault();
           win.webContents.executeJavaScript(`
             (function() {
               var v = window.__WATCHME_PLAYER;
               if (!v) return 'no-video';
               if (v.paused) { v.play(); return 'play'; }
               else { v.pause(); return 'pause'; }
             })()
           `);
           break;

         case 'ArrowLeft':  // ← → seek -5s
           input.preventDefault();
           win.webContents.executeJavaScript(`
             (function() {
               var v = window.__WATCHME_PLAYER;
               if (v) { v.currentTime = Math.max(0, v.currentTime - 5); }
             })()
           `);
           break;

         case 'ArrowRight': // → → seek +5s
           input.preventDefault();
           win.webContents.executeJavaScript(`
             (function() {
               var v = window.__WATCHME_PLAYER;
               if (v) { v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); }
             })()
           `);
           break;

         case 'f':
         case 'F':
           input.preventDefault();
           win.webContents.send('toggle-fullscreen');
           break;
       }
     }
   });
   ```

   **Important**: Space key handling may interfere with button presses in the React UI. Solution: only intercept Space when `<webview>` is focused (check via a flag set by React).

2. **Add IPC handler for fullscreen toggle in [`electron/main.js`](watch-party/electron/main.js)**

   ```js
   const { ipcMain } = require('electron');

   // Inside createWindow(), after win is created:
   ipcMain.on('toggle-fullscreen', () => {
     const isFullscreen = win.isFullScreen();
     win.setFullScreen(!isFullscreen);
   });
   ```

   Or better, use `webContents.ipc` pattern to avoid global listeners.

3. **Add `webview-focused` flag in [`BrowserPlayer.jsx`](watch-party/src/components/BrowserPlayer.jsx)**

   The `<webview>` element gets focus/blur events. Track focus state:
   ```jsx
   <webview
     ref={webviewRef}
     onFocus={() => { /* set flag: webview has focus */ }}
     onBlur={() => { /* clear flag */ }}
     ...
   />
   ```

   Expose a method that `main.js` can call to check if webview is focused.

   **Alternative approach**: Use `win.webContents.send('hotkey', { key })` from main process, and listen in React with `ipcRenderer.on('hotkey', handler)`. This gives React full control over which hotkeys to process. Since `nodeIntegration: true` and `contextIsolation: false` are already set, `ipcRenderer` is available.

   **Recommended approach** (simpler, no IPC needed for video):
   - Main process ignores Space/arrows when webview is NOT focused
   - Track webview focus via `document.activeElement` check in executeJavaScript:
   ```js
   // Main process sends command, the script checks context
   win.webContents.executeJavaScript(`
     (function() {
       // Check if webview is the active element in the page
       var wv = document.querySelector('webview');
       if (wv && wv !== document.activeElement) return 'no-focus';
       var v = window.__WATCHME_PLAYER || document.querySelector('video');
       if (!v) return 'no-video';
       // ... perform action
     })()
   `);
   ```

4. **Firebase sync consideration**

   When Space triggers play/pause in the sniffer, the video's `play`/`pause` event fires naturally, which the sniffer sends via console.log → BrowserPlayer's `onConsoleMessage` handler → `updatePlayerState()` → Firebase. No additional code needed for sync — the existing sniffing pipeline handles it.

### Keyboard Hotkey Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron Main Process                         │
│                                                                  │
│  before-input-event fires                                        │
│       │                                                          │
│       ▼                                                          │
│  Check key:  Space?  Arrows?  F?                                │
│       │                                                          │
│       ├── Space/Arrows ──→ executeJavaScript() on renderer      │
│       │                       │                                  │
│       │                       ▼                                  │
│       │                  window.__WATCHME_PLAYER                  │
│       │                       .play()/.pause()/.currentTime      │
│       │                       │                                  │
│       │                       ▼                                  │
│       │                  Sniffer detects event                    │
│       │                  → console.log → onConsoleMessage        │
│       │                  → updatePlayerState() → Firebase         │
│       │                                                          │
│       └── F ──→ win.webContents.send('toggle-fullscreen')       │
│                     │                                            │
│                     ▼                                            │
│               ipcMain.on → win.setFullScreen()                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature 3: Theater Mode

### Goal
Add a "Theater Mode" toggle that hides the chat sidebar, makes the `<webview>` (or `<video>`) span the entire window, and optionally puts the Electron window into fullscreen mode.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| [`src/components/TheaterToggle.jsx`](watch-party/src/components/TheaterToggle.jsx) | **Create** | Theater mode toggle button component |
| [`src/pages/Room.jsx`](watch-party/src/pages/Room.jsx) | **Modify** | Add theater mode state + conditional sidebar hiding |
| [`electron/main.js`](watch-party/electron/main.js) | **Modify** | IPC handler for fullscreen (shared with Feature 2) |

### Steps

1. **Create `src/components/TheaterToggle.jsx`**

   A simple button component:
   ```jsx
   export default function TheaterToggle({ isTheaterMode, onToggle }) {
     return (
       <button
         onClick={onToggle}
         title={isTheaterMode ? 'Exit Theater Mode' : 'Theater Mode'}
         className="..."
       >
         {/* Fullscreen/compress icon SVG */}
       </button>
     );
   }
   ```
   - Icon: SVG of a fullscreen-expand icon when off, fullscreen-compress when on
   - Dark theme styling matching existing toolbar buttons

2. **Modify [`Room.jsx`](watch-party/src/pages/Room.jsx)**

   Add:
   ```jsx
   const [theaterMode, setTheaterMode] = useState(false);
   ```

   - Place the `TheaterToggle` button in the header (right side, near the leave button)
   - When `theaterMode` is `true`:
     - Hide the right sidebar (`aside` element with UserList + Chat) → conditional rendering
     - The left column (`flex-1`) naturally fills 100% width
   - When `theaterMode` is `false`:
     - Show sidebar again (current layout)

   ```jsx
   {/* Theater toggle in header */}
   <TheaterToggle
     isTheaterMode={theaterMode}
     onToggle={() => setTheaterMode(!theaterMode)}
   />
   ```

   ```jsx
   {/* Modified main layout */}
   <div className="flex flex-1 overflow-hidden">
     <div className="flex-1 flex flex-col min-w-0 min-h-0 p-5 pb-0 overflow-y-auto">
       {/* ... player content ... */}
     </div>

     {!theaterMode && (
       <aside className="w-[340px] shrink-0 border-l ...">
         <UserList />
         <Chat />
       </aside>
     )}
   </div>
   ```

3. **Optional: Fullscreen integration**

   When Theater Mode toggles ON, also send IPC to main process to enter fullscreen:
   ```jsx
   const handleTheaterToggle = () => {
     const newMode = !theaterMode;
     setTheaterMode(newMode);

     if (window.__WATCHME_IPC__) {
       window.__WATCHME_IPC__.send('set-fullscreen', newMode);
     }
   };
   ```

   This requires adding a preload-like bridge, but since `nodeIntegration: true` and `contextIsolation: false`, the renderer can directly use `require('electron').ipcRenderer`. Or simpler: use `window.__WATCHME_IPC__` pattern.

   **Simpler approach**: Don't couple Theater Mode to fullscreen. Theater Mode = hide sidebar only. User can press F for fullscreen separately (Feature 2). This keeps the features orthogonal.

### Layout Changes

```
Normal Mode:
┌─────────────────────────────────────────────────────┐
│  Header: [Watch Party]    [👤 User] [🎭] [✕]      │
├──────────────────────────────────┬──────────────────┤
│                                  │  UserList        │
│   BrowserPlayer / VideoPlayer    │                  │
│   (flex-1, 75%)                  ├──────────────────┤
│                                  │  Chat            │
│                                  │  (340px, 25%)    │
└──────────────────────────────────┴──────────────────┘

Theater Mode (sidebar hidden):
┌─────────────────────────────────────────────────────┐
│  Header: [Watch Party]    [👤 User] [🎭] [✕]      │
├─────────────────────────────────────────────────────┤
│                                                     │
│   BrowserPlayer / VideoPlayer (100% width)          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Feature 4: GPU Acceleration Flags

### Goal
Enable Chromium GPU acceleration flags in the Electron main process for smoother video playback, especially on high-refresh-rate monitors.

### Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| [`electron/main.js`](watch-party/electron/main.js) | **Modify** | Add `app.commandLine.appendSwitch` before `app.whenReady()` |

### Steps

1. **Add GPU flags in [`electron/main.js`](watch-party/electron/main.js:114)**

   Before `app.whenReady()`, add:
   ```js
   // ── GPU Acceleration ──────────────────────────────────────────
   // Enable GPU rasterization for smoother compositing
   app.commandLine.appendSwitch('--enable-gpu-rasterization');
   // Ignore GPU blocklist — forces GPU acceleration even on older GPUs
   app.commandLine.appendSwitch('--ignore-gpu-blocklist');
   // Enable hardware-accelerated video decoding (Windows)
   app.commandLine.appendSwitch('--enable-features', 'VaapiVideoDecoder,PlatformHEVCDecoderSupport');
   // Use ANGLE with D3D11 for better performance on Windows
   app.commandLine.appendSwitch('--use-angle', 'd3d11');
   ```

2. **Optional: Also add to BrowserWindow creation**

   Pass additional `webPreferences` for the `<webview>`:
   ```js
   webPreferences: {
     // ... existing ...
     enableBlinkFeatures: 'GpuRasterization', // Enable per-webview GPU raster
   }
   ```

   Note: The `webviewTag` by default inherits the same GPU settings, so the command-line flags should suffice.

3. **Verify at runtime**

   Add a console log to confirm flags are applied:
   ```js
   console.log('[main] GPU flags:', process.argv.filter(a => a.startsWith('--enable-gpu') || a.startsWith('--ignore-gpu') || a.startsWith('--use-angle')));
   ```
   Can be viewed in the packaged app's DevTools console.

### Important Notes

- These flags are **safe** — they may be ignored on unsupported hardware but won't crash
- `--ignore-gpu-blocklist` is particularly important for older laptops/integrated GPUs
- `VaapiVideoDecoder` (Windows) enables hardware decoding for H.264/H.265 video streams
- These flags must be set **before** `app.whenReady()` — after that, Chromium ignores them

---

## Implementation Order

The features should be implemented in this order:

| # | Feature | Reason |
|---|---------|--------|
| 1 | **GPU Acceleration** | Simplest change, no risk, immediately improves experience |
| 2 | **Quick Access Page** | Self-contained UI change, no dependency on other features |
| 3 | **Global Hotkeys** | Requires understanding of IPC, builds on GPU work |
| 4 | **Theater Mode** | Depends on IPC (the fullscreen component could share code with Feature 3) |

## Notes & Caveats

1. **Temporary DevTools in production**: [`electron/main.js:89`](watch-party/electron/main.js:89) currently opens DevTools in production mode. After testing these features, remember to remove or guard it with a flag.

2. **Quick Access site list**: The initial set should be curated but stored in a simple constant file so users can easily modify it. Could be extended later to be configurable (Firebase sync or local settings).

3. **Space key conflict**: Browsers use Space for page scroll. The `before-input-event` approach in main.js catches Space before it reaches the renderer, but only when we explicitly call `input.preventDefault()`. We should add logic to **only intercept Space when the webview is focused** (not the URL input field).

4. **Firebase sync for hotkeys**: The sniffer already detects play/pause/seeked events on `<video>` and sends them to Firebase via the existing pipeline. No extra sync code is needed for hotkey-triggered actions.

5. **Theater Mode vs Fullscreen**: These are separate concepts in this design. Theater Mode = hide UI panels. Fullscreen = OS-level fullscreen window (triggered by F key). They can be used independently or together.
