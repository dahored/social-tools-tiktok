'use strict';

const fs   = require('fs').promises;
const path = require('path');
const env  = require('../config/env');

const DATA_FILE = path.join(env.dataDir, 'scene-transition.json');
const LOGO_DIR  = path.join(env.dataDir, 'scene-transition-logos');
const SOUND_DIR = path.join(env.dataDir, 'scene-transition-sounds');

const DEFAULT_SETTINGS = Object.freeze({
  game:     'default',
  logoMode: 'text',
  line1:    '',
  line2:    '',
  accent:   '#ff3c8e',
  soundMode: 'style', // style | custom | off
  soundFile: null,
  logoFile: null,
});

async function _ensureFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
  }
}

async function _read() {
  await _ensureFile();
  try {
    const raw    = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.users !== 'object') return { users: {} };
    return parsed;
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

/** Replaces the user's file in `dir` and returns its file name (relative to `dir`). */
async function _saveUserFile(dir, username, ext, buffer) {
  await fs.mkdir(dir, { recursive: true });
  const existing = await fs.readdir(dir);
  await Promise.all(
    existing
      .filter((f) => f.startsWith(username + '.'))
      .map((f) => fs.unlink(path.join(dir, f)))
  );
  const fileName = `${username}.${ext}`;
  await fs.writeFile(path.join(dir, fileName), buffer);
  return fileName;
}

function saveLogo(username, ext, buffer) {
  return _saveUserFile(LOGO_DIR, username, ext, buffer);
}

function saveSound(username, ext, buffer) {
  return _saveUserFile(SOUND_DIR, username, ext, buffer);
}

function logoPath(fileName) {
  return path.join(LOGO_DIR, path.basename(fileName));
}

function soundPath(fileName) {
  return path.join(SOUND_DIR, path.basename(fileName));
}

module.exports = { getSettings, saveSettings, saveLogo, saveSound, logoPath, soundPath, DEFAULT_SETTINGS };
