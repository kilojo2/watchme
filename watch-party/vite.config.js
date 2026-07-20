import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

// ─── Railway Detection ───────────────────────────────────────────
// When building for Railway (browser-only), we DON'T use electron
const isRailway = process.env.VITE_RAILWAY === '1' || process.env.RAILWAY_ENVIRONMENT != null

// Electron plugins — only in desktop mode
const electronPlugins = isRailway ? [] : [
  electron([
    {
      // Main process entry
      entry: 'electron/main.js',
      vite: {
        build: {
          outDir: 'dist-electron',
          // Rolldown (Vite 8 default) outputs ESM syntax regardless of
          // format, so we use ES output with .mjs extension.
          // Electron 31 (Node 20) handles ESM natively.
          target: 'node20',
          rollupOptions: {
            external: ['electron'],
            output: {
              format: 'es',
              entryFileNames: '[name].mjs',
            },
          },
        },
      },
    },
  ]),
  renderer(),
]

// ─── Electron env fix ──────────────────────────────────────────────
// The ELECTRON_RUN_AS_NODE variable is set in the environment that
// launched VS Code, and cmd.exe's "set VAR=" (without quotes) leaves
// an empty entry that Electron's getenv() treats as truthy.  We must
// use the QUOTED form "set ""VAR="" " to truly remove it.
// This is handled automatically when starting via start-dev.bat /
// start-release.bat; if running npm scripts directly, ensure the
// variable is unset first.

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...electronPlugins,
  ],

  // ── Aliases ───────────────────────────────────────────────────
  resolve: {
    alias: {
      // In Electron mode, @tauri-apps/api is not used at all
      // (BrowserPlayer.jsx no longer imports it)
    },
  },

  // ── Build ──────────────────────────────────────────────────────
  build: {
    outDir: 'dist',
    sourcemap: isRailway ? false : true,
    chunkSizeWarningLimit: 1000,
  },

  // ── Preview server (used by Railway's start command) ──────────
  preview: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 4173,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
  },

  // ── Dev server ────────────────────────────────────────────────
  server: {
    port: 5173,
    strictPort: false,
  },
})
