'use strict';

/**
 * StreamElements as a bridge for what we can't read directly: X (chat/events),
 * tips (PayPal/card donations) and Twitch follows. The user pastes each SE
 * channel's JWT ("Mis canales"); we validate it and keep it server-side.
 */

const repo = require('../repositories/streamelements-auth.repository');

const API = 'https://api.streamelements.com/kappa/v2';
const listeners = new Set();

function onChange(fn) {
  listeners.add(fn);
}

async function notify(username) {
  for (const fn of listeners) {
    try { await fn(username); } catch (err) { console.warn('[streamelements] listener failed:', err.message); }
  }
}

/** Validates a JWT against SE and returns the channel it belongs to. */
async function lookupChannel(token) {
  const res = await fetch(`${API}/channels/me`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new Error('Token inválido o vencido: copia el JWT Token de nuevo');
  if (!res.ok) throw new Error(`StreamElements respondió HTTP ${res.status}`);
  const ch = await res.json();
  if (!ch || !ch._id) throw new Error('StreamElements no devolvió el canal');
  return { id: ch._id, provider: String(ch.provider || '').toLowerCase(), name: ch.displayName || ch.username || ch._id, avatar: ch.avatar || null };
}

/** Public view — never includes tokens. */
async function status(username) {
  const channels = await repo.list(username);
  return { channels: channels.map(({ id, provider, name, avatar, addedAt }) => ({ id, provider, name, avatar, addedAt })) };
}

async function addToken(username, token) {
  token = String(token || '').trim().replace(/^Bearer\s+/i, '');
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error('Pega el "JWT Token" completo de StreamElements');
  const channel = await lookupChannel(token);
  await repo.upsert(username, { ...channel, token, addedAt: new Date().toISOString() });
  await notify(username);
  return status(username);
}

async function removeChannel(username, id) {
  await repo.remove(username, String(id || ''));
  await notify(username);
  return status(username);
}

/** Server-side only (connectors): channels with their tokens. */
function channelsWithTokens(username) {
  return repo.list(username);
}

module.exports = { status, addToken, removeChannel, channelsWithTokens, onChange };
