'use strict';

/**
 * "Mis canales": the user's accounts on every platform, entered once and used
 * by every widget (chat, alerts, social rotator…).
 * { users: { [username]: { twitch, kick, youtube, tiktok, facebook, x, updatedAt } } }
 * `facebook` is the public handle shown on cards; the chat/alerts connection to a
 * Facebook Page is separate (facebook-auth.json).
 */

const fs   = require('fs').promises;
const path = require('path');
const env  = require('../config/env');

const DATA_FILE = path.join(env.dataDir, 'channels.json');
const PLATFORMS = ['twitch', 'kick', 'youtube', 'tiktok', 'facebook', 'x'];

async function readJson(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(env.dataDir, file), 'utf8'));
    return parsed && typeof parsed.users === 'object' ? parsed : { users: {} };
  } catch {
    return { users: {} };
  }
}

/** First time a user opens "Mis canales": reuse what the chat and rotator already had. */
async function migrate(username) {
  const chat = (await readJson('chat-overlay.json')).users[username] || {};
  const rotator = (await readJson('social-rotator.json')).users[username] || {};
  const record = {};
  for (const p of ['twitch', 'kick', 'youtube', 'tiktok']) if (chat[p]) record[p] = chat[p];
  for (const acc of rotator.accounts || []) {
    const key = acc.platform === 'twitter' ? 'x' : acc.platform;
    if (PLATFORMS.includes(key) && !record[key] && acc.handle) record[key] = acc.handle;
  }
  return record;
}

async function get(username) {
  const store = await readJson('channels.json');
  if (store.users[username]) return { ...emptyRecord(), ...store.users[username] };

  const migrated = await migrate(username);
  if (Object.keys(migrated).length) return save(username, migrated);
  return emptyRecord();
}

function emptyRecord() {
  return Object.fromEntries(PLATFORMS.map((p) => [p, '']));
}

async function save(username, patch) {
  const store = await readJson('channels.json');
  store.users[username] = {
    ...emptyRecord(),
    ...(store.users[username] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
  return { ...store.users[username] };
}

module.exports = { get, save, PLATFORMS };
