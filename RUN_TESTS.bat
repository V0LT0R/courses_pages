@echo off
setlocal
cd /d "%~dp0"
call npm run lint
if errorlevel 1 goto fail
call npm test
if errorlevel 1 goto fail
call npm run sql:check
if errorlevel 1 goto fail
exit /b 0
:fail
echo Check failed. Read the error above.
pause
exit /b 1
