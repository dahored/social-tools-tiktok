'use strict';

/**
 * Chat overlay hub. One set of platform connections per username, shared by
 * every open overlay / editor (SSE clients). Connections start with the first
 * client and stop a minute after the last one leaves.
 */

const repo = require('../repositories/chat-overlay.repository');
const { createTwitchConnector }  = require('./chat/twitch.connector');
const { createKickConnector }    = require('./chat/kick.connector');
const { createYoutubeConnector } = require('./chat/youtube.connector');
const { createTiktokConnector }  = require('./chat/tiktok.connector');
const { createFacebookConnector } = require('./chat/facebook.connector');
const fbAuth = require('./facebook-auth.service');

const PLATFORMS = {
  twitch:  createTwitchConnector,
  kick:    createKickConnector,
  youtube: createYoutubeConnector,
  tiktok:  createTiktokConnector,
  facebook: createFacebookConnector, // channel = page id, set by "Conectar Facebook"
};
const VALID_STYLES = new Set(['default', 'gta']);
const VALID_SOUNDS = new Set(['style', 'custom', 'off']);
const SOUND_TYPES  = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm',
};
const MAX_SOUND_BYTES = 2 * 1024 * 1024;
const RECENT_LIMIT = 30;
const IDLE_STOP_MS = 60 * 1000;

/** username -> { clients, connectors: {platform: {channel, conn}}, statuses, recent, idleTimer } */
const _rooms = new Map();

function sanitizeUsername(raw) {
  const s = String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return s || 'default';
}

function _cleanChannel(v) {
  return String(v ?? '').trim().slice(0, 200);
}

function _room(username) {
  if (!_rooms.has(username)) {
    _rooms.set(username, { username, clients: new Set(), connectors: {}, statuses: {}, recent: [], idleTimer: null });
  }
  return _rooms.get(username);
}

function _send(room, payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of room.clients) res.write(data);
}

function _status(room, platform, state, detail) {
  room.statuses[platform] = { state, detail: detail || null };
  _send(room, { type: 'status', platform, state, detail: detail || null });
}

function _publish(room, platform, message) {
  const msg = { ...message, id: `${platform}:${message.id}`, platform };
  room.recent.push(msg);
  if (room.recent.length > RECENT_LIMIT) room.recent.shift();
  _send(room, { type: 'message', message: msg });
}

function _delete(room, platform, { ids, user, all }) {
  const payload = { type: 'delete', platform };
  if (ids) payload.ids = ids.map((id) => `${platform}:${id}`);
  if (user) payload.user = user;
  if (all) payload.all = true;
  room.recent = room.recent.filter((m) => {
    if (m.platform !== platform) return true;
    if (all) return false;
    if (payload.ids && payload.ids.includes(m.id)) return false;
    if (user && m.author.name.toLowerCase() === String(user).toLowerCase()) return false;
    return true;
  });
  _send(room, payload);
}

/** Starts/stops/restarts connectors so they match the saved channels. */
function _sync(room, settings) {
  for (const platform of Object.keys(PLATFORMS)) {
    const channel = _cleanChannel(settings[platform]);
    const current = room.connectors[platform];
    if (current && current.channel === channel) continue;

    if (current) current.conn.stop();
    delete room.connectors[platform];
    room.statuses[platform] = { state: 'off', detail: null };

    if (channel) {
      const conn = PLATFORMS[platform]({
        channel,
        username: room.username,
        onMessage: (m) => _publish(room, platform, m),
        onDelete:  (d) => _delete(room, platform, d),
        onStatus:  (state, detail) => _status(room, platform, state, detail),
      });
      room.connectors[platform] = { channel, conn };
    } else {
      _send(room, { type: 'status', platform, state: 'off', detail: null });
    }
  }
}

function _stopAll(room) {
  for (const { conn } of Object.values(room.connectors)) conn.stop();
  room.connectors = {};
  room.statuses = {};
}

async function getSettings(username) {
  return repo.getSettings(sanitizeUsername(username));
}

async function saveSettings(data) {
  const username = sanitizeUsername(data.username);
  const patch = {};
  if (VALID_STYLES.has(data.style)) patch.style = data.style;
  for (const platform of Object.keys(PLATFORMS)) {
    if (platform === 'facebook') continue; // managed by "Conectar Facebook"
    if (data[platform] !== undefined) patch[platform] = _cleanChannel(data[platform]);
  }
  const num = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v))));
  if (Number.isFinite(Number(data.maxMessages))) patch.maxMessages = num(data.maxMessages, 1, 30);
  if (Number.isFinite(Number(data.hideAfter)))   patch.hideAfter   = num(data.hideAfter, 0, 600);
  if (Number.isFinite(Number(data.fontSize)))    patch.fontSize    = num(data.fontSize, 12, 72);
  if (VALID_SOUNDS.has(data.sound))               patch.sound       = data.sound;
  if (Number.isFinite(Number(data.soundVolume)))  patch.soundVolume = num(data.soundVolume, 0, 100);
  if (Number.isFinite(Number(data.soundCooldown))) patch.soundCooldown = num(data.soundCooldown, 0, 30);

  const settings = await repo.saveSettings(username, patch);
  const room = _rooms.get(username);
  if (room) {
    _send(room, { type: 'settings', settings });
    if (room.clients.size) _sync(room, settings);
  }
  return settings;
}

/** Registers an SSE client and sends it the current snapshot. */
async function subscribe(username, res) {
  username = sanitizeUsername(username);
  const room = _room(username);
  clearTimeout(room.idleTimer);
  room.clients.add(res);

  const settings = await repo.getSettings(username);
  _sync(room, settings);
  res.write(`data: ${JSON.stringify({ type: 'snapshot', settings, statuses: room.statuses, recent: room.recent })}\n\n`);
}

function unsubscribe(username, res) {
  username = sanitizeUsername(username);
  const room = _rooms.get(username);
  if (!room) return;
  room.clients.delete(res);
  if (room.clients.size === 0) {
    room.idleTimer = setTimeout(() => {
      if (room.clients.size === 0) {
        _stopAll(room);
        _rooms.delete(username);
      }
    }, IDLE_STOP_MS);
  }
}

const TEST_LINES = {
  twitch:  ['¡Qué buen stream! 🔥', 'Ese último kill estuvo brutal', 'Saludos desde Lima 👋'],
  kick:    ['GG ez', 'Vamos con todo hoy 💪', '¿Cuándo sale el próximo video?'],
  youtube: ['Primera vez por aquí, me encanta el overlay', 'Like y suscrito ✅', 'Ese logo está genial'],
  tiktok:  ['Holaaa desde TikTok 💖', 'Te sigo desde el FYP', 'Manda saludo porfa 🙏'],
  facebook: ['Saludos desde Facebook 👍', 'Compartido con mis amigos', '¿A qué hora es el próximo directo?'],
};
const TEST_NAMES = ['DahoFan', 'ViceCityKid', 'NeonRider', 'LeonidaLocal', 'GamerPro99'];

/** Pushes a fake message so the overlay can be styled without a live chat. */
function sendTest(username, platform) {
  username = sanitizeUsername(username);
  if (!PLATFORMS[platform]) platform = 'twitch';
  const room = _room(username);
  const lines = TEST_LINES[platform];
  const roles = [[], ['subscriber'], ['moderator'], ['vip'], []][Math.floor(Math.random() * 5)];
  _publish(room, platform, {
    id: `test-${Date.now()}`,
    author: {
      name: TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)],
      color: ['#ff6aa6', '#8ea4ff', '#ffbd66', '#5ce1e6', '#b4ff6a'][Math.floor(Math.random() * 5)],
      roles,
    },
    parts: [{ type: 'text', text: lines[Math.floor(Math.random() * lines.length)] }],
    ts: Date.now(),
    test: true,
  });
  return { sent: true, listeners: room.clients.size };
}

/** Stores a custom message sound from a `data:audio/...;base64,` URL. */
async function saveSound(username, dataUrl) {
  username = sanitizeUsername(username);
  const match = /^data:([a-z0-9/+.-]+)(?:;[^,]*)?;base64,(.+)$/i.exec(String(dataUrl || ''));
  const type = match && match[1].toLowerCase();
  if (!type || !SOUND_TYPES[type]) throw new Error('El audio debe ser MP3, OGG, WAV o M4A');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_SOUND_BYTES) throw new Error('El audio debe pesar 2 MB o menos');

  const soundFile = await repo.saveSound(username, SOUND_TYPES[type], buffer);
  const settings = await repo.saveSettings(username, { soundFile, sound: 'custom' });
  const room = _rooms.get(username);
  if (room) _send(room, { type: 'settings', settings });
  return settings;
}

async function getSoundPath(username) {
  const settings = await repo.getSettings(sanitizeUsername(username));
  return settings.soundFile ? repo.soundPath(settings.soundFile) : null;
}

/** Points the chat at the connected Facebook Page (or clears it). */
async function setFacebookPage(username, pageId) {
  username = sanitizeUsername(username);
  const settings = await repo.saveSettings(username, { facebook: pageId || '' });
  const room = _rooms.get(username);
  if (room) {
    _send(room, { type: 'settings', settings });
    if (room.clients.size) _sync(room, settings);
  }
  return settings;
}

/* ── "Conectar Facebook" ─────────────────────────────────────────────── */

function facebookLoginUrl(username, origin) {
  return fbAuth.loginUrl(sanitizeUsername(username), origin);
}

async function facebookCallback(params) {
  const { username, pageId } = await fbAuth.handleCallback(params);
  await setFacebookPage(username, pageId);
  return username;
}

function facebookStatus(username) {
  return fbAuth.status(sanitizeUsername(username));
}

async function facebookSelectPage(username, pageId) {
  username = sanitizeUsername(username);
  await fbAuth.selectPage(username, String(pageId || ''));
  await setFacebookPage(username, String(pageId));
  return fbAuth.status(username);
}

async function facebookDisconnect(username) {
  username = sanitizeUsername(username);
  await fbAuth.disconnect(username);
  await setFacebookPage(username, '');
  return fbAuth.status(username);
}

module.exports = {
  sanitizeUsername,
  getSettings,
  saveSettings,
  subscribe,
  unsubscribe,
  sendTest,
  saveSound,
  getSoundPath,
  facebookLoginUrl,
  facebookCallback,
  facebookStatus,
  facebookSelectPage,
  facebookDisconnect,
};
