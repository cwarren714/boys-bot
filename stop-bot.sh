#!/bin/bash

# Configuration
BOT_DIR="/Users/chand/dev_repos/boys-bot"
PID_FILE="$BOT_DIR/bot.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No PID file found, trying to find process..."
    PID=$(pgrep -f "voice-rename-bot.js")
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
