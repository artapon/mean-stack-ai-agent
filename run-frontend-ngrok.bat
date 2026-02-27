@echo off
setlocal
title DevAgent Ngrok Starter

echo.
echo  [32m[DevAgent] Starting Frontend Server... [0m
start "DevAgent-Frontend" cmd /k "cd client && npm run dev"

echo.
echo  [33m[DevAgent] Waiting 5 seconds for Vite to initialize... [0m
timeout /t 5 /nobreak > nul

echo.
echo  [36m[DevAgent] Starting Ngrok tunnel to http://localhost:5173... [0m
echo  [31m[Note] Make sure you have ngrok installed and authenticated ('ngrok config add-authtoken <TOKEN>') [0m
echo.

ngrok http 5173
pause
