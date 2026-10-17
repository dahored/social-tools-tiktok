'use strict';

/**
 * Facebook Page live comments — official Graph API with the Page token saved by
 * "Conectar Facebook". Finds the Page's current live video, then polls its
 * comments. Personal-profile lives aren't available through the API.
 */

const fbAuth = require('../facebook-auth.service');
const repo   = require('../../repositories/facebook-auth.repository');

const POLL_MS          = 3000;
const LIVE_CHECK_MS    = 30 * 1000;
const OFFLINE_RETRY_MS = 30 * 1000;
const SEEN_LIMIT       = 2000;

function createFacebookConnector({ channel: pageId, username, onMessage, onStatus }) {
  let stopped = false;
  let timer = null;
  const wait = (ms) => new Promise((resolve) => { timer = setTimeout(resolve, ms); });

  /**
   * The current live is the newest Page video with live_status LIVE.
   * (/{page}/live_videos would need Meta's "live-video-api" review; /videos doesn't.)
   */
  async function findLiveVideo(token) {
    const res = await fbAuth.graph(`${pageId}/videos`, {
      access_token: token,
      fields: 'id,live_status',
      limit: '5',
    });
    const video = (res.data || []).find((v) => v.live_status === 'LIVE');
    return video ? video.id : null;
  }

  async function run() {
    while (!stopped) {
      try {
        onStatus('connecting');
        const token = await repo.pageToken(username, pageId);
        if (!token) {
          onStatus('error', 'Conecta Facebook en el editor');
          await wait(OFFLINE_RETRY_MS);
          continue;
        }

        const videoId = await findLiveVideo(token);
        if (!videoId) {
          onStatus('offline', 'La Página no está en vivo');
          await wait(OFFLINE_RETRY_MS);
          continue;
        }

        onStatus('connected');
        const seen = new Set();
        let first = true;
        let lastLiveCheck = Date.now();

        while (!stopped) {
          const res = await fbAuth.graph(`${videoId}/comments`, {
            access_token: token,
            fields: 'id,message,created_time,from{id,name}',
            filter: 'stream',
            order: 'reverse_chronological',
            live_filter: 'no_filter',
            limit: '50',
          });
          const fresh = (res.data || []).filter((c) => !seen.has(c.id)).reverse(); // oldest first
          for (const c of fresh) {
            seen.add(c.id);
            // The first page is the backlog — skip it so the overlay doesn't flood
            if (first || !c.message) continue;
            onMessage({
              id: c.id,
              author: {
                // Facebook may hide commenter identity depending on app access level
                name: (c.from && c.from.name) || 'Usuario de Facebook',
                color: null,
                roles: c.from && c.from.id === pageId ? ['broadcaster'] : [],
              },
              parts: [{ type: 'text', text: c.message }],
              ts: Date.parse(c.created_time) || Date.now(),
            });
          }
          first = false;
          if (seen.size > SEEN_LIMIT) {
            const keep = Array.from(seen).slice(-SEEN_LIMIT / 2);
            seen.clear();
            keep.forEach((id) => seen.add(id));
          }

          if (Date.now() - lastLiveCheck > LIVE_CHECK_MS) {
            lastLiveCheck = Date.now();
            if (!(await findLiveVideo(token))) break; // stream ended
          }
          await wait(POLL_MS);
        }
        if (!stopped) {
          onStatus('offline', 'La transmisión terminó');
          await wait(OFFLINE_RETRY_MS);
        }
      } catch (err) {
        if (stopped) return;
        // 190 = expired/revoked token
        onStatus('error', err.code === 190 ? 'Permiso vencido: reconecta Facebook' : String(err.message).slice(0, 140));
        await wait(err.code === 190 ? 5 * 60 * 1000 : 15000);
      }
    }
  }

  if (!pageId) {
    onStatus('error', 'Conecta Facebook en el editor');
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

module.exports = { createFacebookConnector };
