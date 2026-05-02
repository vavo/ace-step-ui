#!/bin/bash
# ACE-Step UI Startup Script for RunPod
# Starts ACE-Step API (internal) + Express (external port 4444)

set -e

echo "=================================="
echo "  ACE-Step UI - RunPod Startup"
echo "=================================="
echo

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Error: UI dependencies not installed!"
    echo "Run: npm install"
    exit 1
fi

if [ ! -d "server/node_modules" ]; then
    echo "Error: Server dependencies not installed!"
    echo "Run: cd server && npm install"
    exit 1
fi

# Check if dist exists (production build)
if [ ! -d "dist" ]; then
    echo "Warning: Production build not found in dist/"
    echo "Run: npm run build"
    echo "Continuing in development mode..."
    export NODE_ENV=development
else
    echo "Production build found in dist/"
    export NODE_ENV=production
fi

# Get ACE-Step path from environment or use default
ACESTEP_PATH="${ACESTEP_PATH:-/workspace/ACE-Step-1.5}"

# Check if ACE-Step exists
if [ ! -d "$ACESTEP_PATH" ]; then
    echo
    echo "Error: ACE-Step not found at $ACESTEP_PATH"
    echo
    echo "Set ACESTEP_PATH environment variable:"
    echo "  export ACESTEP_PATH=/path/to/ACE-Step-1.5"
    echo
    exit 1
fi

# Check if ACE-Step venv exists
if [ ! -d "$ACESTEP_PATH/.venv" ]; then
    echo
    echo "Error: ACE-Step venv not found at $ACESTEP_PATH/.venv"
    echo
    exit 1
fi

echo
echo "=================================="
echo "  Starting Services..."
echo "=================================="
echo

# Create log directory
mkdir -p logs

# Start ACE-Step API on localhost:8001 (internal only)
echo "[1/2] Starting ACE-Step API on localhost:8001 (internal)..."
"$ACESTEP_PATH/.venv/bin/python" -m uvicorn acestep.api_server:app --host 127.0.0.1 --port 8001 > logs/acestep-api.log 2>&1 &
API_PID=$!

# Wait for API to start
echo "Waiting for ACE-Step API to initialize..."
sleep 5

# Check if API started successfully
if ! kill -0 $API_PID 2>/dev/null; then
    echo "Error: ACE-Step API failed to start. Check logs/acestep-api.log"
    exit 1
fi

# Start Express on port 4444 (external)
echo "[2/2] Starting Express server on port 4444 (external)..."
cd server
NODE_ENV=production npm run dev > ../logs/express.log 2>&1 &
EXPRESS_PID=$!
cd ..

# Wait for Express to start
echo "Waiting for Express server to start..."
sleep 3

# Check if Express started successfully
if ! kill -0 $EXPRESS_PID 2>/dev/null; then
    echo "Error: Express server failed to start. Check logs/express.log"
    kill $API_PID 2>/dev/null
    exit 1
fi

echo
echo "=================================="
echo "  All Services Running!"
echo "=================================="
echo
echo "  ACE-Step API:  http://localhost:8001 (internal)"
echo "  Express:       http://0.0.0.0:4444 (external)"
echo
echo "  Access the app at: http://<RUNPOD-IP>:4444"
echo
echo "  Logs: ./logs/"
echo
echo "  PIDs:"
echo "    ACE-Step API:  $API_PID"
echo "    Express:       $EXPRESS_PID"
echo
echo "=================================="
echo

# Save PIDs for cleanup
echo "$API_PID" > logs/acestep-api.pid
echo "$EXPRESS_PID" > logs/express.pid

echo "Services are running in background."
echo "Press Ctrl+C to stop all services."
echo

# Handle shutdown
trap 'echo; echo "Stopping services..."; kill $API_PID $EXPRESS_PID 2>/dev/null; rm -f logs/acestep-api.pid logs/express.pid; echo "Services stopped."; exit 0' INT TERM

# Wait for processes
wait
