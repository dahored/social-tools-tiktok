'use strict';

const fs   = require('fs').promises;
const path = require('path');
const repo = require('../repositories/scene-transition.repository');

const VALID_GAMES      = new Set(['default', 'gta']);
const VALID_LOGO_MODES = new Set(['text', 'image']);
const LOGO_TYPES       = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_LOGO_BYTES   = 2 * 1024 * 1024;
const VALID_SOUND_MODES = new Set(['style', 'custom', 'off']);
const SOUND_TYPES      = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm',
};
const MAX_SOUND_BYTES  = 5 * 1024 * 1024;

/** Rendered stinger videos live here (written by `video/render-transition.mjs`). */
const VIDEO_DIR = path.join(__dirname, '..', '..', 'storage', 'transitions');

/** In-memory SSE client registry: Map<username, Set<Response>> */
const _sseClients = new Map();

/* ── Render jobs ───────────────────────────────────────────────────────────
   The server (Docker, Node 20) can't run HyperFrames, so renders happen on the
   host: `video/render-worker.mjs` holds an SSE connection here, receives jobs,
   renders into storage/transitions/ and reports back. */
const VALID_FORMATS      = new Set(['webm', 'mov']);
const VALID_ORIENTATIONS = new Set(['horizontal', 'vertical']);
const JOB_TTL_MS    = 60 * 60 * 1000;
const _jobs         = new Map(); // id -> job
const _workers      = new Set(); // SSE responses
let   _jobSeq       = 0;

function sanitizeUsername(raw) {
  const s = String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return s || 'default';
}

function _cleanLine(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

/** Older saves used `sound: false` — map it onto soundMode. */
function _withSoundMode(settings) {
  if (!settings.soundMode || !VALID_SOUND_MODES.has(settings.soundMode)) {
    settings.soundMode = settings.sound === false ? 'off' : 'style';
  }
  if (settings.soundMode === 'custom' && !settings.soundFile) settings.soundMode = 'style';
  delete settings.sound;
  return settings;
}

async function getSettings(username) {
  return _withSoundMode(await repo.getSettings(sanitizeUsername(username)));
}

async function saveSettings(data) {
  const username = sanitizeUsername(data.username);
  const patch    = {};

  if (VALID_GAMES.has(data.game))          patch.game     = data.game;
  if (VALID_LOGO_MODES.has(data.logoMode)) patch.logoMode = data.logoMode;
  if (data.line1 !== undefined)            patch.line1    = _cleanLine(data.line1);
  if (data.line2 !== undefined)            patch.line2    = _cleanLine(data.line2);
  if (VALID_SOUND_MODES.has(data.soundMode)) patch.soundMode = data.soundMode;
  if (typeof data.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.accent)) patch.accent = data.accent;

  const settings = _withSoundMode(await repo.saveSettings(username, patch));
  broadcast(username, { type: 'settings', settings });
  return settings;
}

/** Accepts a `data:audio/...;base64,` URL and stores it as the user's custom transition sound. */
async function saveSound(username, dataUrl) {
  username = sanitizeUsername(username);
  const match = /^data:([a-z0-9/+.-]+)(?:;[^,]*)?;base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match || !SOUND_TYPES[match[1].toLowerCase()]) throw new Error('El audio debe ser MP3, OGG, WAV o M4A');

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_SOUND_BYTES) throw new Error('El audio debe pesar 5 MB o menos');

  const soundFile = await repo.saveSound(username, SOUND_TYPES[match[1].toLowerCase()], buffer);
  const settings = _withSoundMode(await repo.saveSettings(username, { soundFile, soundMode: 'custom' }));
  broadcast(username, { type: 'settings', settings });
  return settings;
}

async function getSoundPath(username) {
  const settings = await repo.getSettings(sanitizeUsername(username));
  return settings.soundFile ? repo.soundPath(settings.soundFile) : null;
}

/** Accepts a `data:image/...;base64,` URL and stores it as the user's logo. */
async function saveLogo(username, dataUrl) {
  username = sanitizeUsername(username);
  const match = /^data:([a-z/+]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match || !LOGO_TYPES[match[1]]) throw new Error('Logo must be a PNG, JPG, WebP or SVG image');

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_LOGO_BYTES) throw new Error('Logo must be 2 MB or smaller');

  const logoFile = await repo.saveLogo(username, LOGO_TYPES[match[1]], buffer);
  const settings = _withSoundMode(await repo.saveSettings(username, { logoFile, logoMode: 'image' }));
  broadcast(username, { type: 'settings', settings });
  return settings;
}

async function getLogoPath(username) {
  const settings = await repo.getSettings(sanitizeUsername(username));
  return settings.logoFile ? repo.logoPath(settings.logoFile) : null;
}

/** Lists rendered videos for a user: [{ game, orientation, format, file, url, updatedAt }]. */
async function listVideos(username) {
  username = sanitizeUsername(username);
  let files = [];
  try {
    files = await fs.readdir(VIDEO_DIR);
  } catch {
    return [];
  }
  const prefix = username + '-';
  const videos = await Promise.all(
    files
      .filter((f) => f.startsWith(prefix) && /\.(webm|mov|mp4)$/.test(f))
      .map(async (file) => {
        const stat = await fs.stat(path.join(VIDEO_DIR, file));
        const [base, format] = file.slice(prefix.length).split('.');
        const vertical = base.endsWith('-vertical');
        const game = vertical ? base.slice(0, -'-vertical'.length) : base;
        return {
          game,
          orientation: vertical ? 'vertical' : 'horizontal',
          format,
          file,
          url: '/media/transitions/' + file,
          updatedAt: stat.mtime.toISOString(),
        };
      })
  );
  return videos.sort((a, b) => a.file.localeCompare(b.file));
}

/** Deletes one rendered video of `username`. Returns false if it doesn't exist. */
async function deleteVideo(username, file) {
  username = sanitizeUsername(username);
  file = String(file || '');
  // Only a plain file name of this user's renders — no paths, no other users
  if (path.basename(file) !== file || !file.startsWith(username + '-') || !/\.(webm|mov|mp4)$/.test(file)) {
    throw new Error('Invalid video');
  }
  try {
    await fs.unlink(path.join(VIDEO_DIR, file));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

function _pruneJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of _jobs) if (job.createdAt < cutoff) _jobs.delete(id);
}

function _publicJob(job) {
  const { id, username, format, orientation, status, error, file, createdAt, updatedAt } = job;
  return { id, username, format, orientation, status, error, createdAt, updatedAt, url: file ? '/media/transitions/' + file : null };
}

function _dispatch(job) {
  const payload = `data: ${JSON.stringify({ type: 'job', job: _publicJob(job) })}\n\n`;
  // One worker is enough; the first connected one takes it
  const worker = _workers.values().next().value;
  if (worker) worker.write(payload);
}

/** Queues a render of the user's saved transition. Throws NO_WORKER if no host renderer is connected. */
function requestRender(username, format, orientation) {
  _pruneJobs();
  if (_workers.size === 0) {
    const err = new Error('No render worker connected');
    err.code = 'NO_WORKER';
    throw err;
  }
  const job = {
    id:        Date.now().toString(36) + '-' + (++_jobSeq),
    username:  sanitizeUsername(username),
    format:    VALID_FORMATS.has(format) ? format : 'webm',
    orientation: VALID_ORIENTATIONS.has(orientation) ? orientation : 'horizontal',
    status:    'queued',
    error:     null,
    file:      null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  _jobs.set(job.id, job);
  _dispatch(job);
  return _publicJob(job);
}

function getJob(id) {
  const job = _jobs.get(String(id));
  return job ? _publicJob(job) : null;
}

/** Called by the worker: status = rendering | done | error. */
function updateJob(id, { status, file, error }) {
  const job = _jobs.get(String(id));
  if (!job) return null;
  if (['rendering', 'done', 'error'].includes(status)) job.status = status;
  // Only accept a plain file name produced for this user
  if (typeof file === 'string' && path.basename(file) === file && file.startsWith(job.username + '-')) job.file = file;
  if (typeof error === 'string') job.error = error.slice(0, 500);
  job.updatedAt = Date.now();
  return _publicJob(job);
}

function registerWorker(res) {
  _workers.add(res);
  // Hand over anything queued while no worker was around
  for (const job of _jobs.values()) {
    if (job.status === 'queued') res.write(`data: ${JSON.stringify({ type: 'job', job: _publicJob(job) })}\n\n`);
  }
}

function unregisterWorker(res) {
  _workers.delete(res);
}

function workerCount() {
  return _workers.size;
}

function play(username) {
  username = sanitizeUsername(username);
  const listeners = broadcast(username, { type: 'play', at: Date.now() });
  return { username, played: true, listeners };
}

function registerSseClient(username, res) {
  if (!_sseClients.has(username)) _sseClients.set(username, new Set());
  _sseClients.get(username).add(res);
}

function unregisterSseClient(username, res) {
  const group = _sseClients.get(username);
  if (!group) return;
  group.delete(res);
  if (group.size === 0) _sseClients.delete(username);
}

function broadcast(username, message) {
  const group = _sseClients.get(username);
  if (!group) return 0;
  const payload = JSON.stringify(message);
  for (const client of group) client.write(`data: ${payload}\n\n`);
  return group.size;
}

module.exports = {
  VIDEO_DIR,
  sanitizeUsername,
  getSettings,
  saveSettings,
  saveLogo,
  getLogoPath,
  saveSound,
  getSoundPath,
  listVideos,
  deleteVideo,
  play,
  requestRender,
  getJob,
  updateJob,
  registerWorker,
  unregisterWorker,
  workerCount,
  registerSseClient,
  unregisterSseClient,
};
