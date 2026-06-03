@echo off
title XMLFlow — E-Publication Automation
color 0A

echo.
echo  ================================================
echo    XMLFlow — E-Publication Automation Tool
echo  ================================================
echo.
echo  Starting local server...
echo.

:: Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python is not installed or not in PATH.
    echo  Please install Python from https://www.python.org
    echo.
    pause
    exit /b 1
)

:: Kill any existing server on port 3030
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3030" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Start the Python HTTP server in background
start "" /B python -m http.server 3030

:: Wait a moment for server to start
timeout /t 2 /nobreak >nul

:: Open browser
echo  [OK] Server started at http://localhost:3030
echo  [OK] Opening XMLFlow in your browser...
echo.
echo  ================================================
echo   Keep this window open while using XMLFlow.
echo   Close this window to stop the server.
echo  ================================================
echo.

start "" http://localhost:3030

:: Keep window open and show status
echo  Server is running. Press Ctrl+C or close this
echo  window to stop XMLFlow.
echo.

:: Wait for Python server (this keeps the window alive)
python -m http.server 3030 2>nul

echo.
echo  Server stopped.
pause
