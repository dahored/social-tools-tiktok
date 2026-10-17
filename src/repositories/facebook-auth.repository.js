'use strict';

/**
 * Facebook Page tokens per username. Kept in their own file (never sent to the
 * browser): { users: { [username]: { pages: [{ id, name, token }], pageId, connectedAt } } }
 */

const fs   = require('fs').promises;
const path = require('path');
const env  = require('../config/env');

const DATA_FILE = path.join(env.dataDir, 'facebook-auth.json');

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
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

async function get(username) {
  const store = await _read();
  return store.users[username] || null;
}

async function save(username, record) {
  const store = await _read();
  store.users[username] = { ...(store.users[username] || {}), ...record };
  await _write(store);
  return store.users[username];
}

async function remove(username) {
  const store = await _read();
  delete store.users[username];
  await _write(store);
}

/** Token of a page connected by any user (the chat connector only knows the page id). */
async function pageToken(username, pageId) {
  const record = await get(username);
  const page = record && record.pages.find((p) => p.id === pageId);
  return page ? page.token : null;
}

module.exports = { get, save, remove, pageToken };
