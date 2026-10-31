@echo off
title Chatling Ephemeral Chat Server
color 0A
echo =======================================================
echo   Chatling Ephemeral Real-Time Group Chat Server
echo =======================================================
echo.
node server/server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Node.js could not be started. Make sure Node.js is installed.
)
pause
