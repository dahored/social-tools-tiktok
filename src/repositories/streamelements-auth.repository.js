'use strict';

/**
 * StreamElements channels per username (JWT tokens are secrets: never sent to the browser).
 * { users: { [username]: { channels: [{ id, provider, name, avatar, token, addedAt }] } } }
 */

const fs   = require('fs').promises;
const path = require('path');
const env  = require('../config/env');

const DATA_FILE = path.join(env.dataDir, 'streamelements-auth.json');

async function _read() {
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    return parsed && typeof parsed.users === 'object' ? parsed : { users: {} };
  } catch {
    return { users: {} };
  }
}

async function _write(store) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

async function list(username) {
  const store = await _read();
  return (store.users[username] && store.users[username].channels) || [];
}

async function upsert(username, channel) {
  const store = await _read();
  const channels = ((store.users[username] && store.users[username].channels) || []).filter((c) => c.id !== channel.id);
  channels.push(channel);
  store.users[username] = { channels };
  await _write(store);
  return channels;
}

async function remove(username, id) {
  const store = await _read();
  const channels = ((store.users[username] && store.users[username].channels) || []).filter((c) => c.id !== id);
  store.users[username] = { channels };
  await _write(store);
  return channels;
}

module.exports = { list, upsert, remove };
