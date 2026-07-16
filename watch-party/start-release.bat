@echo off
title WatchMe (Release Build)
cd /d "%~dp0"

echo ============================================
echo   WatchMe — Launch Release Build
echo ============================================
echo.

if exist "src-tauri\target\release\watch-me.exe" (
    echo  Starting release build ...
    echo.
    start "" "src-tauri\target\release\watch-me.exe"
    exit /b
)

echo  [WARNING] Release binary not found.
echo  Building release now (this will take a few minutes) ...
echo.
echo ============================================
echo.

call npx tauri build

if exist "src-tauri\target\release\watch-me.exe" (
    echo.
    echo  Build complete. Starting ...
    start "" "src-tauri\target\release\watch-me.exe"
) else (
    echo.
    echo  [ERROR] Build failed. Check terminal output above.
    pause
)
