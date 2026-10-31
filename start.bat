@echo off
setlocal
:: Clear invalid npm environment variables that trigger warnings
set "npm_config_cache_dir="
set "NPM_CONFIG_CACHE_DIR="

title Chatling WebRTC Ephemeral Group Chat
color 0A

echo =======================================================
echo     Chatling - Ephemeral Group Chat via WebRTC
echo =======================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "node_modules\" (
    echo [INFO] First time run detected. Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [INFO] Dependencies installed successfully.
    echo.
)

echo [INFO] Starting Chatling local WebRTC server...
node server/server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server terminated unexpectedly.
    pause
)
