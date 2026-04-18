@echo off
title STARTING SYSTEM - Tawseel
color 0B
echo ======================================================
echo    STARTING FINANCIAL SYSTEM (React + Vite)
echo ======================================================
echo.

:: 1. Check for Node.js
echo [+] Checking for Node.js engine...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Node.js is NOT installed.
    echo Please install it from: https://nodejs.org
    pause
    exit /b
)

:: 2. Check for node_modules
if not exist "node_modules\" (
    echo [!] node_modules missing. Installing dependencies...
    echo Please wait, this might take a minute...
    call npm install
)

:: 3. Run the system
echo.
echo [+] Starting Local Server...
echo [!] Opening browser to http://localhost:5173
echo.

start "" "http://localhost:5173"
call npx vite --host

pause
