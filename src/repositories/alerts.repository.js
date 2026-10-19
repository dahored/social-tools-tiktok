'use strict';

const fs   = require('fs').promises;
const path = require('path');
const env  = require('../config/env');

const DATA_FILE = path.join(env.dataDir, 'alerts.json');
const SOUND_DIR = path.join(env.dataDir, 'alerts-sounds');

const DEFAULT_SETTINGS = Object.freeze({
  style:    'default', // default (neon banner) | gta
  size:     'large',   // large | compact (neon banner)
  duration: 6,         // seconds on screen per alert
  sound:    'style',   // style | off
  soundPack: 'auto',   // auto (by style) | tropical | sax | pizzicato | arcade | impacto | clasico
  volume:   70,
  types: {
    donation:     true,
    subscription: true,
    gift_sub:     true,
    follow:       true,
    raid:         true,
    share:        true,
    like:         true,
  },
  likeMilestone: 1000, // TikTok: alert every N total likes
  minBits:       1,    // Twitch
  minDiamonds:   1,    // TikTok
  showMessage:   true,
  // per event type: { mode: 'style' | 'custom' | 'off', file } — missing = style
  sounds:        {},
});

async function _read() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    return parsed && typeof parsed.users === 'object' ? parsed : { users: {} };
  } catch {
    return { users: {} };
  }
}

async function getSettings(username) {
  const store = await _read();
  const saved = store.users[username] || {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    types: { ...DEFAULT_SETTINGS.types, ...(saved.types || {}) },
    sounds: { ...(saved.sounds || {}) },
    username,
  };
}

async function saveSettings(username, patch) {
  const store = await _read();
  const current = store.users[username] || {};
  store.users[username] = {
    ...current,
    ...patch,
    types: { ...DEFAULT_SETTINGS.types, ...(current.types || {}), ...(patch.types || {}) },
    sounds: mergeSounds(current.sounds, patch.sounds),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
  return getSettings(username);
}

function mergeSounds(current = {}, patch = {}) {
  const out = { ...current };
  for (const [type, value] of Object.entries(patch)) out[type] = { ...(current[type] || {}), ...value };
  return out;
}

/** Stores a custom sound for one event type; returns the file name. */
async function saveSound(username, type, ext, buffer) {
  await fs.mkdir(SOUND_DIR, { recursive: true });
  const prefix = `${username}--${type}.`;
  for (const f of await fs.readdir(SOUND_DIR)) {
    if (f.startsWith(prefix)) await fs.unlink(path.join(SOUND_DIR, f));
  }
  const fileName = `${prefix}${ext}`;
  await fs.writeFile(path.join(SOUND_DIR, fileName), buffer);
  return fileName;
}

function soundPath(fileName) {
  return path.join(SOUND_DIR, path.basename(fileName));
}

module.exports = { getSettings, saveSettings, saveSound, soundPath, DEFAULT_SETTINGS };
