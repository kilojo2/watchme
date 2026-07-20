@echo off
title WatchMe (Electron Release Build)
cd /d "%~dp0"

REM ── Unset this env var (quoted form properly removes it) ──
set "ELECTRON_RUN_AS_NODE="

echo ============================================
echo   WatchMe — Build and Launch Electron App
echo ============================================
echo.
echo  %CD%
echo  Building React app + Electron package ...
echo.
echo ============================================
echo.

call npm run build:win

echo.
echo  Build complete. Launching installer from dist-electron/
echo  (You may need to run the generated installer manually.)
echo.
pause
