'use strict';

/**
 * Alerts (donations, subs, follows, raids, shares, likes). Events come from the
 * chat connectors (same channels as the Chat Overlay); this service only owns
 * the overlay settings and the test alerts.
 */

const repo = require('../repositories/alerts.repository');
const hub  = require('./chat-overlay.service');

const VALID_STYLES = new Set(['default', 'gta']);
const TYPES = Object.keys(repo.DEFAULT_SETTINGS.types);
const PLATFORMS = new Set(['twitch', 'kick', 'youtube', 'tiktok', 'facebook', 'x']);
const SOUND_MODES = new Set(['style', 'custom', 'off']);
const SOUND_TYPES = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm',
};
const MAX_SOUND_BYTES = 3 * 1024 * 1024;

async function getSettings(username) {
  return repo.getSettings(hub.sanitizeUsername(username));
}

async function saveSettings(data) {
  const username = hub.sanitizeUsername(data.username);
  const num = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v))));
  const patch = {};
  if (VALID_STYLES.has(data.style)) patch.style = data.style;
  if (data.size === 'large' || data.size === 'compact') patch.size = data.size;
  if (data.sound === 'style' || data.sound === 'off') patch.sound = data.sound;
  if (Number.isFinite(Number(data.duration)))      patch.duration = num(data.duration, 2, 30);
  if (Number.isFinite(Number(data.volume)))        patch.volume = num(data.volume, 0, 100);
  if (Number.isFinite(Number(data.likeMilestone))) patch.likeMilestone = num(data.likeMilestone, 100, 1000000);
  if (Number.isFinite(Number(data.minBits)))       patch.minBits = num(data.minBits, 1, 1000000);
  if (Number.isFinite(Number(data.minDiamonds)))   patch.minDiamonds = num(data.minDiamonds, 1, 1000000);
  if (typeof data.showMessage === 'boolean')       patch.showMessage = data.showMessage;
  if (data.types && typeof data.types === 'object') {
    patch.types = {};
    for (const t of TYPES) if (typeof data.types[t] === 'boolean') patch.types[t] = data.types[t];
  }
  if (data.sounds && typeof data.sounds === 'object') {
    patch.sounds = {};
    for (const t of TYPES) {
      const mode = data.sounds[t] && data.sounds[t].mode;
      if (SOUND_MODES.has(mode)) patch.sounds[t] = { mode }; // files only change through uploadSound
    }
  }
  const settings = await repo.saveSettings(username, patch);
  hub.broadcastAlertSettings(username, settings);
  return settings;
}

const NAMES = ['DahoFan', 'ViceCityKid', 'NeonRider', 'LeonidaLocal', 'GamerPro99'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** A realistic fake alert per type/platform, so styles can be tuned offline. */
function sampleAlert(type, platform) {
  const user = { name: pick(NAMES) };
  switch (type) {
    case 'donation':
      if (platform === 'tiktok') {
        return { type, user, amount: { value: 500, unit: 'diamonds', display: '500 💎' }, item: { name: 'León', count: 1 } };
      }
      if (platform === 'twitch') return { type, user, amount: { value: 500, unit: 'bits', display: '500 bits' }, message: '¡Sigue así!' };
      if (platform === 'kick') return { type, user, amount: { value: 100, unit: 'kicks', display: '100 Kicks' }, message: 'GG' };
      if (platform === 'x') return { type, user, amount: { value: 5, unit: 'currency', display: '$5.00' }, message: '¡Saludos desde X!' };
      return { type, user, amount: { value: 10, unit: 'currency', display: '$10.00' }, message: '¡Gracias por el stream!' };
    case 'subscription':
      return { type, user, months: pick([1, 3, 6, 12]), tier: platform === 'youtube' ? 'Miembro' : 'Tier 1', message: 'Aquí sigo 💜' };
    case 'gift_sub':
      return { type, user, count: pick([1, 5, 10]) };
    case 'follow':
      return { type, user };
    case 'raid':
      return { type, user: { name: pick(['StreamerAmigo', 'NeonCrew', 'TacoGamer']) }, count: pick([12, 48, 230]) };
    case 'share':
      return { type, user };
    case 'like':
      return { type, user, count: 1000, previous: 900 };
    default:
      return { type: 'follow', user };
  }
}

function sendTest(username, type, platform) {
  username = hub.sanitizeUsername(username);
  if (!TYPES.includes(type)) type = 'donation';
  if (!PLATFORMS.has(platform)) platform = 'tiktok';
  hub.publishAlert(username, platform, { id: `test-${Date.now()}`, test: true, ...sampleAlert(type, platform) });
  return { sent: true, type, platform };
}

/** Custom sound for one event type, from a `data:audio/...;base64,` URL. */
async function uploadSound(username, type, dataUrl) {
  username = hub.sanitizeUsername(username);
  if (!TYPES.includes(type)) throw new Error('Tipo de alerta inválido');
  const match = /^data:([a-z0-9/+.-]+)(?:;[^,]*)?;base64,(.+)$/i.exec(String(dataUrl || ''));
  const mime = match && match[1].toLowerCase();
  if (!mime || !SOUND_TYPES[mime]) throw new Error('El audio debe ser MP3, OGG, WAV o M4A');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_SOUND_BYTES) throw new Error('El audio debe pesar 3 MB o menos');

  const file = await repo.saveSound(username, type, SOUND_TYPES[mime], buffer);
  const settings = await repo.saveSettings(username, { sounds: { [type]: { mode: 'custom', file } } });
  hub.broadcastAlertSettings(username, settings);
  return settings;
}

async function getSoundPath(username, type) {
  const settings = await repo.getSettings(hub.sanitizeUsername(username));
  const entry = settings.sounds[type];
  return entry && entry.file ? repo.soundPath(entry.file) : null;
}

module.exports = { getSettings, saveSettings, sendTest, uploadSound, getSoundPath, TYPES };
