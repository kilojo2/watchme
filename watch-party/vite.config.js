import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// ─── Railway Detection ───────────────────────────────────────────
// When building for Railway (browser-only), we replace `@tauri-apps/api`
// with a stub module that gracefully handles the missing Tauri runtime.
const isRailway = process.env.VITE_RAILWAY === '1' || process.env.RAILWAY_ENVIRONMENT != null

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // ── Aliases ───────────────────────────────────────────────────
  resolve: {
    alias: isRailway
      ? {
          // Replace Tauri API with browser-compatible stub directory.
          // Vite resolves subpath imports automatically:
          //   @tauri-apps/api       → tauri-stub/index.js
          //   @tauri-apps/api/core  → tauri-stub/core.js
          //   @tauri-apps/api/event → tauri-stub/event.js
          '@tauri-apps/api': path.resolve(__dirname, 'src/lib/tauri-stub'),
        }
      : undefined,
  },

  // ── Build ──────────────────────────────────────────────────────
  build: {
    // Output to dist/ (Railway will serve from here)
    outDir: 'dist',
    // Generate sourcemaps for debugging (removed in production)
    sourcemap: isRailway ? false : true,
    // Chunk size warning limit (hls.js + firebase are large)
    chunkSizeWarningLimit: 1000,
  },

  // ── Preview server (used by Railway's start command) ──────────
  preview: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 4173,
    host: '0.0.0.0',
    strictPort: true,
  },

  // ── Dev server ────────────────────────────────────────────────
  server: {
    port: 5173,
    strictPort: false,
  },
})
