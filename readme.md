### Discord Bot for Chat Boys

Mostly vibe coded script using `discord.js` and `vibesync` to listen for changes in a voice channel,
see who is there, look that combination up in a mapping file, and set the channel status based on the
mapping.

### Installation

1. Clone the repo
2. Install dependencies with `npm install`
3. Copy the `.env.example` file to `.env` and fill in the values with your own
4. Fill in proper values in the `mappings.json` file
5. Run script with `node voice-rename-bot.js`
6. If running on server, add the `check-bot.sh` script to crontab to ensure the bot is always running

### Running on Server

**Helper Scripts:**

- `./check-bot.sh` - Check if bot is running and start if needed
- `./stop-bot.sh` - Stop the bot gracefully

**Auto-restart with Cron:**

Add to crontab (`crontab -e`):

```bash
*/5 * * * * <bot_script_location>check-bot.sh >> <log_location>/cron.log 2>&1
```

to checks every 5 minutes and restart the bot if it crashed.

**Logs:**
- `bot.log` - Bot output
- `cron.log` - Cron activity
- `bot.pid` - Process ID file

