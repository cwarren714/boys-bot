import 'dotenv/config';
import {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    REST,
} from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// ================== CONFIG ==================
const NAME_MAP = {};                    
const EMPTY_STATUS = 'No boys';   
const MAP_PATH = process.env.MAP_PATH || null;
const USE_FALLBACK_NAMES = true;       
const CACHE_SETTLE_MS = 1500;         
const COMPUTE_DEBOUNCE_MS = 750;     
const MAX_STATUS_LEN = 1900;        
const MIN_EDIT_INTERVAL_MS = 3000; 

const GUILD_ID = process.env.TARGET_GUILD_ID;
const VOICE_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID;
// ============================================

function timestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function canonicalKeyFromNames(names) {
    return names.slice().sort().join('+');
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
        GatewayIntentBits.GuildMessages,
    ],
});

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.rest.on('rateLimited', info => {
    console.warn(
        `[${timestamp()}] 🔒 rateLimited route=${info.route} bucket=${info.bucket} ` +
        `retryAfter(ms)=${info.retryAfter} global=${info.global}`
    );
});
client.on('debug', m => {
    if (m.includes('429') || m.toLowerCase().includes('rate')) {
        console.warn(`[${timestamp()}] [debug] ${m}`);
    }
});
client.on('warn', m => console.warn(`[${timestamp()}] [warn] ${m}`));
client.on('error', e => console.warn(`[${timestamp()}] [error]`, e));

let targetGuild = null;
let voiceChannel = null;
let statusChannel = null;
let statusMessage = null;

let pendingUpdateTimer = null;
let lastAppliedText = null;
let lastEditAt = 0;
let cooldownUntil = 0;
let cooldownTimer = null;
let queuedDesiredText = null;

async function resolveTargets() {
    targetGuild = await client.guilds.fetch(GUILD_ID);
    voiceChannel = await targetGuild.channels.fetch(VOICE_CHANNEL_ID);
    statusChannel = await targetGuild.channels.fetch(STATUS_CHANNEL_ID);

    if (!voiceChannel || voiceChannel.type !== 2 /* GuildVoice */) {
        throw new Error('TARGET_CHANNEL_ID is not a voice channel or not found.');
    }
    if (!statusChannel || ![0, 5, 15, 11, 12].includes(statusChannel.type)) {
        throw new Error('STATUS_CHANNEL_ID must be a text/announcement/thread channel.');
    }

    const me = await targetGuild.members.fetchMe();
    const vp = voiceChannel.permissionsFor(me);
    const sp = statusChannel.permissionsFor(me);

    console.log(`[${timestamp()}] 🔎 Voice perms — View:${!!vp?.has(PermissionsBitField.Flags.ViewChannel)}`);
    console.log(`[${timestamp()}] 🔎 Status perms — View:${!!sp?.has(PermissionsBitField.Flags.ViewChannel)} Send:${!!sp?.has(PermissionsBitField.Flags.SendMessages)} ManageMessages:${!!sp?.has(PermissionsBitField.Flags.ManageMessages)}`);

    if (!sp?.has(PermissionsBitField.Flags.ViewChannel) || !sp?.has(PermissionsBitField.Flags.SendMessages)) {
        throw new Error('Bot needs View + Send Messages in the status channel.');
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

function formatStatusLine(namesSorted) {
    return namesSorted.length === 0
        ? EMPTY_STATUS
        : `Current boys: ${namesSorted.join(' & ')}`;
}

async function computeDesiredStatusText() {
    const names = getHumanMemberNamesInChannel();

    if (names.length === 0) {
        const text = formatStatusLine([]);
        console.log(`[${timestamp()}] 🔍 Empty channel → "${text}"`);
        return text;
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
        const fallback = formatStatusLine(sorted);
        console.log(`[${timestamp()}] 📝 No mapping found, using fallback: "${fallback}"`);
        return trimStatus(fallback);
    }

    console.log(`[${timestamp()}] ⏭ No mapping, keeping last or default: "${lastAppliedText ?? EMPTY_STATUS}"`);
    return lastAppliedText ?? EMPTY_STATUS;
}

function normalizeRetryAfter(err) {
    let raw = err?.data?.retry_after ?? err?.retryAfter ?? null;
    if (raw == null) return null;
    let n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n > 5000 ? n : n * 1000; // ms
}

async function ensureStatusMessage() {
    if (statusMessage && statusMessage.edit) return statusMessage;

    if (STATUS_MESSAGE_ID) {
        try {
            statusMessage = await statusChannel.messages.fetch(STATUS_MESSAGE_ID);
            return statusMessage;
        } catch {
            console.warn(`[${timestamp()}] ⚠ Could not fetch STATUS_MESSAGE_ID=${STATUS_MESSAGE_ID}; will create a new one.`);
        }
    }

    const created = await statusChannel.send('…initializing voice status…');
    try {
        await created.pin().catch(() => { });
    } catch { }
    statusMessage = created;
    STATUS_MESSAGE_ID = created.id;
    console.log(`[${timestamp()}] 🧷 Created status message. Save this in your .env as STATUS_MESSAGE_ID=${STATUS_MESSAGE_ID}`);
    return statusMessage;
}

async function attemptStatusEdit(desired) {
    const now = Date.now();

    if (now - lastEditAt < MIN_EDIT_INTERVAL_MS) {
        const waitMs = MIN_EDIT_INTERVAL_MS - (now - lastEditAt);
        queuedDesiredText = desired;
        console.log(`[${timestamp()}] ⏳ Throttling by policy (${Math.ceil(waitMs / 1000)}s) → queued "${desired}"`);
        if (!cooldownTimer) {
            cooldownTimer = setTimeout(() => {
                cooldownTimer = null;
                const next = queuedDesiredText;
                queuedDesiredText = null;
                if (next) attemptStatusEdit(next).catch(() => { });
            }, waitMs);
        }
        return;
    }

    if (now < cooldownUntil) {
        const waitMs = cooldownUntil - now;
        queuedDesiredText = desired;
        console.log(`[${timestamp()}] ⏳ In server cooldown (${Math.ceil(waitMs / 1000)}s). Queued: "${desired}"`);
        if (!cooldownTimer) {
            cooldownTimer = setTimeout(() => {
                cooldownTimer = null;
                const next = queuedDesiredText;
                queuedDesiredText = null;
                if (next) attemptStatusEdit(next).catch(() => { });
            }, waitMs);
        }
        return;
    }

    const msg = await ensureStatusMessage();
    console.log(`[${timestamp()}] ✏️  Editing status message → "${desired}"`);

    try {
        await msg.edit(desired);
        lastAppliedText = desired;
        lastEditAt = Date.now();
        console.log(`[${timestamp()}] ✓ Status message updated.`);
    } catch (err) {
        const status = err?.httpStatus ?? err?.status;
        const retryAfterMs = normalizeRetryAfter(err);
        console.warn(`[${timestamp()}] ❌ Message edit failed — http=${status} code=${err?.code} msg=${err?.message} retryAfter(ms)=${retryAfterMs ?? 'n/a'}`);
        if (status === 429 && retryAfterMs) {
            cooldownUntil = Date.now() + retryAfterMs;
            queuedDesiredText = desired;
            if (cooldownTimer) clearTimeout(cooldownTimer);
            cooldownTimer = setTimeout(() => {
                cooldownTimer = null;
                const next = queuedDesiredText;
                queuedDesiredText = null;
                if (next) attemptStatusEdit(next).catch(() => { });
            }, retryAfterMs);
        }
    }
}

async function scheduleStatusUpdate() {
    if (pendingUpdateTimer) clearTimeout(pendingUpdateTimer);

    pendingUpdateTimer = setTimeout(async () => {
        pendingUpdateTimer = null;
        try {
            let desired = await computeDesiredStatusText();
            desired = desired + ' are chatting';
            if (!desired) return;

            if (lastAppliedText === desired) {
                console.log(`[${timestamp()}] → Status already correct.`);
                return;
            }

            await attemptStatusEdit(desired);
        } catch (err) {
            console.warn(`[${timestamp()}] ⚠ Status scheduling error:`, err.message);
        }
    }, COMPUTE_DEBOUNCE_MS);
}

client.once('clientReady', async () => {
    console.log(`[${timestamp()}] 🤖 Logged in as ${client.user.tag}`);
    await loadMapIfProvided();
    await resolveTargets();
    console.log(`[${timestamp()}] 🎯 Monitoring voice: ${voiceChannel.name} (ID: ${voiceChannel.id})`);
    console.log(`[${timestamp()}] 📝 Status will be posted/edited in: #${statusChannel.name} (ID: ${statusChannel.id})`);
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
        statusChannel = await targetGuild.channels.fetch(statusChannel.id);

        await scheduleStatusUpdate();
    } catch (e) {
        console.warn(`[${timestamp()}] ⚠ voiceStateUpdate handler error:`, e.message);
    }
});

client.login(process.env.DISCORD_TOKEN);

