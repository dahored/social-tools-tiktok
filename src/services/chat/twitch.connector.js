'use strict';

/**
 * Twitch chat — read-only, no login.
 * Anonymous IRC over WebSocket (nick "justinfanNNNN"), with IRCv3 tags for
 * colours, roles and emote positions.
 */

const WebSocket = require('ws');

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const EMOTE_URL = (id) => `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;

function parseTags(raw) {
  const tags = {};
  for (const pair of raw.split(';')) {
    const i = pair.indexOf('=');
    tags[pair.slice(0, i)] = pair.slice(i + 1).replace(/\\s/g, ' ');
  }
  return tags;
}

/** Splits the message into text / emote parts using the `emotes` tag (code-point offsets). */
function toParts(text, emotesTag) {
  const chars = Array.from(text);
  const ranges = [];
  for (const group of (emotesTag || '').split('/').filter(Boolean)) {
    const [id, spans] = group.split(':');
    for (const span of spans.split(',')) {
      const [start, end] = span.split('-').map(Number);
      ranges.push({ id, start, end });
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  const parts = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) parts.push({ type: 'text', text: chars.slice(pos, r.start).join('') });
    parts.push({ type: 'emote', url: EMOTE_URL(r.id), name: chars.slice(r.start, r.end + 1).join('') });
    pos = r.end + 1;
  }
  if (pos < chars.length) parts.push({ type: 'text', text: chars.slice(pos).join('') });
  return parts;
}

function rolesFrom(badges) {
  const roles = [];
  if (/broadcaster\//.test(badges)) roles.push('broadcaster');
  if (/moderator\//.test(badges)) roles.push('moderator');
  if (/vip\//.test(badges)) roles.push('vip');
  if (/(subscriber|founder)\//.test(badges)) roles.push('subscriber');
  return roles;
}

const TIER_LABEL = { 1000: 'Tier 1', 2000: 'Tier 2', 3000: 'Tier 3', Prime: 'Prime' };

function createTwitchConnector({ channel, onMessage, onDelete, onStatus, onEvent = () => {} }) {
  const login = String(channel).trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').split(/[/?#]/)[0].toLowerCase();
  let ws = null;
  let stopped = false;
  let retry = 0;
  let retryTimer = null;

  function connect() {
    onStatus('connecting');
    ws = new WebSocket(IRC_URL);

    ws.on('open', () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);
      ws.send(`JOIN #${login}`);
    });

    ws.on('message', (data) => {
      for (const line of String(data).split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }

        const m = /^(?:@(\S+) )?:(\S+?)(?:!\S+)? (\S+)(?: #(\S+))?(?: :(.*))?$/.exec(line);
        if (!m) continue;
        const [, rawTags, , command, , trailing] = m;
        const tags = rawTags ? parseTags(rawTags) : {};

        if (command === 'ROOMSTATE') {
          retry = 0;
          onStatus('connected');
        } else if (command === 'PRIVMSG') {
          let text = trailing || '';
          // /me messages arrive wrapped in CTCP ACTION
          const action = /^\u0001ACTION (.*)\u0001$/.exec(text);
          if (action) text = action[1];
          const bits = Number(tags.bits) || 0;
          if (bits > 0) {
            onEvent({
              id: `bits-${tags.id}`,
              type: 'donation',
              user: { name: tags['display-name'] || tags.login || 'user' },
              amount: { value: bits, unit: 'bits', display: `${bits} bits` },
              message: text.replace(/\b[A-Za-z]+\d+\b/g, '').replace(/\s+/g, ' ').trim(), // drop "Cheer100" tokens
            });
          }
          onMessage({
            id: tags.id || `${Date.now()}-${Math.random()}`,
            author: {
              name: tags['display-name'] || tags.login || 'user',
              color: tags.color || null,
              roles: rolesFrom(tags.badges || ''),
            },
            parts: toParts(text, tags.emotes),
            ts: Number(tags['tmi-sent-ts']) || Date.now(),
          });
        } else if (command === 'USERNOTICE') {
          handleUserNotice(tags, trailing || '');
        } else if (command === 'CLEARMSG' && tags['target-msg-id']) {
          onDelete({ ids: [tags['target-msg-id']] });
        } else if (command === 'CLEARCHAT') {
          // ban/timeout of one user (trailing = login) or full clear
          onDelete(trailing ? { user: trailing } : { all: true });
        } else if (command === 'NOTICE' && /msg_channel_suspended|msg_banned/.test(tags['msg-id'] || '')) {
          onStatus('error', 'Canal no disponible');
        }
      }
    });

    ws.on('close', () => {
      if (stopped) return;
      onStatus('reconnecting');
      retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    });
    ws.on('error', () => { /* close follows */ });
  }

  /** Subs, resubs, gifted subs and raids. */
  function handleUserNotice(tags, text) {
    const kind = tags['msg-id'];
    const user = { name: tags['display-name'] || tags.login || 'user' };
    const id = `notice-${tags.id}`;
    if (kind === 'sub' || kind === 'resub') {
      onEvent({
        id, type: 'subscription', user,
        months: Number(tags['msg-param-cumulative-months']) || 1,
        tier: TIER_LABEL[tags['msg-param-sub-plan']] || null,
        message: text,
      });
    } else if (kind === 'submysterygift') {
      onEvent({ id, type: 'gift_sub', user, count: Number(tags['msg-param-mass-gift-count']) || 1 });
    } else if (kind === 'subgift' && !tags['msg-param-community-gift-id']) {
      // single direct gift (mystery-gift batches are announced once above)
      onEvent({ id, type: 'gift_sub', user, count: 1, recipient: tags['msg-param-recipient-display-name'] || null });
    } else if (kind === 'raid') {
      onEvent({
        id, type: 'raid',
        user: { name: tags['msg-param-displayName'] || user.name },
        count: Number(tags['msg-param-viewerCount']) || 0,
      });
    }
  }

  if (!login) {
    onStatus('error', 'Canal vacío');
    return { stop() {} };
  }
  connect();

  return {
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      if (ws) ws.terminate();
    },
  };
}

module.exports = { createTwitchConnector };
