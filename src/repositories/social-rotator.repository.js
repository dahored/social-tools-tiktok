'use strict';

const fs   = require('fs').promises;
const path = require('path');
const env  = require('../config/env');

const DATA_FILE = path.join(env.dataDir, 'social-rotator.json');

const DEFAULT_SETTINGS = Object.freeze({
  accounts:     [],     // legacy: accounts now come from "Mis canales"; kept to seed the order
  order:        null,   // platform display order (null = derive from legacy accounts)
  hidden:       [],     // platforms not shown on this widget
  interval:     5,
  animation:    'slide',
  borderRadius: 24,
  cardWidth:    480,
  game:         'default',
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

async function saveSettings(data) {
  const store = await _read();
  store.users[data.username] = {
    ...(store.users[data.username] || {}),
    order:        data.order,
    hidden:       data.hidden,
    interval:     data.interval,
    animation:    data.animation,
    borderRadius: data.borderRadius,
    cardWidth:    data.cardWidth,
    game:         data.game,
  };
  await _write(store);
  return { ...store.users[data.username], username: data.username };
}

module.exports = { getSettings, saveSettings, DEFAULT_SETTINGS };
