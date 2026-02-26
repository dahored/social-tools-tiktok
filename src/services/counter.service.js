'use strict';

const counterRepo = require('../repositories/counter.repository');

/** In-memory SSE client registry: Map<username, Set<Response>> */
const _sseClients = new Map();

function sanitizeUsername(input) {
  const raw = String(input || 'default').trim();
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
}

async function getCounter(username) {
  return counterRepo.getState(username);
}

async function applyAction(username, action) {
  const state = await counterRepo.updateState(username, (current) => {
    if (action === 'increase') return { ...current, count: current.count + 1 };
    if (action === 'decrease') return { ...current, count: Math.max(0, current.count - 1) };
    if (action === 'reset')    return { ...current, count: 0 };
    return current;
  });
  broadcastState(username, state);
  return state;
}

async function updateSettings(username, dto) {
  const { FONT_TYPES } = counterRepo;

  const state = await counterRepo.updateState(username, (current) => {
    const next = { ...current };

    if (typeof dto.label === 'string') {
      const v = dto.label.trim();
      if (v) next.label = v.slice(0, 60);
    }
    if (typeof dto.countColor === 'string') next.countColor = dto.countColor;
    if (typeof dto.labelColor === 'string') next.labelColor = dto.labelColor;
    if (typeof dto.fontType   === 'string' && FONT_TYPES.has(dto.fontType)) next.fontType = dto.fontType;

    const toNum = (v, def, min, max) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    };
    const toBool = (v, def) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        const n = v.trim().toLowerCase();
        if (n === 'true'  || n === '1') return true;
        if (n === 'false' || n === '0') return false;
      }
      return def;
    };

    if (dto.letterSpacing   !== undefined) next.letterSpacing   = toNum(dto.letterSpacing,   next.letterSpacing,  -10, 60);
    if (dto.wordSpacing     !== undefined) next.wordSpacing     = toNum(dto.wordSpacing,     next.wordSpacing,    -20, 120);
    if (dto.countFontSize   !== undefined) next.countFontSize   = toNum(dto.countFontSize,   next.countFontSize,   20, 320);
    if (dto.labelFontSize   !== undefined) next.labelFontSize   = toNum(dto.labelFontSize,   next.labelFontSize,   12, 220);
    if (dto.countTextShadow !== undefined) next.countTextShadow = toBool(dto.countTextShadow, next.countTextShadow);
    if (dto.labelTextShadow !== undefined) next.labelTextShadow = toBool(dto.labelTextShadow, next.labelTextShadow);

    return next;
  });

  broadcastState(username, state);
  return state;
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

function broadcastState(username, state) {
  const group = _sseClients.get(username);
  if (!group) return;
  const payload = JSON.stringify({ username, ...state });
  for (const client of group) {
    client.write(`data: ${payload}\n\n`);
  }
}

module.exports = {
  sanitizeUsername,
  getCounter,
  applyAction,
  updateSettings,
  registerSseClient,
  unregisterSseClient,
  broadcastState,
};
