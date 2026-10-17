'use strict';

/**
 * Kick chat — read-only, no login. Unofficial: mirrors what kick.com's web
 * client does, so it can break if Kick changes it.
 *   1. GET  kick.com/api/v2/channels/:slug            → chatroom id
 *   2. POST web.kick.com/api/v1/realtime/connection   → websocket URL (Centrifugo)
 *   3. POST web.kick.com/api/v1/realtime/auth/connection → guest token (~45 min)
 *   4. connect + subscribe "chatrooms.<id>.v2", reconnect before the token expires
 */

const crypto    = require('crypto');
const WebSocket = require('ws');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://kick.com', Referer: 'https://kick.com/' };
const FALLBACK_WS = 'wss://realtime.us-east-1.platform.kick.com/connection/websocket';
const EMOTE_RE = /\[emote:(\d+):([^\]]+)\]/g;

async function kickJson(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { ...HEADERS, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${new URL(url).pathname} → HTTP ${res.status}`);
  return res.json();
}

function toParts(content) {
  const parts = [];
  let last = 0;
  for (const m of content.matchAll(EMOTE_RE)) {
    if (m.index > last) parts.push({ type: 'text', text: content.slice(last, m.index) });
    parts.push({ type: 'emote', url: `https://files.kick.com/emotes/${m[1]}/fullsize`, name: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: 'text', text: content.slice(last) });
  return parts;
}

function rolesFrom(badges = []) {
  const types = badges.map((b) => b.type);
  const roles = [];
  if (types.includes('broadcaster')) roles.push('broadcaster');
  if (types.includes('moderator')) roles.push('moderator');
  if (types.includes('vip') || types.includes('og')) roles.push('vip');
  if (types.includes('subscriber') || types.includes('founder')) roles.push('subscriber');
  return roles;
}

function createKickConnector({ channel, onMessage, onDelete, onStatus }) {
  const slug = String(channel).trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?kick\.com\//i, '').split(/[/?#]/)[0].toLowerCase();
  let ws = null;
  let stopped = false;
  let retry = 0;
  let timer = null;
  let chatroomId = null;

  function scheduleReconnect(ms) {
    clearTimeout(timer);
    timer = setTimeout(connect, ms);
  }

  async function connect() {
    if (stopped) return;
    onStatus('connecting');
    try {
      if (!chatroomId) {
        const ch = await kickJson(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`);
        chatroomId = ch.chatroom && ch.chatroom.id;
        if (!chatroomId) throw new Error('Canal no encontrado');
      }
      const clientId = crypto.randomUUID();
      let url = FALLBACK_WS;
      try {
        const neg = await kickJson('https://web.kick.com/api/v1/realtime/connection', {
          client: { id: clientId, type: 'web' },
          capabilities: { accepted_providers: [{ provider: 'centrifugo' }] },
        });
        const conn = (neg.data.connections || []).find((c) => c.provider === 'centrifugo');
        if (conn) url = conn.credentials.url;
      } catch { /* fall back to the known URL */ }
      const auth = await kickJson('https://web.kick.com/api/v1/realtime/auth/connection', { client_id: clientId });
      const token = auth.data && auth.data.token;
      if (stopped) return;

      ws = new WebSocket(url, { headers: { 'User-Agent': UA, Origin: 'https://kick.com' } });
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, connect: { token, name: 'js' } })));
      ws.on('message', (data) => {
        for (const line of String(data).split('\n')) {
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }

          if (Object.keys(msg).length === 0) { ws.send('{}'); continue; } // ping → pong
          if (msg.id === 1 && msg.connect) {
            ws.send(JSON.stringify({ id: 2, subscribe: { channel: `chatrooms.${chatroomId}.v2` } }));
            // guest token expires: reconnect a minute early with a fresh one
            if (msg.connect.ttl) scheduleReconnect(Math.max(60, msg.connect.ttl - 60) * 1000);
          } else if (msg.id === 2) {
            retry = 0;
            onStatus(msg.error ? 'error' : 'connected', msg.error && msg.error.message);
          } else if (msg.push && msg.push.pub) {
            handleEvent(msg.push.pub.data);
          }
        }
      });
      ws.on('close', () => {
        if (stopped) return;
        onStatus('reconnecting');
        scheduleReconnect(Math.min(30000, 1000 * 2 ** retry++));
      });
      ws.on('error', () => { /* close follows */ });
    } catch (err) {
      onStatus('error', err.message);
      scheduleReconnect(Math.min(60000, 5000 * 2 ** retry++));
    }
  }

  function handleEvent(evt) {
    if (!evt || !evt.event) return;
    let data = evt.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (evt.event === 'App\\Events\\ChatMessageEvent') {
      const sender = data.sender || {};
      onMessage({
        id: data.id,
        author: {
          name: sender.username || 'user',
          color: (sender.identity && sender.identity.color) || null,
          roles: rolesFrom(sender.identity && sender.identity.badges),
        },
        parts: toParts(String(data.content || '')),
        ts: Date.parse(data.created_at) || Date.now(),
      });
    } else if (evt.event === 'App\\Events\\MessageDeletedEvent' && data.message) {
      onDelete({ ids: [data.message.id] });
    } else if (evt.event === 'App\\Events\\UserBannedEvent' && data.user) {
      onDelete({ user: data.user.username });
    } else if (evt.event === 'App\\Events\\ChatroomClearEvent') {
      onDelete({ all: true });
    }
  }

  if (!slug) {
    onStatus('error', 'Canal vacío');
    return { stop() {} };
  }
  connect();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      if (ws) ws.terminate();
    },
  };
}

module.exports = { createKickConnector };
