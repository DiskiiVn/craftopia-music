@echo off
title Craftopia Music - Discord Bot & Web Dashboard
chcp 65001 > nul
cls
echo ========================================================
echo   🎵 CRAFTOPIA MUSIC - DISCORD BOT & WEB DASHBOARD 🎵
echo ========================================================
echo.

if not exist node_modules (
    echo [1/2] Dang cai dat thu vien NPM...
    call npm install
)

echo [2/2] Dang khoi dong Bot va Web Dashboard...
echo.
echo Dashboard se mo tai dia chi: http://localhost:3000
echo.

node index.js
pause
