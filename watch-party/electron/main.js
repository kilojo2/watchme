const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');

// ── Ad Blocker ─────────────────────────────────────────────────────
let adblocker = null;

async function initAdBlocker() {
  try {
    adblocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    // Disable cosmetic filters (CSS/JS injection) because
    // session.registerPreloadScript is not available on
    // session.defaultSession in Electron 31.6.
    // Network-level blocking (EasyList + EasyPrivacy) still works.
    adblocker.config.loadCosmeticFilters = false;
    adblocker.enableBlockingInSession(session.defaultSession);
    console.log('[adblocker] Active — EasyList + EasyPrivacy loaded');
  } catch (err) {
    console.error('[adblocker] Failed to initialise:', err);
  }
}

// ── Window Creation ────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1216,
    height: 839,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#09090b', // zinc-950
    show: false, // show when ready-to-show; fallback timer below
    autoHideMenuBar: true, // Hide File/Edit/View menu bar
    webPreferences: {
      // ── Critical for In-App Browser ─────────────────────────
      webviewTag: true,        // Enable <webview> tag
      webSecurity: false,      // Disable CORS/SOP for iframe access
      nodeIntegration: true,   // Allow Node.js APIs in renderer
      contextIsolation: false, // Required for nodeIntegration to work
      // ── Security (relaxed for dev) ─────────────────────────
      sandbox: false,
      // ── Other ───────────────────────────────────────────────
      spellcheck: false,
    },
  });

  // Show window when ready (prevents visual flash on fast loads)
  win.once('ready-to-show', () => {
    win.show();
  });

  // Fallback: force-show the window after 4 s even if ready-to-show
  // never fires (e.g. page load error, missing file, etc.)
  const showTimer = setTimeout(() => {
    win.show();
  }, 4000);

  win.once('show', () => clearTimeout(showTimer));

  // Log what happened during load
  console.log('[main] app.getAppPath() =', app.getAppPath());
  console.log('[main] isPackaged =', app.isPackaged);

  // Log load failures for debugging
  win.webContents.on('did-fail-load', (_event, errorCode, errorDesc, validatedURL) => {
    console.error('[main] did-fail-load:', errorCode, errorDesc, validatedURL);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('[main] did-finish-load – page loaded successfully');
  });

  // Load the app
  if (isDev) {
    // In dev mode, load from Vite dev server
    win.loadURL('http://localhost:5173');
    // Open DevTools for the main window
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production, load the built files.
    // IMPORTANT: __dirname is NOT available in ESM context (.mjs output).
    // Rolldown bundles main.js → dist-electron/main.mjs, which runs as ESM.
    // In ESM, __dirname throws ReferenceError, so we use app.getAppPath()
    // which returns the correct asar path in a packaged app.
    const indexPath = path.join(app.getAppPath(), 'dist/index.html');
    console.log('[main] Production loadFile path:', indexPath);
    win.loadFile(indexPath);

    // ═══ TEMPORARY: Open DevTools in production for debugging ═══
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // F12 / Ctrl+Shift+I toggles DevTools in production
  win.webContents.on('before-input-event', (_event, input) => {
    if (
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i')
    ) {
      win.webContents.toggleDevTools();
    }
  });

  // Block ALL pop-ups from <webview> or window.open
  // The { action: 'deny' } return prevents the pop-up entirely,
  // while shell.openExternal sinks external links to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Determine if we're running in development mode ─────────────────
const isDev = !app.isPackaged;

app.whenReady().then(async () => {
  // Initialise ad-blocker *before* creating the window
  await initAdBlocker();

  createWindow();

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
