#!/bin/bash

# get cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# source .env file
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | grep -E '^(BOT_SCRIPT|PID_FILE)=' | xargs)
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: .env file not found"
    exit 1
fi

# validate required variables
if [ -z "$BOT_SCRIPT" ] || [ -z "$PID_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Required environment variables not set in .env"
    exit 1
fi

if [ ! -f "$PID_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No PID file found, trying to find process..."
    PID=$(pgrep -f "$BOT_SCRIPT")
    if [ -z "$PID" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot is not running"
        exit 0
    fi
else
    PID=$(cat "$PID_FILE")
fi

if ps -p "$PID" > /dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Stopping bot (PID: $PID)..."
    kill "$PID"
    sleep 2

    # Force kill if still running
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot still running, force killing..."
        kill -9 "$PID"
    fi

    rm -f "$PID_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot stopped"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot is not running"
    rm -f "$PID_FILE"
fi
