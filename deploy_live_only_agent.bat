@echo off
cd /d "%~dp0"
echo ===========================================
echo      Deploying Updates to LIVE ONLY
echo ===========================================

set NODE_EXE="C:\Program Files\nodejs\node.exe"
set VITE_CLI=".\node_modules\vite\bin\vite.js"
set FIREBASE_CLI=".\node_modules\firebase-tools\lib\bin\firebase.js"

echo.
echo Deploying to Live (Production)...
CALL %NODE_EXE% %VITE_CLI% build
IF %ERRORLEVEL% NEQ 0 (
    echo Build Failed!
    exit /b %ERRORLEVEL%
)

CALL %NODE_EXE% %FIREBASE_CLI% deploy --only hosting,firestore:rules
IF %ERRORLEVEL% NEQ 0 (
    echo Deploy to Live Failed!
    exit /b %ERRORLEVEL%
)

echo.
echo ✅ Live deployment completed successfully!
echo URL: https://financial-tawseelone.web.app
