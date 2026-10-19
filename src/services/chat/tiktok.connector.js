'use strict';

/**
 * TikTok LIVE chat — read-only, no login. Unofficial and the most fragile:
 * uses tiktok-live-connector (reverse-engineered webcast push), which needs a
 * third-party signing service (Euler Stream). Without a key it uses Euler's
 * free, rate-limited tier; set TIKTOK_SIGN_API_KEY in .env for your own quota.
 */

const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const OFFLINE_RETRY_MS    = 60 * 1000;
const RATE_LIMIT_RETRY_MS = 2 * 60 * 1000;

function first(list) {
  return Array.isArray(list) && list.length ? list[0] : null;
}

function rolesFrom(identity = {}) {
  const roles = [];
  if (identity.isAnchor) roles.push('broadcaster');
  if (identity.isModeratorOfAnchor) roles.push('moderator');
  if (identity.isSubscriberOfAnchor) roles.push('subscriber');
  return roles;
}

/** Text with subscriber emotes spliced in at their positions (when TikTok sends them). */
function toParts(content, emotes = []) {
  const chars = Array.from(String(content || ''));
  const placed = (emotes || [])
    .map((e) => {
      const image = e.emote && e.emote.image;
      const url = image && (first(image.url) || first(image.urlList) || image.imageUrl);
      return url ? { at: Number(e.placeInComment) || 0, url, name: (e.emote && e.emote.emoteId) || '' } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);

  const parts = [];
  let pos = 0;
  for (const e of placed) {
    if (e.at > pos) parts.push({ type: 'text', text: chars.slice(pos, e.at).join('') });
    parts.push({ type: 'emote', url: e.url, name: e.name });
    pos = Math.max(pos, e.at);
  }
  if (pos < chars.length) parts.push({ type: 'text', text: chars.slice(pos).join('') });
  return parts;
}

const LIKE_STEP = 100;            // like progress is reported every 100 total likes
const SHARE_DEDUPE_MS = 60 * 1000; // one share alert per user per minute

function createTiktokConnector({ channel, onMessage, onStatus, onEvent = () => {} }) {
  const uniqueId = String(channel).trim()
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  let conn = null;
  let stopped = false;
  let retry = 0;
  let timer = null;

  function schedule(ms) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(connect, ms);
  }

  async function connect() {
    if (stopped) return;
    onStatus('connecting');
    conn = new TikTokLiveConnection(uniqueId, {
      processInitialData: false, // skip the backlog so the overlay doesn't flood
      signApiKey: process.env.TIKTOK_SIGN_API_KEY || undefined,
    });

    conn.on(WebcastEvent.CHAT, (d) => {
      const user = d.user || {};
      const avatar = user.avatarThumb && first(user.avatarThumb.urlList);
      onMessage({
        id: (d.common && d.common.msgId) || `${Date.now()}-${Math.random()}`,
        author: {
          name: user.nickname || user.displayId || 'user',
          color: null,
          roles: rolesFrom(d.userIdentity),
          avatar: avatar || null,
        },
        parts: toParts(d.content, d.emotes),
        ts: Number(d.common && d.common.createTime) || Date.now(),
      });
    });

    const userOf = (u = {}) => ({
      name: u.nickname || u.uniqueId || u.displayId || 'user',
      avatar: (u.avatarThumb && first(u.avatarThumb.urlList)) || (u.profilePicture && first(u.profilePicture.url)) || null,
    });
    const eventId = (d, kind) => `${kind}-${(d.common && d.common.msgId) || Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    conn.on(WebcastEvent.GIFT, (d) => {
      const details = d.giftDetails || {};
      // Streakable gifts (type 1) fire repeatedly; only the final event (repeatEnd) counts
      if (details.giftType === 1 && !d.repeatEnd) return;
      const count = Number(d.repeatCount) || 1;
      const diamonds = (Number(details.diamondCount) || 0) * count;
      onEvent({
        id: eventId(d, 'gift'),
        type: 'donation',
        user: userOf(d.user),
        amount: { value: diamonds, unit: 'diamonds', display: `${diamonds} 💎` },
        item: { name: details.giftName || 'Regalo', image: (details.giftImage && details.giftImage.giftPictureUrl) || null, count },
      });
    });

    const followed = new Set();
    conn.on(WebcastEvent.FOLLOW, (d) => {
      const user = userOf(d.user);
      if (followed.has(user.name)) return;
      followed.add(user.name);
      onEvent({ id: eventId(d, 'follow'), type: 'follow', user });
    });

    const lastShare = new Map();
    conn.on(WebcastEvent.SHARE, (d) => {
      const user = userOf(d.user);
      const now = Date.now();
      if (now - (lastShare.get(user.name) || 0) < SHARE_DEDUPE_MS) return;
      lastShare.set(user.name, now);
      onEvent({ id: eventId(d, 'share'), type: 'share', user });
    });

    let lastLikeStep = null;
    conn.on(WebcastEvent.LIKE, (d) => {
      const total = Number(d.totalLikeCount) || 0;
      const step = Math.floor(total / LIKE_STEP);
      if (lastLikeStep === null) { lastLikeStep = step; return; } // baseline on connect
      if (step <= lastLikeStep) return;
      const previous = lastLikeStep * LIKE_STEP;
      lastLikeStep = step;
      // The overlay decides which milestones to show (e.g. every 1,000)
      onEvent({ id: eventId(d, 'like'), type: 'like', user: userOf(d.user), count: total, previous });
    });

    conn.on(WebcastEvent.SUB_NOTIFY, (d) => {
      onEvent({ id: eventId(d, 'sub'), type: 'subscription', user: userOf(d.user), months: Number(d.subMonth) || 1 });
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      onStatus('offline', 'La transmisión terminó');
      schedule(OFFLINE_RETRY_MS);
    });

    conn.on(ControlEvent.DISCONNECTED, () => {
      if (stopped || timer) return;
      onStatus('reconnecting');
      schedule(Math.min(30000, 2000 * 2 ** retry++));
    });

    conn.on(ControlEvent.ERROR, () => { /* surfaced through connect() / disconnected */ });

    try {
      timer = null;
      await conn.connect();
      retry = 0;
      onStatus('connected');
    } catch (err) {
      if (stopped) return;
      const name = err && err.constructor && err.constructor.name;
      if (name === 'UserOfflineError') {
        onStatus('offline', 'La cuenta no está en vivo');
        schedule(OFFLINE_RETRY_MS);
      } else if (name === 'SignatureRateLimitError') {
        onStatus('error', 'Límite del servicio de firmas gratuito; reintentando');
        schedule(RATE_LIMIT_RETRY_MS);
      } else {
        onStatus('error', String((err && err.message) || err).slice(0, 140));
        schedule(Math.min(OFFLINE_RETRY_MS, 5000 * 2 ** retry++));
      }
    }
  }

  if (!uniqueId) {
    onStatus('error', 'Usuario vacío');
    return { stop() {} };
  }
  connect();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      try { if (conn) conn.disconnect(); } catch { /* already closed */ }
    },
  };
}

module.exports = { createTiktokConnector };
