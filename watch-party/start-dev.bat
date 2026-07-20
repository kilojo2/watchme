@echo off
title WatchMe Dev Server (Electron)
cd /d "%~dp0"

REM ── Unset this env var (quoted form properly removes it) ──
set "ELECTRON_RUN_AS_NODE="

echo ============================================
echo   WatchMe — Electron Development Mode
echo ============================================
echo.
echo  %CD%
echo  Starting Vite + Electron ...
echo  The app will launch automatically.
echo  Press Ctrl+C to stop.
echo.
echo ============================================
echo.

npm run electron:dev
pause
