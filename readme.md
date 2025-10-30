### Discord Bot for Chat Boys

Mostly vibe coded script using `discord.js` to listen for changes in a voice channel, see who is there, 
look that combination up in a mapping file, then send a message to the designated channel based on the 
combination. We can't set the channel name because there is a hidden rate limit of 2 changes per 10 minutes,
and we can't set the channel status because it's not supported by the API yet. If that becomes available,
that's probably the way to go.

### Installation

1. Clone the repo
2. Install dependencies with `npm install`
3. Copy the `.env.example` file to `.env` and fill in the values with your own
4. Fill in proper values in the `mapping.json` file
5. Run script with `node voice-rename-bot.js`

