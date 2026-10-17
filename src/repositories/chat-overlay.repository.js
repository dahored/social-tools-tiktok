'use strict';

const fs   = require('fs').promises;
const path = require('path');
const env  = require('../config/env');

const DATA_FILE = path.join(env.dataDir, 'chat-overlay.json');
const SOUND_DIR = path.join(env.dataDir, 'chat-overlay-sounds');

const DEFAULT_SETTINGS = Object.freeze({
  style:       'default', // default | gta
  twitch:      '',
  kick:        '',
  youtube:     '',
  tiktok:      '',
  facebook:    '',        // page id, set by "Conectar Facebook"
  maxMessages: 8,
  hideAfter:   0,         // seconds, 0 = keep until pushed out
  fontSize:    26,
  sound:       'style',   // message sound: style | custom | off
  soundVolume: 60,        // 0–100
  soundCooldown: 1,       // min seconds between sounds (busy chats)
  soundFile:   null,      // uploaded custom sound
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

async function _write(store) {
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

async function getSettings(username) {
  const store = await _read();
  return { ...DEFAULT_SETTINGS, ...(store.users[username] || {}), username };
}

async function saveSettings(username, patch) {
  const store = await _read();
  store.users[username] = {
    ...DEFAULT_SETTINGS,
    ...(store.users[username] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await _write(store);
  return { ...store.users[username], username };
}

/** Replaces the user's custom message sound; returns the file name. */
async function saveSound(username, ext, buffer) {
  await fs.mkdir(SOUND_DIR, { recursive: true });
  for (const f of await fs.readdir(SOUND_DIR)) {
    if (f.startsWith(username + '.')) await fs.unlink(path.join(SOUND_DIR, f));
  }
  const fileName = `${username}.${ext}`;
  await fs.writeFile(path.join(SOUND_DIR, fileName), buffer);
  return fileName;
}

function soundPath(fileName) {
  return path.join(SOUND_DIR, path.basename(fileName));
}

module.exports = { getSettings, saveSettings, saveSound, soundPath, DEFAULT_SETTINGS };
