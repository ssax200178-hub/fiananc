@echo off
title TAWSEEL SCRAPER - Automation Worker
color 0E
echo ======================================================
echo    STARTING AUTOMATION SERVICE (Python Scraper)
echo ======================================================
echo.

:: 1. Check for Python
echo [+] Checking for Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] ERROR: Python is NOT installed.
    echo Please install it from: https://python.org
    pause
    exit /b
)

:: 2. Install requirements
echo [+] Checking requirements...
pip install -r scripts/requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [!] Minor warning during library check.
)

:: 3. Run the script
echo.
echo [+] Starting Now...
echo [!] Keep this window open for the system to work automatically.
echo.

python scripts/tawseel_scraper.py

if %errorlevel% neq 0 (
    echo.
    echo [!] Error occurred during script execution.
    pause
)

pause
