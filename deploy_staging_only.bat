@echo off
echo Deploying to STAGING environment only...

:: Build the apnpm run build:test mode
echo Building staging...
call node_modules\.bin\vite build --mode staging

:: Deploy to firebase hosting test channel
echo Deploying to test-preview...
call node_modules\.bin\firebase hosting:channel:deploy test-preview --expires 7d

echo Staging deployment complete!
echo URL: https://financial-tawseelone--test-preview-1v3d4pf4.web.app
