import 'dotenv/config';
import {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
} from 'discord.js';
import { VibeSync } from 'vibesync';
import fs from 'node:fs/promises';
import path from 'node:path';

// ================== CONFIG ==================
const NAME_MAP = {};
const EMPTY_STATUS = 'No boys';
const SINGLE_STATUS = 'Tiny little baby lonely boy';
const MAP_PATH = process.env.MAP_PATH || null;
const USE_FALLBACK_NAMES = true;
const CACHE_SETTLE_MS = 1500;
const COMPUTE_DEBOUNCE_MS = 750;
const MAX_STATUS_LEN = 500;

const GUILD_ID = process.env.TARGET_GUILD_ID;
const VOICE_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
// ============================================

function timestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function canonicalKeyFromNames(names) {
    return names.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join('+');
}

function trimStatus(text) {
    if (!text) return text;
    return text.length <= MAX_STATUS_LEN ? text : text.slice(0, MAX_STATUS_LEN - 1) + '…';
}

async function loadMapIfProvided() {
    if (!MAP_PATH) return;
    try {
        const full = path.isAbsolute(MAP_PATH) ? MAP_PATH : path.join(process.cwd(), MAP_PATH);
        const raw = await fs.readFile(full, 'utf8');
        const loaded = JSON.parse(raw);
        if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
            Object.assign(NAME_MAP, loaded);
            console.log(`[${timestamp()}] 📁 Loaded ${Object.keys(loaded).length} entries from ${MAP_PATH}`);
        } else {
            console.warn(`[${timestamp()}] ⚠ File did not contain an object: ${MAP_PATH}`);
        }
    } catch (e) {
        console.warn(`[${timestamp()}] ⚠ Could not load MAP_PATH (${MAP_PATH}): ${e.message}`);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

let vibeSync = null;
let targetGuild = null;
let voiceChannel = null;
let pendingUpdateTimer = null;
let lastAppliedStatus = null;

async function resolveTargets() {
    targetGuild = await client.guilds.fetch(GUILD_ID);
    voiceChannel = await targetGuild.channels.fetch(VOICE_CHANNEL_ID);

    if (!voiceChannel || voiceChannel.type !== 2 /* GuildVoice */) {
        throw new Error('TARGET_CHANNEL_ID is not a voice channel or not found.');
    }

    const me = await targetGuild.members.fetchMe();
    const vp = voiceChannel.permissionsFor(me);

    console.log(`[${timestamp()}] 🔎 Voice perms — View:${!!vp?.has(PermissionsBitField.Flags.ViewChannel)} ManageChannels:${!!vp?.has(PermissionsBitField.Flags.ManageChannels)}`);

    if (!vp?.has(PermissionsBitField.Flags.ManageChannels)) {
        throw new Error('Bot needs ManageChannels permission in the voice channel to set status.');
    }
}

function getHumanMemberNamesInChannel() {
    if (!targetGuild || !voiceChannel) return [];

    const members = [...targetGuild.voiceStates.cache.values()]
        .filter(vs => vs.channelId === voiceChannel.id)
        .map(vs => vs.member)
        .filter(m => m && !m.user.bot);

    return members.map(m => m.user.globalName || m.user.username);
}

function sortNames(names) {
    return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function computeDesiredStatus() {
    const names = getHumanMemberNamesInChannel();

    if (names.length === 0) {
        console.log(`[${timestamp()}] 🔍 Empty channel → "${EMPTY_STATUS}"`);
        return EMPTY_STATUS;
    }

    if (names.length === 1) {
        console.log(`[${timestamp()}] 🔍 Single member → "${SINGLE_STATUS}"`);
        return SINGLE_STATUS;
    }

    const sorted = sortNames(names);
    const comboKey = canonicalKeyFromNames(sorted);
    console.log(`[${timestamp()}] 🔍 Current members: [${sorted.join(', ')}]`);
    console.log(`[${timestamp()}] 🔑 Looking up key: "${comboKey}"`);

    if (Object.prototype.hasOwnProperty.call(NAME_MAP, comboKey)) {
        const mapped = NAME_MAP[comboKey];
        console.log(`[${timestamp()}] ✨ Found mapping: "${mapped}"`);
        return trimStatus(mapped);
    }

    if (USE_FALLBACK_NAMES) {
        const fallback = sorted.join(' & ') + ' are chatting';
        console.log(`[${timestamp()}] 📝 No mapping found, using fallback: "${fallback}"`);
        return trimStatus(fallback);
    }

    console.log(`[${timestamp()}] ⏭ No mapping, keeping last or default: "${lastAppliedStatus ?? EMPTY_STATUS}"`);
    return lastAppliedStatus ?? EMPTY_STATUS;
}

async function scheduleStatusUpdate() {
    if (pendingUpdateTimer) clearTimeout(pendingUpdateTimer);

    pendingUpdateTimer = setTimeout(async () => {
        pendingUpdateTimer = null;
        try {
            const desired = await computeDesiredStatus();
            if (!desired) return;

            if (lastAppliedStatus === desired) {
                console.log(`[${timestamp()}] → Voice status already correct.`);
                return;
            }

            console.log(`[${timestamp()}] ✏️  Setting voice status → "${desired}"`);

            try {
                await vibeSync.setVoiceStatus(VOICE_CHANNEL_ID, desired);
                lastAppliedStatus = desired;
                console.log(`[${timestamp()}] ✓ Voice status updated successfully.`);
            } catch (err) {
                console.warn(`[${timestamp()}] ❌ Voice status update failed:`, err.message);
            }
        } catch (err) {
            console.warn(`[${timestamp()}] ⚠ Status scheduling error:`, err.message);
        }
    }, COMPUTE_DEBOUNCE_MS);
}

client.once('clientReady', async () => {
    console.log(`[${timestamp()}] 🤖 Logged in as ${client.user.tag}`);

    vibeSync = new VibeSync(client);
    console.log(`[${timestamp()}] 🎵 VibeSync initialized`);

    await loadMapIfProvided();
    await resolveTargets();
    console.log(`[${timestamp()}] 🎯 Monitoring voice: ${voiceChannel.name} (ID: ${voiceChannel.id})`);
    console.log(`[${timestamp()}] 📝 Voice channel status will be updated automatically`);
    await scheduleStatusUpdate();
});

// react to any change in voice states; if it touches the target voice channel, recompute.
client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        if (!voiceChannel) return;
        const affectedIds = [oldState.channelId, newState.channelId].filter(Boolean);
        if (!affectedIds.includes(voiceChannel.id)) return;

        console.log(`[${timestamp()}] 👤 Voice state changed in target channel`);
        await new Promise(r => setTimeout(r, CACHE_SETTLE_MS));
        voiceChannel = await targetGuild.channels.fetch(voiceChannel.id);

        await scheduleStatusUpdate();
    } catch (e) {
        console.warn(`[${timestamp()}] ⚠ voiceStateUpdate handler error:`, e.message);
    }
});

client.login(process.env.DISCORD_TOKEN);

