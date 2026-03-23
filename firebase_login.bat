@echo off
cd /d "%~dp0"
echo ===========================================
echo      Firebase Login Helper (Direct)
echo ===========================================

set NODE_EXE="C:\Program Files\nodejs\node.exe"
set FIREBASE_CLI=".\node_modules\firebase-tools\lib\bin\firebase.js"

echo.
echo Logging into Firebase...
echo.

%NODE_EXE% %FIREBASE_CLI% login --reauth

echo.
pause
