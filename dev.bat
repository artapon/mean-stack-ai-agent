@echo off
title DevAgent - Quick Start
color 0A

echo.
echo  ============================================
echo    DevAgent - Quick Start
echo  ============================================
echo.

:: Store project root
set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%

:: Create server\.env from example if missing
if not exist "%ROOT%\server\.env" (
    echo  [SETUP] Creating server\.env ...
    copy "%ROOT%\server\.env.example" "%ROOT%\server\.env" >nul
    echo  [OK] server\.env created
    echo.
)

:: Check dependencies installed
if not exist "%ROOT%\server\node_modules" (
    echo  [ERROR] Dependencies not installed.
    echo  Please run start.bat first!
    echo.
    pause & exit /b 1
)

echo  Launching DevAgent...
echo  Backend  ^>  http://localhost:3000
echo  Frontend ^>  http://localhost:5173
echo.
echo  Make sure LM Studio is running on localhost:1234
echo.

pm2 start ecosystem.config.js
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo  Processes managed by PM2:
pm2 list

echo  Done! Browser opening at http://localhost:5173
echo.
pause
