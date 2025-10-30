### Discord Bot for Chat Boys

Mostly vibe coded script using `discord.js` and `vibesync` to listen for changes in a voice channel,
see who is there, look that combination up in a mapping file, and set the channel status based on the
mapping.

### Installation

1. Clone the repo
2. Install dependencies with `npm install`
3. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` and fill in your values:
   - **Discord Bot Config**: `DISCORD_TOKEN`, `TARGET_GUILD_ID`, `TARGET_CHANNEL_ID`
   - **Path Config**: Update `BOT_DIR`, `LOG_FILE`, and `PID_FILE` paths for your environment
5. Fill in proper values in the `mappings.json` file
6. Run script with `node voice-rename-bot.js`
7. If running on server, add the `check-bot.sh` script to crontab to ensure the bot is always running

### Running on Server

**Helper Scripts:**

Both scripts automatically read configuration from `.env`:

- `./check-bot.sh` - Check if bot is running and start if needed
- `./stop-bot.sh` - Stop the bot gracefully

**Auto-restart with Cron:**

Add to crontab (`crontab -e`):

```bash
*/5 * * * * /path/to/boys-bot/check-bot.sh >> /path/to/boys-bot/cron.log 2>&1
```

This checks every 5 minutes and restarts the bot if it crashed.

**Example for different environments:**

Local development `.env`:
```bash
BOT_DIR=/Users/username/dev/boys-bot
LOG_FILE=/Users/username/dev/boys-bot/bot.log
PID_FILE=/Users/username/dev/boys-bot/bot.pid
```

Production server `.env`:
```bash
BOT_DIR=/opt/boys-bot
LOG_FILE=/var/log/boys-bot/bot.log
PID_FILE=/var/run/boys-bot.pid
```

**Logs:**
- `bot.log` - Bot output
- `cron.log` - Cron activity
- `bot.pid` - Process ID file

