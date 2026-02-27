@echo off
title DevAgent - Installation & Setup
color 0A

echo.
echo  ============================================
echo    DevAgent - Installation and Setup
echo  ============================================
echo.

:: Check Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Download from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% detected
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

:: Install all dependencies
echo  [1/4] Installing root dependencies...
cd /d "%ROOT%"
call npm install
if %errorlevel% neq 0 ( echo  [ERROR] Root install failed. & pause & exit /b 1 )
echo  [OK] Done
echo.

echo  [2/4] Installing server dependencies...
cd /d "%ROOT%\server"
call npm install
if %errorlevel% neq 0 ( echo  [ERROR] Server install failed. & pause & exit /b 1 )
echo  [OK] Done
echo.

echo  [3/4] Installing client dependencies...
cd /d "%ROOT%\client"
call npm install
if %errorlevel% neq 0 ( echo  [ERROR] Client install failed. & pause & exit /b 1 )
echo  [OK] Done
echo.

:: Check if PM2 is installed
echo  [4/4] Checking PM2...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo  [WARNING] PM2 is not installed. 
    echo  Installing PM2 globally...
    call npm install -g pm2
    if %errorlevel% neq 0 ( echo  [ERROR] PM2 install failed. & pause & exit /b 1 )
) else (
    echo  [OK] PM2 detected
)
echo.

echo  ============================================
echo    All done! You can now run start.bat
echo  ============================================
echo.
pause
