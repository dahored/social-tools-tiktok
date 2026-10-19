'use strict';

const repo = require('../repositories/channels.repository');

function sanitizeUsername(raw) {
  const s = String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return s || 'default';
}

function clean(v) {
  return String(v ?? '').trim().slice(0, 200);
}

/** "@dahored", "https://www.tiktok.com/@dahored" → "dahored" (for cards). */
function displayHandle(value) {
  return clean(value)
    .replace(/^https?:\/\/(www\.|m\.)?[^/]+\//i, '')
    .replace(/^(channel|c|user)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];
}

const listeners = new Set();

/** Widgets that hold live connections (chat hub) re-sync when channels change. */
function onChange(fn) {
  listeners.add(fn);
}

async function get(username) {
  return { ...(await repo.get(sanitizeUsername(username))), username: sanitizeUsername(username) };
}

async function save(data) {
  const username = sanitizeUsername(data.username);
  const patch = {};
  for (const p of repo.PLATFORMS) if (data[p] !== undefined) patch[p] = clean(data[p]);
  const record = await repo.save(username, patch);
  for (const fn of listeners) {
    try { await fn(username, record); } catch (err) { console.warn('[channels] listener failed:', err.message); }
  }
  return { ...record, username };
}

module.exports = { get, save, onChange, displayHandle, sanitizeUsername, PLATFORMS: repo.PLATFORMS };
