'use strict';

/**
 * StreamElements "Astro" websocket for one SE channel (its JWT). Used only for
 * what the native connectors can't read: X (chat + events), tips and Twitch
 * follows. Everything else is skipped to avoid duplicate alerts.
 * Docs: https://docs.streamelements.com/websockets
 */

const crypto    = require('crypto');
const WebSocket = require('ws');

const URL_ASTRO = 'wss://astro.streamelements.com/';
// Platforms we already read directly (chat + their own events)
const NATIVE = new Set(['twitch', 'youtube', 'kick', 'tiktok']);

function money(amount, currency) {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value} ${currency || ''}`.trim();
  }
}

/** activity → alert event (or null to skip). */
function toAlert(act) {
  const provider = String(act.provider || '').toLowerCase();
  const type = act.type;
  const d = act.data || {};
  const wanted = !NATIVE.has(provider) || type === 'tip' || (provider === 'twitch' && (type === 'follow' || type === 'follower'));
  if (!wanted) return null;

  const user = { name: d.displayName || d.username || d.sender || 'Anónimo', avatar: d.avatar || null };
  const base = { id: act._id || act.activityId || crypto.randomUUID(), platform: provider === 'streamelements' ? 'streamelements' : provider, user };
  switch (type) {
    case 'follow':
    case 'follower':
      return { ...base, type: 'follow' };
    case 'tip':
    case 'superchat':
    case 'charityCampaignDonation': {
      const display = money(d.amount, d.currency);
      return { ...base, type: 'donation', amount: { value: Number(d.amount) || 0, unit: 'currency', display }, message: d.message || '' };
    }
    case 'cheer':
      return { ...base, type: 'donation', amount: { value: Number(d.amount) || 0, unit: 'bits', display: `${d.amount} bits` }, message: d.message || '' };
    case 'stars':
      return { ...base, type: 'donation', amount: { value: Number(d.amount) || 0, unit: 'stars', display: `${d.amount} ⭐` }, message: d.message || '' };
    case 'subscriber':
      if (d.gifted && d.sender) return { ...base, type: 'gift_sub', user: { name: d.sender }, count: 1, recipient: user.name };
      return { ...base, type: 'subscription', months: Number(d.amount) || 1, tier: d.tier || null, message: d.message || '' };
    case 'communityGiftPurchase':
      return { ...base, type: 'gift_sub', count: Number(d.amount) || 1 };
    case 'sponsor':
    case 'sponsorship':
    case 'fan':
    case 'supporter':
      return { ...base, type: 'subscription', months: Number(d.amount) || 1, tier: d.tier || null, message: d.message || '' };
    case 'raid':
    case 'host':
      return { ...base, type: 'raid', count: Number(d.amount) || 0 };
    case 'share':
      return { ...base, type: 'share' };
    default:
      return null;
  }
}

/** Best effort for chat payloads (documented for Twitch/YouTube/Kick, not yet for X). */
function toMessage(data) {
  const text =
    (data.message && (data.message.text || (typeof data.message === 'string' && data.message))) ||
    data.content || data.text || (data.snippet && data.snippet.displayMessage) || '';
  const name =
    data.chatter_user_name || (data.sender && (data.sender.username || data.sender.name)) ||
    (data.author && (data.author.displayName || data.author.name || data.author.username)) ||
    (data.user && (data.user.displayName || data.user.name || data.user.username)) ||
    (data.authorDetails && data.authorDetails.displayName) || data.displayName || data.username || '';
  if (!text || !name) return null;
  return {
    id: data.message_id || data.id || crypto.randomUUID(),
    author: { name, color: data.color || null, roles: [] },
    parts: [{ type: 'text', text: String(text) }],
    ts: Date.now(),
  };
}

function createStreamElementsConnector({ channel, onMessage, onEvent, onStatus }) {
  const { token, id: room } = channel;
  const provider = String(channel.provider || '').toLowerCase();
  let ws = null;
  let stopped = false;
  let retry = 0;
  let timer = null;
  let reconnectToken = null;
  let loggedChat = false;

  function connect() {
    if (stopped) return;
    onStatus('connecting');
    ws = new WebSocket(reconnectToken ? `${URL_ASTRO}?reconnect_token=${encodeURIComponent(reconnectToken)}` : URL_ASTRO);
    const resumed = Boolean(reconnectToken);
    reconnectToken = null;

    const subscribe = (topic, nonce) =>
      ws.send(JSON.stringify({ type: 'subscribe', nonce, data: { topic, room, token, token_type: 'jwt' } }));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }

      if (msg.type === 'welcome') {
        if (resumed) { retry = 0; onStatus('connected'); return; } // server restores subscriptions
        subscribe('channel.activities', 'activities');
        if (!NATIVE.has(provider)) subscribe('channel.chat.message', 'chat');
      } else if (msg.type === 'response') {
        if (msg.error) onStatus('error', `StreamElements: ${(msg.data && msg.data.message) || msg.error}`);
        else if (msg.nonce === 'activities') { retry = 0; onStatus('connected'); }
      } else if (msg.type === 'reconnect') {
        reconnectToken = msg.data && msg.data.reconnect_token;
      } else if (msg.type === 'message' && msg.topic === 'channel.activities') {
        const alert = toAlert(msg.data || {});
        if (alert) onEvent(alert);
      } else if (msg.type === 'message' && msg.topic === 'channel.chat.message') {
        const m = toMessage(msg.data || {});
        if (m) onMessage(m);
        else if (!loggedChat) {
          loggedChat = true; // help map X chat, whose payload isn't documented yet
          console.log(`[streamelements] unparsed ${provider} chat payload keys: ${Object.keys(msg.data || {}).join(',')}`);
        }
      }
    });

    ws.on('close', () => {
      if (stopped) return;
      onStatus('reconnecting');
      timer = setTimeout(connect, reconnectToken ? 200 : Math.min(30000, 1000 * 2 ** retry++));
    });
    ws.on('error', () => { /* close follows */ });
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

module.exports = { createStreamElementsConnector, toAlert, toMessage };
