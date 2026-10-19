'use strict';

const repo     = require('../repositories/social-rotator.repository');
const channels = require('./channels.service');

// "Mis canales" uses `x`; the rotator's card config calls it `twitter`
const ORDER_DEFAULT = ['tiktok', 'twitch', 'youtube', 'kick', 'facebook', 'x'];
const toCard = (p) => (p === 'x' ? 'twitter' : p);
const fromCard = (p) => (p === 'twitter' ? 'x' : p);
const VALID_ANIMATIONS = new Set(['slide', 'fade']);
const VALID_GAMES      = new Set(['default', 'gta', 'resident-evil', 'god-of-war']);

function sanitizeUsername(raw) {
  const s = String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return s || 'default';
}

/** Full display order: saved order → legacy account order → defaults, plus anything missing. */
function resolveOrder(settings) {
  const base = Array.isArray(settings.order) && settings.order.length
    ? settings.order
    : (settings.accounts || []).map((a) => fromCard(a.platform));
  const seen = new Set();
  return base.concat(ORDER_DEFAULT).filter((p) => ORDER_DEFAULT.includes(p) && !seen.has(p) && seen.add(p));
}

/** Settings + the cards to rotate, built from "Mis canales". */
async function getSettings(username) {
  username = sanitizeUsername(username);
  const settings = await repo.getSettings(username);
  const mine = await channels.get(username);
  const order = resolveOrder(settings);
  const hidden = Array.isArray(settings.hidden) ? settings.hidden : [];
  const available = order.map((p) => ({
    platform: toCard(p),
    handle: channels.displayHandle(mine[p]),
    hidden: hidden.includes(p),
  }));
  return {
    ...settings,
    order,
    hidden,
    available, // every platform with its handle (empty = not set in "Mis canales")
    accounts: available.filter((a) => a.handle && !a.hidden).map(({ platform, handle }) => ({ platform, handle })),
  };
}

async function saveSettings(data) {
  const username = sanitizeUsername(data.username);
  const current = await repo.getSettings(username);
  const order = Array.isArray(data.order)
    ? resolveOrder({ order: data.order.map(fromCard) })
    : resolveOrder(current);
  const hidden = Array.isArray(data.hidden)
    ? data.hidden.map(fromCard).filter((p) => ORDER_DEFAULT.includes(p))
    : (current.hidden || []);

  const interval     = Math.max(2, Math.min(60, Math.round(Number(data.interval) || 5)));
  const animation    = VALID_ANIMATIONS.has(data.animation) ? data.animation : 'slide';
  const radius       = Number(data.borderRadius);
  const borderRadius = Number.isFinite(radius) ? Math.max(0, Math.min(999, Math.round(radius))) : 24;
  const cardWidth    = Math.max(100, Math.min(1200, Math.round(Number(data.cardWidth) || 480)));
  const game         = VALID_GAMES.has(data.game) ? data.game : 'default';

  await repo.saveSettings({ username, order, hidden, interval, animation, borderRadius, cardWidth, game });
  return getSettings(username);
}

module.exports = { getSettings, saveSettings };
