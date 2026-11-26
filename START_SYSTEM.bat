@echo off
title RailPulse Pro - Train Ticketing System
cd /d "%~dp0"
echo =========================================================
echo   Starting RailPulse Pro Train Ticketing System...
echo   URL: http://localhost:3000
echo =========================================================
start "" "http://localhost:3000"
node server.js
pause
