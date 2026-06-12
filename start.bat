@echo off
title Speed E2E Startup
color 0A

echo ============================================================
echo   Speed E2E Dashboard - Startup
echo ============================================================
echo.

:: ── Step 1: Start Local Server ───────────────────────────────
echo [1/5] Starting local server...
taskkill /F /IM node.exe >nul 2>&1
start "" /MIN cmd /C "cd /D D:\Speed\Scripts\Speed\Bridge_End_to_End_Flow\local-server && node server.js > server.log 2>&1"
timeout /t 3 /nobreak >nul
echo       Done.

:: ── Step 2: Start ngrok ──────────────────────────────────────
echo [2/5] Starting ngrok tunnel...
taskkill /F /IM ngrok.exe >nul 2>&1
start "" /MIN cmd /C "ngrok http 3001"
timeout /t 6 /nobreak >nul
echo       Done.

:: ── Step 3: Get ngrok URL ────────────────────────────────────
echo [3/5] Fetching tunnel URL...
powershell -NoProfile -Command "(Invoke-WebRequest -Uri http://127.0.0.1:4040/api/tunnels -UseBasicParsing | ConvertFrom-Json).tunnels[0].public_url" > "%TEMP%\ngrok_url.txt" 2>nul
set /p NGROK_URL=<"%TEMP%\ngrok_url.txt"

if "%NGROK_URL%"=="" (
    echo       ERROR: Could not get ngrok URL. Check ngrok is running.
    pause
    exit /b 1
)
echo       Tunnel: %NGROK_URL%

:: ── Step 4: Update Vercel env var ────────────────────────────
echo [4/5] Updating Vercel with new tunnel URL...
cd /D "D:\Speed\Scripts\Speed\Bridge_End_to_End_Flow\vercel-app"
vercel env rm LOCAL_SERVER_URL production --yes --scope naiya-speeds-projects >nul 2>&1
vercel env add LOCAL_SERVER_URL production --value "%NGROK_URL%" --yes --scope naiya-speeds-projects >nul 2>&1
echo       Done.

:: ── Step 5: Redeploy Vercel ──────────────────────────────────
echo [5/5] Redeploying dashboard (~60 seconds)...
vercel deploy --prod --scope naiya-speeds-projects >nul 2>&1
echo       Done.

:: ── Open dashboard ───────────────────────────────────────────
echo.
echo ============================================================
echo   All done! Opening dashboard...
echo   URL: https://speed-e2e-dashboard.vercel.app
echo ============================================================
echo.
start https://speed-e2e-dashboard.vercel.app

pause
