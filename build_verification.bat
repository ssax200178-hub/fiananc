@echo off
set PATH=C:\Program Files\nodejs;%PATH%
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%
echo Build successful
