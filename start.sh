#!/bin/bash

# 3d.me Unified Startup Script
# Starts both the local FastAPI AI Engine (port 8000) and the Next.js Frontend (port 3000)

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$PROJECT_DIR/ai-engine"

echo "=================================================="
echo " Starting 3d.me Parametric & Neural 3D Studio"
echo "=================================================="

# Function to shut down background processes on exit
cleanup() {
    echo ""
    echo "Stopping 3d.me services..."
    kill $(jobs -p) 2>/dev/null
    exit
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start AI Engine in background
echo "[1/2] Starting Local AI Engine on http://127.0.0.1:8000 ..."
cd "$AI_DIR"
./venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000 --reload &
AI_PID=$!

# Wait briefly for FastAPI to initialize
sleep 2

# 2. Start Next.js Frontend
echo "[2/2] Starting Next.js Frontend on http://localhost:3000 ..."
cd "$PROJECT_DIR"
npm run dev

wait $AI_PID
