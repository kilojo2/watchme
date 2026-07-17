# WatchMe — Watch Party 🎬

Watch parties with friends. Built with **React + Vite + Firebase**.

**Key features:**
- 🎥 **YouTube sync** — watch YouTube videos together with play/pause/seek sync
- 🌐 **Browser Player** *(desktop only)* — built-in WebView2 browser with network sniffing for HLS/MP4 streams from any site
- 🔍 **Network Sniffing** *(desktop only)* — Rust-level interception of HTTP requests to detect `.m3u8`, `.mp4` video URLs
- 📡 **HLS.js playback** — play detected HLS streams directly in the app
- 👥 **Real-time sync** via Firebase
- 💬 **Built-in chat**
- 🖥️ **Desktop app** — Windows (Tauri v2)
- 🌍 **Web app** — deploy to Railway, Cloudflare Pages, or any static host

---

## 🚀 Quick Start

### Prerequisites

| Dependency | Version | Check |
|---|---|---|
| [Node.js](https://nodejs.org/) | ≥ 18 | `node --version` |
| [Rust](https://rustup.rs/) | ≥ 1.77 | `rustc --version` |
| MSVC Build Tools | VS 2022 | `cl --version` |

> See [`TAURI_SETUP.md`](TAURI_SETUP.md) for detailed Tauri + Rust setup instructions.

### 1. Install dependencies

```powershell
cd watch-party
npm install
```

### 2. Configure Firebase

Create a Firebase project at https://console.firebase.google.com, then:

1. Enable **Authentication** (Anonymous sign-in) and **Firestore Database**
2. Copy your Firebase config to `.env`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. Launch (choose one)

#### Option A — Development Mode (with hot-reload)

Double-click **`start-dev.bat`** or run:

```powershell
cd watch-party
npx tauri dev
```

This compiles the Rust backend, starts the Vite dev server, and opens the app window. Changes to `.jsx`/`.css` files hot-reload instantly. Changes to Rust code trigger an automatic recompile.

#### Option B — Release Build (standalone `.exe`)

Double-click **`start-release.bat`** or run:

```powershell
cd watch-party
npx tauri build
```

The installer will be at:
- MSI: `src-tauri/target/release/bundle/msi/WatchMe_0.1.0_x64_en-US.msi`
- NSIS: `src-tauri/target/release/bundle/nsis/WatchMe_0.1.0_x64-setup.exe`

#### Option C — Firebase Emulators (optional)

For local Firebase development, double-click **`start-firebase-emu.bat`** or run:

```powershell
cd watch-party
npx firebase emulators:start --only auth,firestore
```

Then set `VITE_USE_EMULATORS=true` in `.env`.

---

## 🎯 How to Use the Browser Player

1. Open the app and **create/join a room**
2. Click the **Browser Player** tab
3. Enter a movie URL (e.g., `https://example.com/movie-page`) and click **Go**
4. The built-in WebView2 browser loads the site inside the app window
5. **Network Sniffer** (Rust backend) intercepts all HTTP requests:
   - Detects patterns: `.m3u8`, `.mp4`, `.webm`, `videoplayback`, `/hls/`, etc.
   - Deduplicates URLs automatically
   - Emits `browser-video-url` event to the frontend
6. A green **"Detected Video Streams"** panel shows found URLs
7. Click **Play** on any detected stream → **HLS.js** starts playback in a `<video>` element
8. Playback syncs across all room members via Firebase

### Architecture

```
┌────────────── BrowserPlayer (main window) ──────────────┐
│                                                          │
│  ┌─── Address Bar ──────────────────────────────────┐   │
│  │ https://movie-site.com                          │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌─── Toolbar ──────────────────────────────────────┐   │
│  │ [Sync Player] [Show Frames] [Back to Browser]    │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌─── #webview-placeholder ─────────────────────────┐   │
│  │  ┌── Child WebView2 (or <video> in stream mode) ┐│   │
│  │  │  Network Sniffer (Rust) → detects .m3u8 URLs ││   │
│  │  └──────────────────────────────────────────────┘│   │
│  └──────────────────────────────────────────────────┘   │
│  ┌─── Detected Video Streams ───────────────────────┐   │
│  │ 🟢 https://cdn.site/hls/stream.m3u8   [▶ Play]  │   │
│  │ 🟢 https://cdn.site/video.mp4         [▶ Play]  │   │
│  └──────────────────────────────────────────────────┘   │
│  Status: 🎬 Stream mode  🟢 Video detected              │
└──────────────────────────────────────────────────────────┘
```

---

## 🚂 Deploy to Railway

The project can be deployed as a **web-only** app on Railway. The Browser Player feature uses Tauri IPC and won't work in the browser, but YouTube sync, chat, and all Firebase features work perfectly.

### Prerequisites

| Item | Required |
|------|----------|
| [Railway account](https://railway.app) | ✅ |
| Firebase project (see [Configure Firebase](#2-configure-firebase)) | ✅ |
| GitHub repo with pushed code | ✅ |

### One-click Deploy

> ⚠️ **Important:** The app lives in the `watch-party/` subdirectory. You **must** set the **Service Root Directory** in the Railway Dashboard — `build.rootDir` in `railway.json` is silently ignored by Railpack.

1. **Push to GitHub** (if not already):
   ```bash
   cd watch-party
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-username/watchme.git
   git push -u origin main
   ```

2. **Create a Railway project**:
   - Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
   - Select your `watchme` repository

3. **Set Service Root Directory** (⚠️ required):
   - In the Railway Dashboard, go to your service → **Settings** → **Service Root Directory**
   - Set it to: **`watch-party`**
   - This tells Railpack where `package.json` lives

4. **Set environment variables** in Railway Dashboard:
   | Variable | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | Your Firebase API key |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `watchme-55d62.firebaseapp.com` |
   | `VITE_FIREBASE_DATABASE_URL` | `https://watchme-55d62-default-rtdb.europe-west1.firebasedatabase.app` |
   | `VITE_FIREBASE_PROJECT_ID` | `watchme-55d62` |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `watchme-55d62.firebasestorage.app` |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `89937118409` |
   | `VITE_FIREBASE_APP_ID` | `1:89937118409:web:...` |

5. **Deploy** — Railway reads `railway.json` and runs:
   ```
   npm run build:railway                               # builds with VITE_RAILWAY=1 alias
   npm run preview -- --host 0.0.0.0 --port $PORT      # serves on Railway PORT
   ```

6. **Open** the generated Railway URL (`https://<project>.up.railway.app`).

### What works on Railway

| Feature | Status |
|---------|--------|
| ✅ Create/Join rooms | Full support |
| ✅ YouTube sync (play/pause/seek) | Full support |
| ✅ Chat | Full support |
| ✅ User list + admin panel | Full support |
| ❌ Browser Player (Tauri only) | Shows placeholder — needs desktop app |

### Build locally for web

```bash
cd watch-party
VITE_RAILWAY=1 npm run build
npm run preview
```

This builds the web version with the Tauri API stub. Open `http://localhost:4173` in any browser.

---

## 🛠 Project Structure

```
watch-party/
├── src/
│   ├── components/
│   │   ├── BrowserPlayer.jsx   # Built-in browser + HLS playback
│   │   ├── VideoPlayer.jsx     # YouTube player
│   │   ├── Chat.jsx            # Real-time chat
│   │   └── UserList.jsx        # Online users
│   ├── hooks/
│   │   ├── useBrowserSync.js   # Firebase sync for browser mode
│   │   ├── useVideoSync.js     # Firebase sync for YouTube mode
│   │   ├── useRoom.js          # Room creation/joining
│   │   └── useAuth.js          # Anonymous auth
│   └── context/
│       └── RoomContext.jsx      # Room state provider
├── src-tauri/
│   ├── src/
│   │   └── lib.rs              # Rust backend (commands + network sniffer)
│   ├── preload/
│   │   └── browser-preload.js  # Preload script for child webview
│   ├── capabilities/
│   │   └── default.json        # Tauri v2 permissions
│   └── tauri.conf.json         # Tauri configuration
├── start-dev.bat               # Launch dev mode
├── start-release.bat           # Launch release build
└── start-firebase-emu.bat      # Launch Firebase emulators
```

---

## 📦 Scripts

| Command | Description |
|---|---|
| `npx tauri dev` | Start dev server with hot-reload |
| `npx tauri build` | Build release binary + MSI/NSIS installer |
| `npm run dev` | Vite frontend only (no Tauri) |
| `npm run build` | Build frontend only |

---

## 🔧 Troubleshooting

**Q: Child webview shows blank/dark area**
- Check the Rust terminal for `[Rust] create_browser_webview: url=...` — if not seen, the IPC command failed
- Verify `capabilities/default.json` includes `"browser-player"` in the windows array
- Some sites block embedding via `X-Frame-Options` — use the Network Sniffer approach instead

**Q: No video URLs detected**
- Open the site in a regular browser first and check if it uses HLS (`.m3u8`) in network tab
- The Rust terminal should show `[Rust] 🎬 Video URL detected: ...` — if not, the site may use a custom protocol
- Try clicking **Sync Player** to re-scan the page

**Q: HLS playback not working**
- Verify `hls.js` is installed: `npm ls hls.js`
- Check the browser console for HLS errors
- The stream may require a specific `Referer` header — try playing in browser mode instead
