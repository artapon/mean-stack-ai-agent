@echo off
title DevAgent - Start
color 0A

echo.
echo  ============================================
echo    DevAgent - Agentic Dev AI
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
    echo  Please run install.bat first!
    echo.
    pause & exit /b 1
)

:: Check if ecosystem file exists
if not exist "ecosystem.config.js" (
    echo  [ERROR] ecosystem.config.js missing.
    echo.
    pause & exit /b 1
)

echo  Launching DevAgent with PM2...
echo  Make sure LM Studio is running on localhost:1234
echo.

pm2 start ecosystem.config.js
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo  Processes managed by PM2:
pm2 list

echo.
echo  Servers launched! Browser opening at http://localhost:5173
echo.
pause
