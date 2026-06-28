#!/bin/bash

echo "==================================================="
echo "  Starting AI 3D Assistant Desktop Setup & App (Unix)"
echo "==================================================="

# Verify python installation
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not installed."
    exit 1
fi

# Verify node installation
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    exit 1
fi

# Create virtual env
if [ ! -d ".venv" ]; then
    echo "[INFO] Creating Python virtual environment (.venv)..."
    python3 -m venv .venv
fi

# Install python dependencies
echo "[INFO] Installing backend dependencies..."
source .venv/bin/activate
pip install -r backend/requirements.txt

# Install root npm dependencies
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing root Electron dependencies..."
    npm install
fi

# Install frontend npm dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "[INFO] Installing frontend React dependencies..."
    cd frontend
    npm install
    cd ..
fi

mkdir -p models
mkdir -p temp_audio

echo "==================================================="
echo "  Launcher ready! Starting Desktop App..."
echo "==================================================="

# Run Electron dev launcher
npm run electron:dev
