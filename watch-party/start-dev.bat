@echo off
title WatchMe Dev Server
cd /d "%~dp0"

echo ============================================
echo   WatchMe — Development Mode
echo ============================================
echo.
echo  %CD%
echo  Building Rust backend + Vite frontend ...
echo  The app will launch automatically when ready.
echo  Press Ctrl+C to stop.
echo.
echo ============================================
echo.

npx tauri dev
pause
