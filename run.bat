@echo off
title AI 3D Assistant Desktop Launcher
echo ===================================================
echo   Starting AI 3D Assistant Desktop Setup and App
echo ===================================================

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed. Please install Python 3.10+
    pause
    exit /b 1
)

:: Check for Node
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18+
    pause
    exit /b 1
)

:: Create virtual environment if it doesn't exist
if not exist ".venv" (
    echo [INFO] Creating Python virtual environment venv...
    python -m venv .venv
)

:: Install Python dependencies
echo [INFO] Installing backend dependencies...
call .venv\Scripts\activate.bat
pip install -r backend/requirements.txt
if %errorlevel% neq 0 (
    echo [WARNING] Some python requirements failed to install.
)

:: Install Root npm dependencies (for Electron and concurrently)
if not exist "node_modules" (
    echo [INFO] Installing root Electron dependencies...
    call npm install
)

:: Install Frontend npm dependencies (for Three.js and React)
if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend React dependencies...
    cd frontend
    call npm install
    cd ..
)

:: Create models and audio temp directories if they don't exist
if not exist "models" (
    mkdir models
)
if not exist "temp_audio" (
    mkdir temp_audio
)

echo ===================================================
echo   Launcher ready! Starting Desktop App...
echo ===================================================

:: Start Electron dev launcher which concurrently runs Vite and triggers Electron main (FastAPI Sidecar)
call npm run electron:dev
