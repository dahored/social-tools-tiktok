'use strict';

/**
 * YouTube live chat — read-only, no login, no API key. Unofficial: uses the
 * same internal endpoint as youtube.com/live_chat, so it can break if YouTube
 * changes it.
 *   1. resolve the live video (accepts @handle, channel URL, watch URL or video id)
 *   2. load youtube.com/live_chat?v=… → API key, client version, "Live chat" continuation
 *   3. poll youtubei/v1/live_chat/get_live_chat with the returned continuation
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };
const OFFLINE_RETRY_MS = 60000;

/** Extracts the JSON object assigned right after `marker` in an HTML page. */
function extractJson(html, marker) {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.indexOf('{', at);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  return null;
}

async function getText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`);
  return res.text();
}

/** Returns the live video id for the input, or null when the channel isn't live. */
async function resolveVideoId(input) {
  const raw = String(input).trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  const fromUrl = /(?:v=|youtu\.be\/|\/live\/)([\w-]{11})/.exec(raw);
  if (fromUrl) return fromUrl[1];

  let base;
  if (/^https?:\/\//i.test(raw)) base = raw.replace(/\/+$/, '').replace(/\/(live|streams|featured|videos)$/, '');
  else if (raw.startsWith('UC')) base = `https://www.youtube.com/channel/${raw}`;
  else base = `https://www.youtube.com/@${raw.replace(/^@/, '')}`;

  const html = await getText(`${base}/live`);
  const canonical = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(html);
  if (!canonical) return null;
  if (!/"isLiveNow":true|"isLive":true/.test(html)) return null;
  return canonical[1];
}

function textOf(runs = []) {
  return runs.map((r) => r.text || '').join('');
}

function toParts(runs = []) {
  return runs.map((r) => {
    if (r.text !== undefined) return { type: 'text', text: r.text };
    if (r.emoji) {
      if (!r.emoji.isCustomEmoji && r.emoji.emojiId) return { type: 'text', text: r.emoji.emojiId };
      const thumbs = (r.emoji.image && r.emoji.image.thumbnails) || [];
      const thumb = thumbs[thumbs.length - 1];
      return thumb
        ? { type: 'emote', url: thumb.url, name: (r.emoji.shortcuts && r.emoji.shortcuts[0]) || '' }
        : { type: 'text', text: '' };
    }
    return { type: 'text', text: '' };
  });
}

function rolesFrom(badges = []) {
  const roles = [];
  for (const b of badges) {
    const r = b.liveChatAuthorBadgeRenderer || {};
    const icon = r.icon && r.icon.iconType;
    if (icon === 'OWNER') roles.push('broadcaster');
    else if (icon === 'MODERATOR') roles.push('moderator');
    else if (r.customThumbnail) roles.push('subscriber'); // channel member
  }
  return roles;
}

/** "$5.00" / "MX$100.00" / "€2,00" → 5 / 100 / 2 (for minimum-amount filters). */
function amountValue(display) {
  const n = String(display || '').replace(/[^0-9.,]/g, '');
  const normalized = /,\d{2}$/.test(n) ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
  return Number(normalized) || 0;
}

function lastThumb(image) {
  const thumbs = (image && image.thumbnails) || [];
  return thumbs.length ? thumbs[thumbs.length - 1].url : null;
}

function createYoutubeConnector({ channel, onMessage, onDelete, onStatus, onEvent = () => {} }) {
  let stopped = false;
  let timer = null;

  const wait = (ms) => new Promise((resolve) => { timer = setTimeout(resolve, ms); });

  async function run() {
    while (!stopped) {
      try {
        onStatus('connecting');
        const videoId = await resolveVideoId(channel);
        if (!videoId) {
          onStatus('offline', 'El canal no está en vivo');
          await wait(OFFLINE_RETRY_MS);
          continue;
        }

        const html = await getText(`https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`);
        const apiKey = (/"INNERTUBE_API_KEY":"([^"]+)"/.exec(html) || [])[1];
        const clientVersion = (/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html) || [])[1] || '2.20250101.00.00';
        const data = extractJson(html, 'ytInitialData');
        const renderer = data && data.contents && data.contents.liveChatRenderer;
        if (!renderer) {
          onStatus('offline', 'Chat no disponible');
          await wait(OFFLINE_RETRY_MS);
          continue;
        }
        // Prefer "Live chat" (every message) over the default "Top chat"
        const menu = (((renderer.header || {}).liveChatHeaderRenderer || {}).viewSelector || {}).sortFilterSubMenuRenderer;
        const liveItem = menu && menu.subMenuItems && menu.subMenuItems[menu.subMenuItems.length - 1];
        let continuation = (liveItem && liveItem.continuation.reloadContinuationData.continuation) ||
          Object.values(renderer.continuations[0])[0].continuation;

        onStatus('connected');
        let first = true;
        while (!stopped && continuation) {
          const res = await fetch(
            `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false${apiKey ? `&key=${apiKey}` : ''}`,
            {
              method: 'POST',
              headers: { ...HEADERS, 'Content-Type': 'application/json' },
              body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion } }, continuation }),
            }
          );
          if (!res.ok) throw new Error(`YouTube chat HTTP ${res.status}`);
          const body = await res.json();
          const lc = body.continuationContents && body.continuationContents.liveChatContinuation;
          if (!lc || !lc.continuations) break; // stream ended

          // The first page is the backlog — skip it so the overlay doesn't flood
          if (!first) handleActions(lc.actions || []);
          first = false;

          const next = Object.values(lc.continuations[0])[0];
          continuation = next.continuation;
          await wait(Math.min(Math.max(next.timeoutMs || 2000, 1000), 8000));
        }
        if (!stopped) {
          onStatus('offline', 'La transmisión terminó');
          await wait(OFFLINE_RETRY_MS);
        }
      } catch (err) {
        if (stopped) return;
        onStatus('error', err.message);
        await wait(15000);
      }
    }
  }

  /** Super Chats, Super Stickers, memberships and gifted memberships → alert events. */
  function handleAlertItem(item) {
    const paid = item.liveChatPaidMessageRenderer;
    const sticker = item.liveChatPaidStickerRenderer;
    const member = item.liveChatMembershipItemRenderer;
    const gifts = item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer;

    if (paid || sticker) {
      const r = paid || sticker;
      const display = textOf((r.purchaseAmountText || {}).runs) || (r.purchaseAmountText || {}).simpleText || '';
      onEvent({
        id: `yt-${r.id}`,
        type: 'donation',
        user: { name: (r.authorName && r.authorName.simpleText) || 'user', avatar: lastThumb(r.authorPhoto) },
        amount: { value: amountValue(display), unit: 'currency', display },
        item: sticker ? { name: 'Super Sticker', image: lastThumb(sticker.sticker) } : null,
        message: paid ? textOf((paid.message || {}).runs) : '',
      });
    } else if (member) {
      const header = textOf((member.headerPrimaryText || {}).runs); // "Member for 6 months" on milestones
      const months = Number((/(\d+)/.exec(header) || [])[1]) || 1;
      onEvent({
        id: `yt-${member.id}`,
        type: 'subscription',
        user: { name: (member.authorName && member.authorName.simpleText) || 'user', avatar: lastThumb(member.authorPhoto) },
        months,
        tier: 'Miembro',
        message: textOf((member.message || {}).runs),
      });
    } else if (gifts) {
      const h = (gifts.header && gifts.header.liveChatSponsorshipsHeaderRenderer) || {};
      const text = textOf((h.primaryText || {}).runs);
      onEvent({
        id: `yt-${gifts.id}`,
        type: 'gift_sub',
        user: { name: (h.authorName && h.authorName.simpleText) || 'user', avatar: lastThumb(h.authorPhoto) },
        count: Number((/(\d+)/.exec(text) || [])[1]) || 1,
      });
    }
  }

  function handleActions(actions) {
    for (const action of actions) {
      const item = action.addChatItemAction && action.addChatItemAction.item;
      if (item) handleAlertItem(item);
      if (item) {
        const r = item.liveChatTextMessageRenderer || item.liveChatPaidMessageRenderer;
        if (!r) continue;
        const parts = toParts((r.message && r.message.runs) || []);
        if (item.liveChatPaidMessageRenderer && r.purchaseAmountText) {
          parts.unshift({ type: 'text', text: `💸 ${textOf(r.purchaseAmountText.runs) || r.purchaseAmountText.simpleText} ` });
        }
        const photos = (r.authorPhoto && r.authorPhoto.thumbnails) || [];
        onMessage({
          id: r.id,
          author: {
            name: (r.authorName && r.authorName.simpleText) || 'user',
            color: null,
            roles: rolesFrom(r.authorBadges),
            avatar: photos.length ? photos[photos.length - 1].url : null,
          },
          parts,
          ts: Number(r.timestampUsec) / 1000 || Date.now(),
        });
      }
      const removed = action.markChatItemAsDeletedAction || action.removeChatItemAction;
      if (removed && removed.targetItemId) onDelete({ ids: [removed.targetItemId] });
    }
  }

  if (!String(channel).trim()) {
    onStatus('error', 'Canal vacío');
    return { stop() {} };
  }
  run();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

module.exports = { createYoutubeConnector, resolveVideoId };
