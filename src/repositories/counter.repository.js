'use strict';

const fs   = require('fs').promises;
const path = require('path');
const env  = require('../config/env');

const DATA_FILE  = path.join(env.dataDir, 'counter-state.json');
const FONT_TYPES = new Set(['basic', 'resident-evil', 'god-of-war']);

const DEFAULT_STATE = Object.freeze({
  count:           0,
  label:           'Counter',
  countColor:      '#a00000',
  labelColor:      '#a00000',
  fontType:        'basic',
  letterSpacing:   0,
  wordSpacing:     0,
  countFontSize:   96,
  labelFontSize:   40,
  countTextShadow: false,
  labelTextShadow: false,
  updatedAt:       null,
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

function _toNum(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function _toBool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number')  return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true'  || v === '1' || v === 'on')  return true;
    if (v === 'false' || v === '0' || v === 'off') return false;
  }
  return fallback;
}

function _normalize(raw) {
  const base = { ...DEFAULT_STATE };
  if (!raw || typeof raw !== 'object') {
    return { ...base, updatedAt: new Date().toISOString() };
  }
  return {
    count:           Number.isFinite(Number(raw.count)) ? Math.max(0, Math.trunc(Number(raw.count))) : base.count,
    label:           typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 60) : base.label,
    countColor:      typeof raw.countColor === 'string' ? raw.countColor : base.countColor,
    labelColor:      typeof raw.labelColor === 'string' ? raw.labelColor : base.labelColor,
    fontType:        FONT_TYPES.has(raw.fontType) ? raw.fontType : base.fontType,
    letterSpacing:   _toNum(raw.letterSpacing,  base.letterSpacing,  -10, 60),
    wordSpacing:     _toNum(raw.wordSpacing,     base.wordSpacing,    -20, 120),
    countFontSize:   _toNum(raw.countFontSize,   base.countFontSize,   20, 320),
    labelFontSize:   _toNum(raw.labelFontSize,   base.labelFontSize,   12, 220),
    countTextShadow: _toBool(raw.countTextShadow, base.countTextShadow),
    labelTextShadow: _toBool(raw.labelTextShadow, base.labelTextShadow),
    updatedAt:       new Date().toISOString(),
  };
}

async function getState(username) {
  const store   = await _read();
  const current = _normalize(store.users[username]);
  if (!store.users[username]) {
    store.users[username] = current;
    await _write(store);
  }
  return current;
}

async function updateState(username, updater) {
  const store   = await _read();
  const current = _normalize(store.users[username]);
  const next    = _normalize(updater(current));
  store.users[username] = next;
  await _write(store);
  return next;
}

module.exports = { getState, updateState, FONT_TYPES, DEFAULT_STATE };
