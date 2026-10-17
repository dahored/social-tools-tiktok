'use strict';

/**
 * "Conectar Facebook": OAuth with the streamer's own Meta app, then keeps the
 * Page access tokens (derived from a long-lived user token, so they don't expire).
 *
 * .env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
 *       FACEBOOK_CONFIG_ID   (apps using "Facebook Login for Business": the login
 *                             configuration that lists the permissions; replaces `scope`)
 *       FACEBOOK_GRAPH_VERSION (default v26.0), PUBLIC_URL (optional, for the redirect URI)
 */

const crypto = require('crypto');
const env    = require('../config/env');
const repo   = require('../repositories/facebook-auth.repository');

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v26.0';
const GRAPH = process.env.FACEBOOK_GRAPH_BASE || `https://graph.facebook.com/${GRAPH_VERSION}`;
const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content'];
const STATE_TTL_MS = 10 * 60 * 1000;

function isConfigured() {
  return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

function redirectUri(origin) {
  return `${(process.env.PUBLIC_URL || origin).replace(/\/$/, '')}/api/chat-overlay/facebook/callback`;
}

/** Calls the Graph API; throws with Facebook's own message on errors. */
async function graph(pathAndQuery, params = {}) {
  const url = new URL(`${GRAPH}/${pathAndQuery.replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const err = new Error((body.error && body.error.message) || `Graph HTTP ${res.status}`);
    err.code = body.error && body.error.code;
    throw err;
  }
  return body;
}

/* ── signed OAuth state (username + expiry), so the callback can't be forged ── */

function sign(payload) {
  return crypto.createHmac('sha256', env.jwtSecret).update(payload).digest('base64url');
}

function makeState(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, e: Date.now() + STATE_TTL_MS, n: crypto.randomUUID() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return data.e > Date.now() ? data.u : null;
}

/* ── flow ───────────────────────────────────────────────────────────────── */

function loginUrl(username, origin) {
  if (!isConfigured()) throw new Error('Facebook no está configurado (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)');
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.FACEBOOK_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri(origin));
  url.searchParams.set('state', makeState(username));
  // Facebook Login for Business takes a configuration id instead of a scope list
  if (process.env.FACEBOOK_CONFIG_ID) url.searchParams.set('config_id', process.env.FACEBOOK_CONFIG_ID);
  else url.searchParams.set('scope', SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

/** Exchanges the OAuth code and stores the user's pages. Returns { username, pages }. */
async function handleCallback({ code, state, origin }) {
  const username = readState(state);
  if (!username) throw new Error('La sesión de conexión expiró, inténtalo de nuevo');

  const short = await graph('oauth/access_token', {
    client_id: process.env.FACEBOOK_APP_ID,
    client_secret: process.env.FACEBOOK_APP_SECRET,
    redirect_uri: redirectUri(origin),
    code,
  });
  // Long-lived user token → Page tokens derived from it don't expire
  const long = await graph('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.FACEBOOK_APP_ID,
    client_secret: process.env.FACEBOOK_APP_SECRET,
    fb_exchange_token: short.access_token,
  });
  const accounts = await graph('me/accounts', { access_token: long.access_token, fields: 'id,name,access_token', limit: '100' });
  let pages = (accounts.data || []).map((p) => ({ id: p.id, name: p.name, token: p.access_token }));
  // Facebook Login for Business: the selected Pages come as granular scopes, not in /me/accounts
  if (!pages.length) pages = await pagesFromGranularScopes(long.access_token);
  if (!pages.length) {
    const why = await diagnoseNoPages(long.access_token);
    console.warn('[facebook] /me/accounts returned no pages:', JSON.stringify(why));
    const missing = why.declined.length ? ` Permisos rechazados: ${why.declined.join(', ')}.` : '';
    const business = why.businesses > 0
      ? ' Tu cuenta tiene un portfolio comercial: si la Página está ahí, agrega el permiso business_management a la configuración.'
      : '';
    throw new Error(`Facebook no devolvió ninguna Página.${missing}${business}`);
  }

  const previous = await repo.get(username);
  const keep = previous && pages.some((p) => p.id === previous.pageId) ? previous.pageId : pages[0].id;
  await repo.save(username, { pages, pageId: keep, connectedAt: new Date().toISOString() });
  return { username, pageId: keep };
}

/** Page ids granted through granular scopes → their Page tokens. */
async function pagesFromGranularScopes(userToken) {
  const info = await graph('debug_token', {
    input_token: userToken,
    access_token: `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`,
  });
  const ids = new Set();
  for (const s of (info.data && info.data.granular_scopes) || []) {
    if (s.scope && s.scope.startsWith('pages_')) (s.target_ids || []).forEach((id) => ids.add(String(id)));
  }
  const pages = [];
  for (const id of ids) {
    try {
      const p = await graph(id, { access_token: userToken, fields: 'id,name,access_token' });
      if (p.access_token) pages.push({ id: p.id, name: p.name, token: p.access_token });
    } catch (err) {
      console.warn(`[facebook] could not load page ${id}: ${err.message}`);
    }
  }
  console.log(`[facebook] granular scopes: ${ids.size} page id(s), ${pages.length} with token`);
  return pages;
}

/** Collects non-sensitive hints for an empty /me/accounts (permission names and counts only). */
async function diagnoseNoPages(userToken) {
  const out = { granted: [], declined: [], businesses: null };
  try {
    const perms = await graph('me/permissions', { access_token: userToken });
    for (const p of perms.data || []) (p.status === 'granted' ? out.granted : out.declined).push(p.permission);
  } catch (err) {
    out.permissionsError = err.message;
  }
  try {
    const biz = await graph('me/businesses', { access_token: userToken, fields: 'id', limit: '10' });
    out.businesses = (biz.data || []).length;
  } catch (err) {
    out.businessesError = err.message;
  }
  return out;
}

/** Public view for the editor — never includes tokens. */
async function status(username) {
  const record = await repo.get(username);
  return {
    configured: isConfigured(),
    connected: Boolean(record && record.pages && record.pages.length),
    pages: record ? record.pages.map((p) => ({ id: p.id, name: p.name })) : [],
    pageId: record ? record.pageId : null,
    connectedAt: record ? record.connectedAt : null,
  };
}

async function selectPage(username, pageId) {
  const record = await repo.get(username);
  if (!record || !record.pages.some((p) => p.id === pageId)) throw new Error('Página no encontrada');
  await repo.save(username, { pageId });
  return pageId;
}

async function disconnect(username) {
  await repo.remove(username);
}

module.exports = { isConfigured, graph, loginUrl, handleCallback, status, selectPage, disconnect, GRAPH };
