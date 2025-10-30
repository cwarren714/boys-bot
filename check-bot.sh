#!/bin/bash

# get cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# source .env file
if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | grep -E '^(BOT_DIR|BOT_SCRIPT|LOG_FILE|PID_FILE)=' | xargs)
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: .env file not found"
    exit 1
fi

# validate required variables
if [ -z "$BOT_DIR" ] || [ -z "$BOT_SCRIPT" ] || [ -z "$LOG_FILE" ] || [ -z "$PID_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Required environment variables not set in .env"
    exit 1
fi

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot is already running (PID: $PID)"
        exit 0
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Stale PID file found, removing..."
        rm -f "$PID_FILE"
    fi
fi

if pgrep -f "$BOT_SCRIPT" > /dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot is running but PID file is missing, recreating..."
    pgrep -f "$BOT_SCRIPT" > "$PID_FILE"
    exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot is not running, starting..."

cd "$BOT_DIR" || {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Cannot change to bot directory"
    exit 1
}

nohup node "$BOT_SCRIPT" >> "$LOG_FILE" 2>&1 &
BOT_PID=$!

echo "$BOT_PID" > "$PID_FILE"

sleep 2
if ps -p "$BOT_PID" > /dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot started successfully (PID: $BOT_PID)"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Bot failed to start"
    rm -f "$PID_FILE"
    exit 1
fi
