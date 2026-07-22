# WatchMe — Watch Party 🎬

**WatchMe** is a real-time synchronized video-watching platform. Create or join a room, play YouTube videos (or stream HLS/MP4 content from the built-in browser), and everything — play, pause, seek, queue — stays in sync across all participants. Built with **React 19 + Vite 6 + Firebase Realtime Database + Electron**.

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture Overview](#-architecture-overview)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Firebase Setup](#1-configure-firebase)
  - [Environment Variables](#2-environment-variables)
  - [Development (Browser Only)](#3a-development---browser-only)
  - [Development (Desktop Electron)](#3b-development---desktop-electron)
  - [Production Build + Installer](#3c-production-build--installer)
- [Components](#-components)
  - [Home Page](#home-page)
  - [Room Page](#room-page)
  - [Chat](#chat)
  - [UserList](#userlist)
  - [VideoPlayer (YouTube)](#videoplayer-youtube)
  - [BrowserPlayer (In-App Browser)](#browserplayer-in-app-browser)
  - [VideoQueue](#videoqueue)
  - [AddVideoModal](#addvideomodal)
  - [RoomSettings](#roomsettings)
  - [SharePopover](#sharepopover)
  - [QuickAccess](#quickaccess)
  - [PasswordGate](#passwordgate)
  - [CreateRoomModal](#createroommodal)
  - [AdminPanel](#adminpanel)
  - [PublicRoomList](#publicroomlist)
  - [RoomPreview](#roompreview)
  - [TheaterToggle](#theatertoggle)
- [Hooks](#-hooks)
  - [useAuth](#useauth)
  - [useRoom](#useroom)
  - [useVideoSync (YouTube)](#usevideosync)
  - [useBrowserSync (Browser Player)](#usebrowsersync)
  - [useTheme](#usetheme)
  - [RoomContext / useRoomContext](#roomcontext--useroomcontext)
- [YouTube Sync Mechanism](#-youtube-sync-mechanism)
- [Browser Player Architecture](#-browser-player-architecture)
  - [How It Works](#how-it-works)
  - [Preload Script (browser-preload.js)](#preload-script)
  - [Video Sniffer (video-sniffer.js)](#video-sniffer)
  - [HLS.js Playback](#hlsjs-playback)
- [Electron Desktop App](#-electron-desktop-app)
  - [Main Process (main.js)](#main-process)
  - [Ad Blocker](#ad-blocker)
  - [Fullscreen & DevTools Hotkeys](#fullscreen--devtools-hotkeys)
- [Design System](#-design-system)
  - [Dark Theme (default)](#dark-theme-default)
  - [Light Theme](#light-theme)
  - [Cinema Mode](#cinema-mode)
  - [Ghost Pill Buttons](#ghost-pill-buttons)
  - [Editorial Inputs](#editorial-inputs)
  - [Keyframes & Animations](#keyframes--animations)
- [Deployment](#-deployment)
  - [Railway (Web)](#railway-web)
  - [Build Locally for Web](#build-locally-for-web)
- [Scripts Reference](#-scripts-reference)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Features

| Feature | Description | Platform |
|---------|-------------|----------|
| 🎥 **YouTube Sync** | Watch YouTube videos together with frame-accurate play/pause/seek sync | Web + Desktop |
| 🌐 **In-App Browser** | Built-in Chromium `<webview>` to browse any website inside the app | Desktop only |
| 🔍 **Video Sniffing** | Automatically detect HLS (`.m3u8`) and MP4 video streams on loaded pages | Desktop only |
| 📡 **HLS.js Playback** | Play detected HLS streams directly in the app with sync | Desktop only |
| 👥 **Real-time Sync** | All playback events synchronized via Firebase Realtime Database | Web + Desktop |
| 💬 **Built-in Chat** | Real-time messaging between room members | Web + Desktop |
| 📋 **Video Queue** | Collaborative queue — anyone can add videos, reorder, or remove | Web + Desktop |
| 🔐 **Anonymous Auth** | No registration required — auto-generated guest names | Web + Desktop |
| 🌓 **Dark/Light Theme** | Full cinema-inspired dark theme with light mode toggle | Web + Desktop |
| 🎬 **Cinema Mode** | Immersive fullscreen video with hidden UI | Web + Desktop |
| 🚂 **Railway Deploy** | One-click deploy to Railway as a web-only app | Web |
| 🖥️ **Windows Installer** | Electron-based native desktop app with MSI/NSIS installer | Desktop |
| 🚫 **Ad Blocker** | Built-in ad blocking via @ghostery/adblocker-electron (EasyList + EasyPrivacy) | Desktop |
| 🏠 **Public Room Browser** | Browse and join public rooms from the home page | Web + Desktop |
| 🔒 **Password-Protected Rooms** | Optional password gate for private rooms | Web + Desktop |

---

## 🏗 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        User's Device                              │
│                                                                  │
│  ┌───────────────┐    ┌──────────────────────────────────────┐  │
│  │  Electron      │    │  Browser (Chrome/Firefox/Safari)     │  │
│  │  Main Process  │    │                                      │  │
│  │  (main.js)     │    │  http://localhost:5173 (dev)         │  │
│  │                │    │  https://watchme.railway.app (prod)  │  │
│  │  ┌──────────┐  │    └──────────┬───────────────────────────┘  │
│  │  │AdBlocker │  │               │                             │
│  │  │(Ghostery)│  │               │                             │
│  │  └──────────┘  │               │                             │
│  │  ┌──────────┐  │               │                             │
│  │  │BrowserWin│  │               │                             │
│  │  │1216x839  │  │               │                             │
│  │  └──────────┘  │               │                             │
│  └───────┬────────┘               │                             │
│          │                        │                             │
│          │   Electron loads       │   Browser loads directly    │
│          │   http://localhost:5173 │                             │
│          ▼                        ▼                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Renderer Process (React + Vite)              │   │
│  │                                                          │   │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │YouTube  │ │ Browser  │ │ Chat     │ │ UserList   │  │   │
│  │  │Player   │ │ Player   │ │          │ │            │  │   │
│  │  │(react-  │ │(<webview>│ │          │ │ Avatar +   │  │   │
│  │  │youtube) │ │ + HLS.js)│ │          │ │ Badges     │  │   │
│  │  └────┬────┘ └────┬─────┘ └────┬─────┘ └────────────┘  │   │
│  │       │           │            │                        │   │
│  │       ▼           ▼            ▼                        │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │           Firebase Realtime Database              │   │   │
│  │  │  /rooms/{roomId}/                                 │   │   │
│  │  │    ├── hostId                                     │   │   │
│  │  │    ├── name                                       │   │   │
│  │  │    ├── password (optional, hashed)                │   │   │
│  │  │    ├── isPublic                                   │   │   │
│  │  │    ├── createdAt                                  │   │   │
│  │  │    ├── memberCount                                │   │   │
│  │  │    ├── videoId                                    │   │   │
│  │  │    ├── playerState (playing/paused)               │   │   │
│  │  │    ├── playerPosition (seconds)                   │   │   │
│  │  │    ├── updatedAt (server timestamp)               │   │   │
│  │  │    ├── playerType ("youtube" | "browser")         │   │   │
│  │  │    ├── messages/{msgId}                           │   │   │
│  │  │    │    ├── text                                  │   │   │
│  │  │    │    ├── sender                                │   │   │
│  │  │    │    ├── senderId                              │   │   │
│  │  │    │    └── timestamp                             │   │   │
│  │  │    ├── queue/{index}                              │   │   │
│  │  │    │    ├── videoId                               │   │   │
│  │  │    │    ├── title                                 │   │   │
│  │  │    │    ├── addedBy                               │   │   │
│  │  │    │    └── addedById                             │   │   │
│  │  │    ├── members/{uid}                              │   │   │
│  │  │    │    ├── displayName                           │   │   │
│  │  │    │    ├── ip (public IP via ipify)              │   │   │
│  │  │    │    └── joinedAt                              │   │   │
│  │  │    └── browserState (when playerType="browser")   │   │   │
│  │  │         ├── playing                               │   │   │
│  │  │         ├── currentTime                           │   │   │
│  │  │         └── updatedAt                             │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **UI Framework** | [React](https://react.dev/) | ^19.2.0 |
| **Build Tool** | [Vite](https://vitejs.dev/) | ^6.3.0 |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) (with `@tailwindcss/vite`) | ^4.1.0 |
| **Backend / DB** | [Firebase Realtime Database](https://firebase.google.com/products/realtime-database) + [Anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth) | ^12.16.0 |
| **Desktop Runtime** | [Electron](https://www.electronjs.org/) | ^31.6.0 |
| **Desktop Build** | [electron-builder](https://www.electron.build/) | ^26.15.0 |
| **YouTube Player** | [react-youtube](https://www.npmjs.com/package/react-youtube) | ^10.1.0 |
| **HLS Playback** | [hls.js](https://hlsjs.video-dev.org/) | ^1.6.0 |
| **Ad Blocker** | [@ghostery/adblocker-electron](https://github.com/ghostery/adblocker) | ^2.6.0 |
| **Video Sniffer (Electron)** | `electron/browser-preload.js` + `electron/video-sniffer.js` (injected via `executeJavaScript`) | — |
| **Vite Electron Plugin** | [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron) | ^0.30.0 |
| **Linting** | [oxlint](https://oxc.rs/) | ^0.16.0 |
| **Deployment** | [Railway](https://railway.app) via [Nixpacks](https://nixpacks.com/) | — |
| **Runtime Detection** | `src/lib/runtime.js` (checks `navigator.userAgent` for `"Electron"`) | — |

---

## 📁 Project Structure

```
watch-party/                      # ✅ Main app directory (monorepo root)
├── electron/                     # Electron main process & preload scripts
│   ├── main.js                   #   BrowserWindow config, ad blocker, hotkeys
│   ├── browser-preload.js        #   Injected into <webview> for video sniffing
│   └── video-sniffer.js          #   Alternative sniffing script for legacy support
│
├── src/                          # React application source
│   ├── main.jsx                  #   Entry point (React 19 createRoot)
│   ├── App.jsx                   #   Root component (HashRouter + routes)
│   ├── index.css                 #   Global styles, design tokens, animations
│   │
│   ├── components/               # Reusable UI components
│   │   ├── AdminPanel.jsx        #   Room admin controls (background, effects)
│   │   ├── BrowserPlayer.jsx     #   In-App Browser <webview> + HLS.js player
│   │   ├── Chat.jsx              #   Real-time chat panel
│   │   ├── CreateRoomModal.jsx   #   Create room dialog (name, visibility, password)
│   │   ├── PasswordGate.jsx      #   Password prompt for private rooms
│   │   ├── PublicRoomList.jsx    #   Browse public rooms on home page
│   │   ├── QuickAccess.jsx       #   Quick-access site shortcuts
│   │   ├── RoomPreview.jsx       #   Animated room preview (hero section)
│   │   ├── TheaterToggle.jsx     #   Theater mode toggle button
│   │   ├── UserList.jsx          #   Online participants panel
│   │   └── VideoPlayer.jsx       #   YouTube IFrame player wrapper
│   │
│   ├── context/
│   │   └── RoomContext.jsx       # Room-level state provider (messages, members, room data)
│   │
│   ├── data/
│   │   └── quickAccessSites.jsx  # Preset site list for QuickAccess (YouTube, Twitch, etc.)
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useAuth.js            #   Firebase anonymous auth + guest name generation
│   │   ├── useBrowserSync.js     #   Browser player sync (play/pause/seek via Firebase)
│   │   ├── useRoom.js            #   Room CRUD (create, join, leave, delete)
│   │   ├── useTheme.js           #   Dark/Light theme toggle with localStorage
│   │   └── useVideoSync.js       #   YouTube player sync (play/pause/seek via Firebase)
│   │
│   ├── lib/                      # Utility libraries
│   │   ├── firebase.js           #   Firebase app initialization & exports
│   │   ├── roomUtils.js          #   generateRoomId(), extractVideoId()
│   │   └── runtime.js            #   isElectron(), isDesktop(), getRuntime()
│   │
│   └── pages/
│       ├── Home.jsx              # Landing page (profile card, recent rooms, browse public)
│       └── Room.jsx              # Main room page (player, sidebar, queue, settings)
│
├── scripts/
│   └── generate-icons.mjs        # Icon generation helper script
│
├── public/
│   ├── favicon.svg               # Favicon
│   ├── icons.svg                 # SVG sprite/icons
│   └── assets/                   # Static images (logo variants)
│
├── dist/                         # Built React app output (gitignored)
├── dist-electron/                # Built Electron main process (gitignored)
├── release/                      # electron-builder output (gitignored)
│
├── index.html                    # Vite HTML entry point
├── package.json                  # Dependencies & scripts
├── vite.config.js                # Vite + Tailwind + Electron plugin config
├── nixpacks.toml                 # Railway Nixpacks build config
├── tailwind.config.js            # Tailwind v4 configuration
├── .env.example                  # Environment variable template
├── .env                          # Local environment variables (gitignored)
├── .gitignore
│
├── start-dev.bat                 # Launch Electron dev mode (double-click)
├── start-release.bat             # Build Electron release installer (double-click)
├── start-firebase-emu.bat        # Launch Firebase emulators (double-click)
│
├── ELECTRON_SETUP.md             # Detailed Electron setup documentation
├── PROJECT_DESCRIPTION.txt       # Short project description
│
├── node_modules/                 # Dependencies (gitignored)
│
├── src-tauri/                    # 🗑 Legacy Tauri v2 source (no longer used)
│   ├── src/lib.rs                #   Legacy Rust backend (kept for reference)
│   ├── src/main.rs               #   Legacy Rust entry point
│   ├── tauri.conf.json           #   Legacy Tauri config
│   ├── capabilities/default.json #   Legacy Tauri permissions
│   └── preload/browser-preload.js#   Legacy Tauri preload (copied to electron/)
│
└── .vscode/                      # VS Code settings
```

---

## 🚀 Quick Start

### Prerequisites

| Dependency | Version | Check Command |
|-----------|---------|---------------|
| [Node.js](https://nodejs.org/) | ≥ 20.19.0 | `node --version` |
| npm (comes with Node.js) | ≥ 10.x | `npm --version` |
| [Git](https://git-scm.com/) | Any | `git --version` |

> **For Desktop (Electron) development only:**
> - [Rust](https://rustup.rs/) ≥ 1.77 (only if you also want to build the legacy Tauri version)
> - No additional build tools required — Electron is pure Node.js

### 1. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/) → **Create a project** (or use existing)
2. Enable **Authentication** → **Sign-in method** → **Anonymous** (⚠️ required)
3. Enable **Realtime Database** → Create in **test mode** (start with `true` rule, then secure later)
4. In Project Settings → **General** → **Your apps** → **Add app** → **Web**
5. Copy the `firebaseConfig` object values

### 2. Environment Variables

Copy the example env file and fill in your Firebase credentials:

```powershell
cd watch-party
copy .env.example .env
```

Edit `.env` with your Firebase project values:

```env
# 🔑 Required — get from Firebase Console → Project Settings → Web App
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.europe-west1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890

# 🧪 Optional — set to "true" to use Firebase Emulators locally
# VITE_USE_EMULATORS=true
```

All variables are prefixed with `VITE_` — Vite exposes them to client code via `import.meta.env`.

### 3. Install Dependencies

```powershell
cd watch-party
npm install
```

### 3a. Development — Browser Only

```powershell
npm run dev
```

Starts Vite dev server at `http://localhost:5173`. Open in any browser. All features work **except** the In-App Browser (which requires Electron).

### 3b. Development — Desktop (Electron)

```powershell
npm run electron:dev
```

Or double-click **`start-dev.bat`**.

This starts the Vite dev server + launches the Electron window. Changes to `.jsx`/`.css` files hot-reload instantly. DevTools open automatically (detached mode).

### 3c. Production Build + Installer

```powershell
npm run electron:build
```

Or double-click **`start-release.bat`**.

Output:
- `dist/` — React production build
- `dist-electron/` — Electron main process
- Installer created by electron-builder:
  - MSI: `release/WatchMe Setup <version>.msi`
  - NSIS: `release/WatchMe Setup <version>.exe`
  - `release/win-unpacked/` — Portable version

### Firebase Emulators (Optional)

For local Firebase development without a real project:

```powershell
npm run emulators
```

Or double-click **`start-firebase-emu.bat`**.

Requires `firebase-tools` installed globally or locally. Set `VITE_USE_EMULATORS=true` in `.env` to connect the app to emulators.

---

## 🧩 Components

### Home Page

📄 [`src/pages/Home.jsx`](watch-party/src/pages/Home.jsx)

The landing page shown at route `/` (HashRouter: `#/`). Contains:

- **ProfileCard** — Shows the guest display name with inline editing (click to edit, Enter to save, Escape to cancel). Uses `updateDisplayName` from `useAuth`.
- **CreateRoomModal** trigger — "Create Room" button opens the creation dialog.
- **Join Room** input — Type a 6-character room ID to join.
- **Recent Rooms** — `getRecentRooms()` / `pushRecentRoom()` from localStorage. Shows clickable tags for previously visited rooms.
- **Public Room List** — Fetches from Firebase `/publicRooms` node. Lists all public rooms with member count and creation time.
- **RoomPreview** — Animated hero section with iridescent gradient text, floating screenshots, and CTA buttons.

### Room Page

📄 [`src/pages/Room.jsx`](watch-party/src/pages/Room.jsx) (1396 lines — the largest component)

The main room experience at route `/room/:roomId` (HashRouter: `#/room/:roomId`). Structure:

```
Room.jsx
├── Sub-components (defined in same file):
│   ├── SyncStatus({ status })         — Shows connection sync indicator
│   ├── SharePopover({ roomId, isOpen, onClose, anchorRef })
│   │                                    — Share room link: Copy invite link / Copy room ID
│   ├── AddVideoModal({ isOpen, onClose, onAdd })
│   │                                    — Modal to add YouTube video by URL or ID
│   ├── QueueItem({ item, index, onPlayNext, onRemove, isNowPlaying })
│   │                                    — Single queue entry with play/remove buttons
│   ├── VideoQueue({ queue, currentVideoId, onPlayNext, onRemove, onClear })
│   │                                    — Full queue panel with clear-all button
│   ├── RoomSettings({ isOpen, onClose, theme, toggleTheme, cinemaMode, onToggleCinema, anchorRef })
│   │                                    — Settings dropdown (w-80): Theme toggle, Cinema Mode, Player type
│   ├── EmptyPlayerState({ onAddVideo, onOpenBrowser })
│   │                                    — Shown when nothing is playing
│   ├── ParticipantsButton({ count, isOpen, onClick })
│   │                                    — SVG icon + count badge for toggling participant sidebar
│   ├── ChatButton({ unread, isOpen, onClick })
│   │                                    — Chat icon with unread count badge
│   └── RoomContent()                    — Main room logic component
│
├── State:
│   ├── activeSidebarTab: null | 'chat' | 'participants'
│   ├── cinemaMode: boolean
│   ├── showSettings: boolean
│   └── showSharePopover: boolean
│
└── Sidebar (conditional): Chat or UserList depending on activeSidebarTab
    Hidden when cinemaMode is active
```

**Key layout areas:**
- **Top bar**: Room name, room ID badge (click to copy), Share button, Participants button, Chat button, Settings button
- **Main area**: Video player (YouTube OR BrowserPlayer) or EmptyPlayerState
- **Bottom controls** (overlaid on player): Add Video, Open Browser (desktop only), Video Queue toggle, Theater Mode toggle
- **Sidebar** (right side, 380px wide): Chat or UserList, toggled by buttons in top bar
- **Cinema Mode**: Hides top bar, sidebar, all controls — just the video player filling the window

### Chat

📄 [`src/components/Chat.jsx`](watch-party/src/components/Chat.jsx)

Real-time chat sidebar. Uses `useRoomContext()` to access `messages` and `sendMessage`. Features:
- Auto-scrolls to bottom on new messages (with `useRef` + `scrollIntoView`)
- Shows avatar letter (first letter of display name) with grayscale background
- Timestamps formatted via `formatTime()` (relative: "now", "1m", "2h", "3d", or date)
- Message input with Enter to send, empty message prevention
- Messages stored in Firebase at `/rooms/{roomId}/messages/{pushKey}`

### UserList

📄 [`src/components/UserList.jsx`](watch-party/src/components/UserList.jsx)

Online participants sidebar. Uses `useRoomContext()` for `members` and `entries` (memoized `Object.entries(members)`). Features:
- **AvatarInitial** — Deterministic grayscale color based on uid hash (mod 360 for hue, clamped lightness 30-60%)
- **Badges**: "Host" (golden star) for the room creator, "You" for the current user
- Shows "No participants yet" fallback when no members
- Uses `hostId` from room data to identify the host
- Wrapped in a scrollable container (`overflow-y-auto`)

### VideoPlayer (YouTube)

📄 [`src/components/VideoPlayer.jsx`](watch-party/src/components/VideoPlayer.jsx)

Wraps `react-youtube` (`YouTube` component). Features:
- `YT_OPTS` — playerVars: `autoplay=1`, `controls=1`, `rel=0`, `modestbranding=1`
- `onReady(event)` — saves player instance to `playerRef` (passed from Room.jsx)
- Accepts `roomId` prop, used by `useVideoSync` hook internally
- The `playerRef` is used by `useVideoSync` to call `playVideo()`, `pauseVideo()`, `seekTo()`, `getCurrentTime()`, `getPlayerState()`

### BrowserPlayer (In-App Browser)

📄 [`src/components/BrowserPlayer.jsx`](watch-party/src/components/BrowserPlayer.jsx)

The most complex component (~778 lines). Provides a full embedded Chromium browser via `<webview>` tag (Electron only). See [Browser Player Architecture](#-browser-player-architecture) for details.

### VideoQueue

📄 [`src/pages/Room.jsx`](watch-party/src/pages/Room.jsx:247-362)

Sub-component `VideoQueue` + `QueueItem`. Features:
- Queue stored in Firebase at `/rooms/{roomId}/queue` as an ordered object
- Each item: `{ videoId, title, addedBy, addedById }`
- "Now Playing" indicator on the currently active item
- Play Next button (loads video), Remove button (deletes from Firebase), Clear All button
- Queue syncs across all room members in real time

### AddVideoModal

📄 [`src/pages/Room.jsx`](watch-party/src/pages/Room.jsx:157-244)

Modal dialog for adding a YouTube video. Features:
- Input accepts full YouTube URL (any format: `youtube.com/watch?v=`, `youtu.be/`, `m.youtube.com/`) OR raw video ID
- `extractVideoId()` from `roomUtils.js` parses the input
- Calls `onAdd(videoId)` callback provided by RoomContent
- Closes on successful add or Escape key / backdrop click

### RoomSettings

📄 [`src/pages/Room.jsx`](watch-party/src/pages/Room.jsx:365-463)

Dropdown panel (320px wide, `w-80`) anchored to the Settings button. Options:
- **Theme** — Toggles between dark (`data-theme="dark"`) and light (`data-theme="light"`) via `useTheme().toggleTheme`
- **Cinema Mode** — Toggles immersive fullscreen video mode
- **Player** — Switches between `"youtube"` and `"browser"` player types (browser type requires Electron)
- Closes on Escape key, backdrop click, or clicking outside

### SharePopover

📄 [`src/pages/Room.jsx`](watch-party/src/pages/Room.jsx:55-154)

Popover anchored to the Share button. Two copy options:
- **Copy Invite Link** — Copies the full room URL (`window.location.origin + /room/ + roomId`)
- **Copy Room ID** — Copies just the 6-character room ID
- Shows brief "Copied!" feedback text using `setTimeout`

### QuickAccess

📄 [`src/components/QuickAccess.jsx`](watch-party/src/components/QuickAccess.jsx)

Shown in the BrowserPlayer address bar area. Renders a grid of preset site buttons from [`src/data/quickAccessSites.jsx`](watch-party/src/data/quickAccessSites.jsx). Each site has:
- `name` — Display label
- `url` — Navigate target
- `icon` — SVG component (YouTube, Twitch, Vimeo, Film, TV, Music, Document, Globe, Sparkles, Play)
- Clicking loads the URL into the `<webview>`

### PasswordGate

📄 [`src/components/PasswordGate.jsx`](watch-party/src/components/PasswordGate.jsx)

Shown when joining a room that has a `password` field set. Features:
- Text input for password
- Submit button with explicit comparison (plain text — the password is stored as plain text in Firebase)
- Calls `onVerified()` callback on successful match
- Shows the room name as context

### CreateRoomModal

📄 [`src/components/CreateRoomModal.jsx`](watch-party/src/components/CreateRoomModal.jsx)

Full-screen modal dialog for room creation. Three steps/fields:

1. **Room Image / Style** — Optional background color picker, optional image URL for room branding
2. **Room Name** — Required text input
3. **Privacy** — Toggle between Public (listed in `/publicRooms`) and Private (requires password to join)
4. **Room ID** — Auto-generated 6-character alphanumeric (no ambiguous chars: `0OIl1B8` excluded)

On create:
- Writes room data to `/rooms/{roomId}`
- If public, writes to `/publicRooms/{roomId}` with name + createdAt
- If private, sets `password` field
- Creates initial member entry for the host
- Navigates to `/room/{roomId}`

### AdminPanel

📄 [`src/components/AdminPanel.jsx`](watch-party/src/components/AdminPanel.jsx)

Room administration panel (accessible to host only). Shows:
- **Room ID** with copy button
- **Background Mode** — Toggles between solid color and image background
- **Background Image URL** — Text input to set a custom background image
- **Background Color** — Color picker to set a solid background color
- Applied via `update(roomRef, { ... })` to Firebase

### PublicRoomList

📄 [`src/components/PublicRoomList.jsx`](watch-party/src/components/PublicRoomList.jsx)

Fetches and displays public rooms from Firebase `/publicRooms` node. Features:
- Real-time listener with `onValue`
- Each room shows: name, member count (from the main room node), creation time
- Click to navigate directly into the room
- Shows "No public rooms yet" fallback
- Loading state while fetching

### RoomPreview

📄 [`src/components/RoomPreview.jsx`](watch-party/src/components/RoomPreview.jsx)

Animated hero section on the home page. Visual effects:
- Iridescent gradient text (`--gradient-iridescent-fade` + `iridescent-shift` animation)
- Floating screenshots with staggered 3D transforms and fade-in animations
- "Start Watching" and "Browse Rooms" CTA buttons
- Responsive layout (stacks on mobile)

### TheaterToggle

📄 [`src/components/TheaterToggle.jsx`](watch-party/src/components/TheaterToggle.jsx)

Simple toggle button for theater mode. Shows expand/collapse icon depending on `isTheaterMode` state. Clicking calls `onToggle()` callback.

---

## 🪝 Hooks

### useAuth

📄 [`src/hooks/useAuth.js`](watch-party/src/hooks/useAuth.js)

Manages Firebase Anonymous Authentication.

```javascript
const {
  user,          // Firebase user object | null
  loading,       // boolean — true while auth state resolves
  displayName,   // string — current guest display name
  login,         // () => Promise — force re-authentication
  logout,        // () => Promise — sign out
  updateDisplayName, // (name) => Promise — update Firebase profile
} = useAuth();
```

**Automatic sign-in**: On mount, calls `signInAnonymously(auth)`. If already signed in (Firebase persists the session), reuses the existing session.

**Guest name generation**: Uses `generateGuestName()` which combines a random adjective + noun + number:
- Adjectives: `["Brave", "Cool", "Smart", "Wild", "Calm", "Bold", "Fast", "Nice", ...]`
- Nouns: `["Panda", "Tiger", "Eagle", "Wolf", "Bear", "Fox", "Hawk", "Owl", ...]`
- Number: Random 2-digit suffix
- Examples: `"BravePanda42"`, `"CoolTiger17"`
- **Persisted to localStorage**: `localStorage.getItem("watchme_displayName")` — the name remains stable across sessions unless explicitly changed.

**Name update flow**: `updateDisplayName(newName)` → calls `updateProfile(user, { displayName: newName })` → saves to `localStorage`.

### useRoom

📄 [`src/hooks/useRoom.js`](watch-party/src/hooks/useRoom.js)

Room CRUD operations.

```javascript
const {
  createRoom,    // async (roomId, name, isPublic, password?) => writes to Firebase
  joinRoom,      // async (roomId) => adds member, increments count
  leaveRoom,     // async (roomId) => removes member, decrements count, auto-deletes if last
  deleteRoom,    // async (roomId) => removes room + publicRoom entry
  loading,       // boolean
} = useRoom(roomId, user, displayName, onRoomData);
```

**`createRoom(roomId, name, isPublic, password?)`:**
- Generates room data: `{ hostId: user.uid, name, isPublic, password (optional), createdAt: serverTimestamp(), memberCount: 1, videoId: null, playerState: "paused", playerPosition: 0, updatedAt: serverTimestamp(), playerType: "youtube" }`
- Creates member entry: `{ displayName, ip: <public IP via ipify.org>, joinedAt: serverTimestamp() }`
- If public: writes room name + createdAt to `/publicRooms/{roomId}`

**`joinRoom(roomId)`:**
- Adds member node under `/rooms/{roomId}/members/{uid}`
- Atomically increments `memberCount` via `increment(1)`

**`leaveRoom(roomId)`:**
- Removes member node
- Atomically decrements `memberCount`
- If memberCount reaches 0: auto-deletes the room node and publicRoom entry

**`deleteRoom(roomId)`:**
- Nulls `/rooms/{roomId}` and `/publicRooms/{roomId}`

**Public IP**: Uses `https://api.ipify.org?format=json` to get the member's public IP on room join.

**Real-time subscription**: `useEffect` sets up `onValue(roomRef, (snapshot) => { ... })` and calls `onRoomData(snapshot.val())` on every change. Returns unsubscribe function for cleanup.

### useVideoSync

📄 [`src/hooks/useVideoSync.js`](watch-party/src/hooks/useVideoSync.js)

YouTube player synchronization hook. This is the most critical hook — it keeps all room members' YouTube players in sync.

```javascript
const {
  roomState,        // { videoId, playerState, playerPosition, playerType, queue, ... }
  setRoomState,     // setter (used internally)
  currentVideoId,   // string | null
  isReady,          // boolean — true when initial sync state is loaded
} = useVideoSync(roomId, playerRef);
```

**Sync mechanism** (see [YouTube Sync Mechanism](#-youtube-sync-mechanism) for full details):

1. **Local → Remote**: Player events (play, pause, seek) call Firebase `update()`:
   - `playerState`: `"playing"` | `"paused"`
   - `playerPosition`: current time in seconds
   - `updatedAt`: `serverTimestamp()`
   - `videoId`: when a new video is loaded

2. **Remote → Local**: Firebase `onValue` listener fires on every change:
   - **Loop Guard**: `isApplyingRemoteUpdate` ref prevents echo loops — if we just pushed a local update, we skip processing the remote event
   - **Late joiner handling**: On initial snapshot, calculates elapsed time since the remote update was written and seeks to the correct position:
     ```
     serverNowMs = Date.now() + serverTimeOffset
     elapsedSeconds = (serverNowMs - updatedAt * 1000) / 1000
     targetPosition = lastPosition + elapsedSeconds
     ```
   - If the remote state is `"playing"` and the local player is paused → calls `player.playVideo()` + `player.seekTo(targetPosition)`
   - If paused → calls `player.pauseVideo()` + `player.seekTo(targetPosition)`
   - Triggers only when difference > `SYNC_THRESHOLD` (1.5 seconds) to avoid jitter

3. **Video change**: When `videoId` changes, loads the new video via `player.loadVideoById()`

4. **Server time offset**: Uses Firebase `.info/serverTimeOffset` to calculate accurate server time for elapsed-time correction.

**YT_STATE mapping:**
```javascript
const YT_STATE = {
  UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2,
  BUFFERING: 3, CUED: 5,
};
```

**Cleanup**: On unmount, removes `onValue` listener and nullifies room state (sets `videoId: null`, `playerState: "paused"`, `playerPosition: 0`).

### useBrowserSync

📄 [`src/hooks/useBrowserSync.js`](watch-party/src/hooks/useBrowserSync.js)

Browser Player synchronization hook — mirrors the YouTube sync pattern but for HTML5 `<video>` elements.

```javascript
const {
  browserState,     // { playing, currentTime, ... }
  setBrowserState,  // setter
  isReady,          // boolean
} = useBrowserSync(roomId);
```

**Sync mechanism:**
1. Local state (from the detected `<video>` element's play/pause/timeupdate events) → Firebase:
   - `playing`: boolean
   - `currentTime`: seconds
   - `updatedAt`: `serverTimestamp()`

2. Remote state (from Firebase onValue) → local `<video>` element:
   - Same pattern as useVideoSync: Loop Guard, serverTimeOffset, elapsed time calculation
   - Sync threshold: 1.5 seconds
   - Uses `play()`, `pause()`, `currentTime = targetPosition` on the local video element

3. **`setPlayerType(roomId, type)`**: Utility function to switch the room's `playerType` between `"youtube"` and `"browser"`. Updates Firebase at `/rooms/{roomId}/playerType`.

### useTheme

📄 [`src/hooks/useTheme.js`](watch-party/src/hooks/useTheme.js)

Dark/Light theme management.

```javascript
const {
  theme,          // "dark" | "light"
  setTheme,       // (theme) => void
  toggleTheme,    // () => void
} = useTheme();
```

**Mechanism:**
- Reads initial theme from `localStorage.getItem("theme")` — defaults to `"dark"`
- Sets `document.documentElement.setAttribute("data-theme", theme)` — all CSS variables react to this attribute
- Persists to localStorage: `localStorage.setItem("theme", newTheme)`
- Returns a memoized `toggleTheme` function via `useCallback`

### RoomContext / useRoomContext

📄 [`src/context/RoomContext.jsx`](watch-party/src/context/RoomContext.jsx)

React Context provider that wraps the Room page. Exposes a unified API for all child components.

```javascript
const {
  roomData,       // Full Firebase room snapshot
  members,        // { uid: { displayName, ip, joinedAt }, ... }
  entries,        // [ [uid, { displayName, ... }], ... ] — memoized Object.entries(members)
  messages,       // [{ text, sender, senderId, timestamp }, ...]
  sendMessage,    // (text) => Promise
  roomId,         // string
  currentUser,    // Firebase user object
  hostId,         // string — uid of the room creator
  displayName,    // string
  updateDisplayName, // (name) => Promise
  loading,        // boolean
} = useRoomContext(); // Throws if used outside RoomProvider
```

**RoomProvider** wraps the Room page and orchestrates:
1. `useAuth()` — gets user and displayName
2. `useRoom(roomId, user, displayName, setRoomData)` — manages room lifecycle
3. `setRoomData(data)` callback stores the Firebase room snapshot in state
4. Messages are managed separately: `onValue` listener on `/rooms/{roomId}/messages`, with `sendMessage()` pushing via `push(messagesRef, { text, sender, senderId, timestamp })`
5. Messages are sorted by timestamp before providing to consumers

**Edge cases:**
- If `user` is null (auth not loaded), renders nothing until resolved
- If room doesn't exist (null snapshot), shows "Room not found" message

---

## 🔄 YouTube Sync Mechanism

The sync system is **event-driven** (no heartbeat polling). It relies entirely on Firebase Realtime Database's real-time `onValue` events.

### Data Flow

```
┌───────────┐          ┌──────────────────┐          ┌───────────┐
│  Member A  │          │  Firebase RTDB    │          │  Member B  │
│  (host)    │          │  /rooms/{id}/     │          │  (viewer)  │
├───────────┤          ├──────────────────┤          ├───────────┤
│ Presses   │          │                  │          │           │
│ Play ▶    │          │                  │          │           │
│    │      │          │                  │          │           │
│    ├──update({       │                  │          │           │
│    │   playerState:  │                  │          │           │
│    │     "playing",  │                  │          │           │
│    │   playerPosition│                  │          │           │
│    │     : 42.5,     │                  │          │           │
│    │   updatedAt:    │                  │          │           │
│    │   serverTimestamp│                  │          │           │
│    │ })──────────────►                  │          │           │
│    │                 │                  │          │           │
│    │                 │  onValue fires   │          │           │
│    │                 ├─────────────────►│          │           │
│    │                 │                  │  Loop Guard: skip if │
│    │                 │                  │  isApplyingRemote    │
│    │                 │                  │  Update === true     │
│    │                 │                  │          │           │
│    │                 │                  │  elapsed = (now +    │
│    │                 │                  │    offset - updatedAt│
│    │                 │                  │    * 1000) / 1000   │
│    │                 │                  │  target = position + │
│    │                 │                  │    elapsed           │
│    │                 │                  │          │           │
│    │                 │                  │  if |target - local| │
│    │                 │                  │     > 1.5s:          │
│    │                 │                  │    player.seekTo()   │
│    │                 │                  │    player.playVideo()│
│    │                 │                  │          │           │
│    │                 │                  │  ◄── Synced! ──►   │
└───────────┘          └──────────────────┘          └───────────┘
```

### Key Details

| Concept | Implementation |
|---------|---------------|
| **Trigger** | `onReady` callback from `react-youtube` starts the `onValue` listener |
| **Loop Guard** | `const isApplyingRemoteUpdate = useRef(false)` — set `true` before applying remote changes, set `false` after. If `true`, incoming Firebase events are ignored. |
| **Elapsed Time** | `targetPosition = lastPosition + (serverNowMs - updatedAt * 1000) / 1000` where `serverNowMs = Date.now() + serverTimeOffset` |
| **Server Time Offset** | Read from Firebase `.info/serverTimeOffset` — compensates for clock skew between server and client |
| **Sync Threshold** | `SYNC_THRESHOLD = 1.5` seconds — only seeks if the difference exceeds this, preventing jitter on frequent updates |
| **Late Joiner** | On initial snapshot, the elapsed time calculation ensures late joiners jump to the correct position |
| **Player State** | Mapped via `YT_STATE` enum: `UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5` |
| **Video Change** | When `videoId` changes, calls `player.loadVideoById(videoId)` on all clients |
| **Cleanup** | On room leave/unmount: `off()` removes the Firebase listener, `update()` nullifies room state |

---

## 🌐 Browser Player Architecture

The Browser Player is the most sophisticated feature — it embeds a full Chromium browser inside the app and automatically detects video streams for synchronized playback.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Electron Renderer Process                       │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  BrowserPlayer.jsx                                              │  │
│  │                                                                  │  │
│  │  ┌─── Address Bar ──────────────────────────────────────────┐   │  │
│  │  │  [🔍 https://example.com/movie]  [Go] [←] [→] [↻]     │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                  │  │
│  │  ┌─── Quick Access (shown when no URL loaded) ───────────────┐  │  │
│  │  │  [YouTube] [Twitch] [Vimeo] [Custom...]                   │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  │  ┌─── <webview> (Child Chromium) ────────────────────────────┐  │  │
│  │  │                                                           │  │  │
│  │  │  ╔═══════════════════════════════════════════════════════╗ │  │  │
│  │  │  ║  External website loaded inside child webview         ║ │  │  │
│  │  │  ║                                                       ║ │  │  │
│  │  │  ║  ┌─── Cross-origin <iframe> ───────────────────┐     ║ │  │  │
│  │  │  ║  │  (also scanned by MutationObserver)         │     ║ │  │  │
│  │  │  ║  └─────────────────────────────────────────────┘     ║ │  │  │
│  │  │  ║                                                       ║ │  │  │
│  │  │  ║  Preload Script (injected via executeJavaScript):     ║ │  │  │
│  │  │  ║  • MutationObserver watching for <video> elements     ║ │  │  │
│  │  │  ║  • Scans all iframes recursively (cross-origin too)   ║ │  │  │
│  │  │  ║  • Stores state in window.__browserData               ║ │  │  │
│  │  │  ╚═══════════════════════════════════════════════════════╝ │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  │  ┌─── Detected Video Streams Panel ──────────────────────────┐  │  │
│  │  │  🟢 https://cdn.site/hls/stream.m3u8           [▶ Play]  │  │  │
│  │  │  🟢 https://cdn.site/video.mp4                 [▶ Play]  │  │  │
│  │  │  🟢 https://cdn.site/videoplayback?...         [▶ Play]  │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  │  ┌─── HLS.js Player (Full-screen <video>) ──────────────────┐  │  │
│  │  │  │ Controls: [▶/⏸] [🔊────] [⛶ Fullscreen]             │  │  │
│  │  │  │ Sync status: 🟢 Synced with room                      │  │  │
│  │  │  └──────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

**State polling loop** (every 1500ms):

```
setInterval → webviewRef.executeJavaScript(`
  JSON.stringify({
    alive: window.__browserData?.alive,
    video: { src, currentTime, duration, paused, readyState },
    frameCount: window.__browserData?.frameCount,
    corsStatus: { iframeUrl: "accessible" | "blocked" }
  })
`).then(result => {
  const data = JSON.parse(result);
  updateReactState(data);
})
```

**Stream detection logic** (in `browser-preload.js`):

```
scanAllFrames():
  for each frame (top + iframes):
    scanDocumentForVideo(doc):
      for each <video> element found:
        if src contains .m3u8, .mp4, .webm, videoplayback, /hls/:
          add to window.__browserData.detectedUrls
      setup MutationObserver on doc for new <video> elements
```

**Navigation controls** (toolbar buttons):
- Back: `webviewRef.current?.goBack()`
- Forward: `webviewRef.current?.goForward()`
- Reload: `webviewRef.current?.reload()`
- URL input: `webviewRef.current?.loadURL(url)` or `webviewRef.current?.src = url`

### Preload Script

📄 [`electron/browser-preload.js`](watch-party/electron/browser-preload.js)

This script is **not** loaded via Electron's native `preload` attribute (because `<webview>` preload requires a `file://` URL). Instead, it's injected on `dom-ready` via:

```javascript
import BROWSER_PRELOAD from "../../electron/browser-preload.js?raw";

// In the dom-ready handler:
wv.executeJavaScript(BROWSER_PRELOAD);
```

**Capabilities** (thanks to `disablewebsecurity="true"`):
- Access cross-origin iframe `contentDocument` (normally blocked by Same-Origin Policy)
- Scan third-party video players embedded in iframes
- Control video elements across frames

**`window.__browserData` structure:**

```javascript
{
  alive: true,
  video: {
    src: "https://...",
    currentTime: 42.5,
    duration: 120.0,
    paused: false,
    readyState: 4  // HAVE_ENOUGH_DATA
  } | null,
  frameCount: 3,              // total frames scanned
  detectedUrls: [              // unique video URLs found
    "https://cdn.site/hls/stream.m3u8",
    "https://cdn.site/video.mp4"
  ],
  corsStatus: {
    "https://player.site.com": "accessible",
    "https://cdn.thirdparty.com": "blocked"
  }
}
```

**Key functions:**
- `init()` — Starts polling + scanning. Called immediately after injection.
- `scanDocumentForVideo(doc)` — Finds `<video>` elements in a document, filters URLs, attaches event listeners.
- `scanAllFrames()` — Iterates through `window.frames`, accesses `contentDocument` of each frame.
- `setupObserverOnDoc(doc, label)` — Creates a `MutationObserver` on a document subtree to detect dynamically added `<video>` elements.
- `setupObserversOnAllFrames()` — Sets up observers on top document + all iframes.
- `testIframeAccess()` — Diagnostics: checks which iframes are accessible vs blocked by CORS/SOP.
- `attachVideoEvents(videoEl)` — Listens to `play`, `pause`, `seeked` events on discovered videos.
- `cleanupObservers()` — Disconnects all MutationObservers on cleanup.
- `updateBrowserData()` — Polls video state (currentTime, paused, readyState) into `window.__browserData`.
- `log(level, msg, data)` — Structured logging captured by the `console-message` event in React.

### Video Sniffer

📄 [`electron/video-sniffer.js`](watch-party/electron/video-sniffer.js)

An alternative, simpler sniffing script (legacy / fallback). It:
- `findUntaggedVideos(root)` — Finds `<video>` elements without `data-sniffer-ignore` attribute
- `scanAllFrames()` — Scans all frames for untagged videos
- `attachListeners(video)` — Attaches `play`, `pause`, `timeupdate` listeners that post messages to the parent via `window.parent.postMessage`
- Runs on a polling interval

### HLS.js Playback

When a user clicks "Play" on a detected stream URL, the BrowserPlayer:
1. Creates an `<video>` element in the React DOM (replaces the `<webview>`)
2. If the URL is `.m3u8` (HLS): initializes `new Hls({ ... })` with the URL, attaches to the video element
3. If the URL is direct `.mp4` or other format: sets `video.src = detectedUrl`
4. Syncs playback across room members via `useBrowserSync` hook
5. Shows HLS.js loading/duration stats in a debug overlay

```javascript
// From BrowserPlayer.jsx
const hls = new Hls({
  capLevelToPlayerSize: true,
  maxBufferLength: 30,
});
hls.loadSource(detectedUrl);
hls.attachMedia(videoElement);
```

---

## 🖥️ Electron Desktop App

### Main Process

📄 [`electron/main.js`](watch-party/electron/main.js)

The Electron entry point. Creates the main `BrowserWindow` with specific configuration:

```javascript
const win = new BrowserWindow({
  width: 1216,
  height: 839,
  minWidth: 800,
  minHeight: 600,
  backgroundColor: '#09090b',    // zinc-950, matches dark theme
  icon: join(__dirname, '../public/assets/logo-favicon.png'),
  webPreferences: {
    webviewTag: true,             // ✅ Enables <webview> tag in renderer
    webSecurity: false,           // ✅ Disables CORS/SOP for iframe video sniffing
    nodeIntegration: true,        // ✅ Allows Node.js APIs in renderer
    contextIsolation: false,      // Required for nodeIntegration
    sandbox: false,
    spellcheck: false,
  },
});
```

**Key settings explained:**

| Setting | Purpose |
|---------|---------|
| `webviewTag: true` | Enables the `<webview>` HTML tag in the renderer process for the In-App Browser |
| `webSecurity: false` | Disables same-origin policy — allows the preload script to access cross-origin iframe content |
| `nodeIntegration: true` | Allows `require('electron')`, `fs`, `path` directly in React code |
| `contextIsolation: false` | Required when `nodeIntegration: true` |

### Ad Blocker

```javascript
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');

async function initAdBlocker() {
  const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  blocker.enableBlockingInSession(session.defaultSession);
}
```

Uses **EasyList** + **EasyPrivacy** filter lists (prebuilt). Blocks ads and trackers on all pages loaded in the app, including the In-App Browser `<webview>`.

### Fullscreen & DevTools Hotkeys

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen (`win.setFullScreen(!win.isFullScreen())`) |
| `F12` | Toggle DevTools (`win.webContents.toggleDevTools()`) — opens detached mode |

### Popup Blocker

```javascript
win.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);  // Opens popups in the system browser instead of the app
  return { action: 'deny' };
});
```

### GPU Acceleration

```javascript
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
```

---

## 🎨 Design System

### Dark Theme (default)

Defined in [`src/index.css`](watch-party/src/index.css) under the `@theme` directive and `:root` block.

```css
:root, [data-theme="dark"] {
  --color-bg-primary: #0a0a0b;        /* Near-black background */
  --color-bg-secondary: #18181b;      /* zinc-900 — card backgrounds */
  --color-bg-tertiary: #27272a;       /* zinc-800 — elevated surfaces */
  --color-bg-card: #18181b;           /* Card backgrounds */
  --color-bg-elevated: #1e1e22;       /* Modals, popovers */
  --color-bg-hover: #2a2a2e;          /* Hover states */
  --color-border: #27272a;            /* Subtle borders */
  --color-border-hover: #3f3f46;      /* Border hover */
  --color-text-primary: #fafafa;      /* zinc-50 — primary text */
  --color-text-secondary: #a1a1aa;    /* zinc-400 — secondary text */
  --color-text-muted: #71717a;        /* zinc-500 — muted text */
  --color-accent: #a78bfa;            /* violet-400 — accent */
  --color-accent-hover: #8b5cf6;      /* violet-500 — accent hover */
  --color-success: #4ade80;           /* green-400 */
  --color-warning: #fbbf24;           /* amber-400 */
  --color-danger: #f87171;            /* red-400 */
  --gradient-iridescent: ...;         /* Animated iridescent gradient */
  --gradient-iridescent-fade: ...;    /* Faded iridescent for text */
}
```

### Light Theme

Defined in `[data-theme="light"]` overrides:

```css
[data-theme="light"] {
  --color-bg-primary: #fafafa;
  --color-bg-secondary: #ffffff;
  --color-bg-tertiary: #f4f4f5;
  --color-text-primary: #18181b;
  --color-text-secondary: #52525b;
  --color-border: #e4e4e7;
  /* ... more overrides ... */
}
```

### Cinema Mode

When enabled, the room page:
- Hides top bar, bottom controls, sidebar
- Makes video player fill the entire window
- Shows semi-transparent overlay controls on hover/mouse move:
  - Overlay auto-hides after 3 seconds of inactivity
  - Shown on mouse move or immediately on click
  - Contains: Back button, play/pause, progress bar, theater mode toggle
- CSS: `.cinema-mode` class on the container, `.cinema-overlay` with opacity transitions
- Transition: `opacity 0.3s ease` for smooth overlay fade

### Ghost Pill Buttons

Custom CSS classes for pill-shaped transparent buttons:

```css
.ghost-pill {
  border-radius: 75px;             /* Extreme pill shape */
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
}
.ghost-pill:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-hover);
}
.ghost-pill-sm {
  border-radius: 75px;
  padding: 0.375rem 0.75rem;      /* Smaller variant */
  font-size: 0.8125rem;
  gap: 0.5rem;                     /* Space between icon and text */
}
.ghost-pill-light {
  /* Lighter variant for dark backgrounds */
}
```

### Editorial Inputs

Custom input style with 0px border-radius and bottom border only:

```css
input, textarea {
  border-radius: 0px;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-primary);
  outline: none;
}
input:focus {
  border-bottom-color: var(--color-accent);
}
```

### Keyframes & Animations

| Animation | CSS | Usage |
|-----------|-----|-------|
| `fade-in` | `from { opacity: 0 } to { opacity: 1 }` | Page entries, modal backdrops |
| `fade-in-scale` | `from { opacity: 0; transform: scale(0.95) }` | Modal content, popovers |
| `iridescent-shift` | Background-position sliding over a wide gradient | RoomPreview hero text |
| `slide-up` | `from { transform: translateY(10px); opacity: 0 }` | Queue items, notifications |
| `pulse-dot` | Scale + opacity pulse on a small dot | Sync status indicator |

Apply via Tailwind utility classes or inline: `className="animate-fade-in"`

---

## 🚂 Deployment

### Railway (Web)

The project can be deployed as a **web-only** app on Railway. The Browser Player feature requires Electron and won't work in the browser, but YouTube sync, chat, and all Firebase features work perfectly.

**Build config** ([`nixpacks.toml`](watch-party/nixpacks.toml)):

```toml
[phases.setup]
nixPkgs = ["nodejs_20", ...]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build:railway"]  # VITE_RAILWAY=1 disables Electron plugins
```

**Steps:**

1. Push to GitHub
2. On [Railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. **⚠️ Set Service Root Directory to `watch-party`** (important — the app is in a subdirectory)
4. Set environment variables in Railway Dashboard:

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | RTDB URL from Firebase console |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<project>.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `VITE_FIREBASE_APP_ID` | App ID |

**What works on Railway:**

| Feature | Status |
|---------|--------|
| ✅ Create/Join rooms | Full support |
| ✅ YouTube sync (play/pause/seek) | Full support |
| ✅ Chat | Full support |
| ✅ User list + admin panel | Full support |
| ✅ Video queue | Full support |
| ✅ Theme toggle | Full support |
| ❌ Browser Player (Tauri only) | Shows placeholder — needs desktop app |

### Build Locally for Web

```powershell
cd watch-party
set VITE_RAILWAY=1
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Opens at `http://localhost:4173`. The `VITE_RAILWAY=1` flag tells Vite to skip Electron plugins and use the Tauri API stub (empty implementations for desktop-specific calls).

---

## 📦 Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start Vite dev server (browser-only) at `localhost:5173` |
| `build` | `npm run build` | Build React app to `dist/` |
| `preview` | `npm run preview` | Preview production build at `localhost:4173` |
| `lint` | `npm run lint` | Run oxlint on `src/` |
| `electron:dev` | `npm run electron:dev` | Start Vite + Electron (desktop dev with HMR) |
| `electron:build` | `npm run electron:build` | Build React + Electron + create installer |
| `build:railway` | `npm run build:railway` | Build for Railway (VITE_RAILWAY=1, skip Electron) |
| `build:win` | `npm run build:win` | Build + package Windows installer via electron-builder |

**Batch files (double-click to run):**

| File | Action |
|------|--------|
| `start-dev.bat` | Launches `npm run electron:dev` in a terminal window |
| `start-release.bat` | Launches `npm run electron:build` in a terminal window |
| `start-firebase-emu.bat` | Launches Firebase emulators (auth + firestore) |

---

## 🔧 Troubleshooting

### General Issues

**Q: "Room not found" when joining**
- Verify the room ID is correct (6-character alphanumeric)
- Check Firebase Realtime Database exists and contains the room node
- The room may have been auto-deleted when the last member left
- Check browser console for Firebase permission errors

**Q: Firebase permission denied errors**
- Go to Firebase Console → Realtime Database → Rules
- Set rules to `{ "rules": { ".read": true, ".write": true } }` for testing
- ⚠️ **Do not use this in production** — implement proper security rules with auth

**Q: YouTube player not loading**
- Ensure `react-youtube` is installed: `npm ls react-youtube`
- Check if YouTube is accessible from your network (some countries/corporate networks block YouTube)
- Verify the video ID exists and is not age-restricted or private
- Check browser console for YouTube IFrame API errors

**Q: App shows blank white screen**
- Check the browser console for JavaScript errors
- Verify all environment variables are set correctly in `.env`
- Try `npm run build` and check for build errors
- Clear browser cache / localStorage

**Q: Changes not taking effect after editing code**
- Ensure Vite dev server is running (for `npm run dev` / `npm run electron:dev`)
- Try restarting the dev server
- Clear browser cache (hard refresh: Ctrl+F5)

### Electron-Specific Issues

**Q: Browser Player shows blank/dark area**
- Verify you're running in Electron (check `isDesktop()` returns true)
- Check Electron console for errors (F12)
- Verify `webviewTag: true` is set in `main.js`
- Some sites block embedding via `X-Frame-Options` header — use the Network Sniffer approach instead
- Try navigating to a simple site like `https://example.com` first

**Q: No video URLs detected in Browser Player**
- Open the site in a regular browser first and check if it uses HTML5 `<video>` or HLS
- The preload script scans every 1500ms — wait for the polling cycle
- Check the `console-message` events in the debug panel for sniffing logs
- Some sites use custom video players (Shaka Player, JW Player, etc.) that may not expose standard `<video>` elements

**Q: HLS playback not working**
- Verify `hls.js` is installed: `npm ls hls.js`
- Check the browser console for HLS errors (CORS, network, manifest parsing)
- The stream may require specific headers (Referer, Origin) — try playing in browser mode instead
- Some HLS streams are encrypted (DRM) and cannot be played in hls.js

**Q: Electron window doesn't open**
- Check the terminal for build errors
- Try `npm run electron:dev` with the Vite dev server already running in another terminal
- Verify `dist-electron/` exists (build output for Electron main process)
- Check `electron -v` returns a version

**Q: Ad blocker blocking legitimate content**
- The ad blocker uses EasyList + EasyPrivacy which may block some video-related domains
- Currently there's no UI to disable the ad blocker — modify `main.js` to remove the `initAdBlocker()` call

### Railway Deployment Issues

**Q: Deployment fails with "no such file or directory"**
- Ensure **Service Root Directory** is set to `watch-party` in Railway Dashboard
- Verify `nixpacks.toml` exists in the root of the service directory

**Q: App loads but shows blank screen on Railway**
- Check the browser console for errors
- Verify all `VITE_FIREBASE_*` environment variables are set in Railway Dashboard
- Ensure Firebase project allows requests from the Railway domain (Authentication → Settings → Authorized domains)

**Q: 404 on page refresh on Railway**
- Railway's static hosting should serve `index.html` for all routes via the Vite preview server
- If using a different static host, you may need a `_redirects` or `404.html` fallback
- Vite's preview server handles SPA routing natively

**Q: "VITE_RAILWAY" not set**
- Set `VITE_RAILWAY=1` as an environment variable in Railway Dashboard
- If using local preview, set it as: `$env:VITE_RAILWAY=1` (PowerShell) or `set VITE_RAILWAY=1` (CMD)

### Sync Issues

**Q: Video playback is out of sync between members**
- The sync threshold is 1.5 seconds — small differences are expected and acceptable
- Check Firebase latency: slow connections cause longer delay between update and sync
- The `serverTimeOffset` calculation compensates for clock skew — ensure all devices have accurate system clocks
- If one member's network is very slow, they may lag behind

**Q: Sync loop (video keeps seeking back and forth)**
- This would indicate the Loop Guard (`isApplyingRemoteUpdate`) is failing
- Check that the ref is properly set before and after applying remote updates
- This is a known edge case — reloading the page usually resolves it

**Q: Late joiner doesn't sync to correct position**
- The elapsed time calculation: `targetPosition = lastPosition + (serverNowMs - updatedAt * 1000) / 1000`
- If `updatedAt` is not a server timestamp (e.g., client timestamp by mistake), the calculation will be wrong
- Verify Firebase rules allow `serverTimestamp()` to be written

---

## 📝 License

This project is for educational purposes. All third-party services (YouTube, Firebase, Railway) are subject to their own terms of service.
