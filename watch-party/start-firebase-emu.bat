@echo off
title WatchMe Firebase Emulators
cd /d "%~dp0"

echo ============================================
echo   WatchMe — Firebase Emulators
echo ============================================
echo.
echo  Starting Firebase Emulators (Auth + Firestore) ...
echo  Press Ctrl+C to stop.
echo.
echo ============================================
echo.

npx firebase emulators:start --only auth,firestore
pause
