@echo off
setlocal
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
call npm ci
if errorlevel 1 goto fail
call npm run verify:release
if errorlevel 1 goto fail
exit /b 0
:fail
echo Check failed. Read the error above.
pause
exit /b 1
