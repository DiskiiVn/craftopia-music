@echo off
title Push Craftopia Music to GitHub
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================================
echo   🚀 ĐANG ĐẨY MÃ NGUỒN LÊN GITHUB: DiskiiVn/craftopia-music
echo ========================================================
echo.
git push -u origin main
echo.
pause
