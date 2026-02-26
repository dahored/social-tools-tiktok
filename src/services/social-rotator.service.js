'use strict';

const repo = require('../repositories/social-rotator.repository');

const VALID_PLATFORMS = new Set(['twitch', 'youtube', 'tiktok', 'facebook', 'kick', 'twitter']);
const VALID_ANIMATIONS = new Set(['slide', 'fade']);

function sanitizeUsername(raw) {
  const s = String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return s || 'default';
}

async function getSettings(username) {
  return repo.getSettings(sanitizeUsername(username));
}

async function saveSettings(data) {
  const username  = sanitizeUsername(data.username);
  const accounts  = (Array.isArray(data.accounts) ? data.accounts : [])
    .filter(a => a && VALID_PLATFORMS.has(a.platform))
    .map(a => ({
      platform: a.platform,
      handle:   String(a.handle || '').trim().slice(0, 100),
    }))
    .filter(a => a.handle)
    .slice(0, 30);

  const interval     = Math.max(2, Math.min(60, Math.round(Number(data.interval) || 5)));
  const animation    = VALID_ANIMATIONS.has(data.animation) ? data.animation : 'slide';
  const borderRadius = Math.max(0, Math.min(999, Math.round(Number(data.borderRadius) ?? 24)));
  const cardWidth    = Math.max(100, Math.min(1200, Math.round(Number(data.cardWidth) || 480)));

  return repo.saveSettings({ username, accounts, interval, animation, borderRadius, cardWidth });
}

module.exports = { getSettings, saveSettings };
