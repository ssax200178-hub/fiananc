@echo off
cd /d "%~dp0"
echo ===========================================
echo      Deploying Updates (Agent Mode)
echo ===========================================

set NODE_EXE="C:\Program Files\nodejs\node.exe"
set VITE_CLI=".\node_modules\vite\bin\vite.js"
set FIREBASE_CLI=".\node_modules\firebase-tools\lib\bin\firebase.js"

echo.
echo [1/2] Deploying to Test (Staging)...
CALL %NODE_EXE% %VITE_CLI% build --mode staging
IF %ERRORLEVEL% NEQ 0 (
    echo Build Failed!
    exit /b %ERRORLEVEL%
)

CALL %NODE_EXE% %FIREBASE_CLI% hosting:channel:deploy test-preview
IF %ERRORLEVEL% NEQ 0 (
    echo Deploy to Test Failed!
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Deploying to Live (Production)...
CALL %NODE_EXE% %VITE_CLI% build
IF %ERRORLEVEL% NEQ 0 (
    echo Build Failed!
    exit /b %ERRORLEVEL%
)

CALL %NODE_EXE% %FIREBASE_CLI% deploy --only hosting
IF %ERRORLEVEL% NEQ 0 (
    echo Deploy to Live Failed!
    exit /b %ERRORLEVEL%
)

echo.
echo ✅ All deployments completed successfully!
