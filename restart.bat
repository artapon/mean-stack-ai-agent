@echo off
title DevAgent - Restart
color 0E

echo.
echo  ============================================
echo    DevAgent - Restarting Services
echo  ============================================
echo.

:: Store project root
set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%
cd /d "%ROOT%"

:: Check if PM2 is installed
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] PM2 is not installed.
    echo.
    pause & exit /b 1
)

echo  Restarting DevAgent processes...
pm2 restart ecosystem.config.js

echo.
echo  Processes status:
pm2 list

echo.
echo  Services restarted!
echo.
pause
