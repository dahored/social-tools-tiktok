'use strict';

/* ── Platform config ────────────────────────────────────────── */
var PLATFORMS = {
  twitch: {
    name: 'Twitch',
    color: '#9146FF',
    icon: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714v9.429z"/></svg>',
  },
  youtube: {
    name: 'YouTube',
    color: '#FF0000',
    icon: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>',
  },
  tiktok: {
    name: 'TikTok',
    color: '#010101',
    icon: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z"/></svg>',
  },
  facebook: {
    name: 'Facebook',
    color: '#1877F2',
    icon: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
  },
  kick: {
    name: 'Kick',
    color: '#53FC18',
    textColor: '#000000',
    icon: '<svg viewBox="0 0 24 24" fill="black" xmlns="http://www.w3.org/2000/svg"><path d="M3 2h4v8l7-8h5L11 11l8 10h-5L7 13v8H3V2z"/></svg>',
  },
  twitter: {
    name: 'X / Twitter',
    color: '#000000',
    icon: '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  },
};

var HEART_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/></svg>';

/* ── State ──────────────────────────────────────────────────── */
var state = {
  username:     'default',
  accounts:     [],
  interval:     5,
  animation:    'slide',
  borderRadius: 24,
  cardWidth:    480,
};

var currentIndex = 0;
var rotTimer     = null;
var ANIM_MS      = 320;

/* ── Helpers ────────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(text) {
  var el = document.getElementById('status');
  if (el) el.textContent = text;
}

function isPreviewMode() {
  return new URLSearchParams(window.location.search).get('preview') === 'true';
}

/* ── Card rendering ─────────────────────────────────────────── */
function updateCardDOM(account) {
  var card = document.getElementById('social-card');
  if (!card) return;

  if (!account) {
    card.innerHTML = '<div class="card-empty">No accounts configured yet</div>';
    return;
  }

  var p = PLATFORMS[account.platform];
  if (!p) return;

  var textColor = p.textColor || '#ffffff';
  card.style.borderRadius = state.borderRadius + 'px';
  card.style.width        = state.cardWidth + 'px';
  card.innerHTML =
    '<div class="card-platform-icon" style="background:' + p.color + '">' + p.icon + '</div>' +
    '<span class="card-handle">' + escapeHtml(account.handle) + '</span>' +
    '<span class="card-follow" style="background:' + p.color + ';color:' + textColor + '">' +
      HEART_SVG + 'Follow' +
    '</span>';
}

function showCard(account, animate) {
  var card = document.getElementById('social-card');
  if (!card) return;

  if (!animate || state.accounts.length <= 1) {
    updateCardDOM(account);
    return;
  }

  var anim = state.animation || 'slide';
  card.classList.add('sr-' + anim + '-out');

  setTimeout(function () {
    card.classList.remove('sr-' + anim + '-out');
    updateCardDOM(account);
    card.classList.add('sr-' + anim + '-in');
    setTimeout(function () {
      card.classList.remove('sr-' + anim + '-in');
    }, ANIM_MS);
  }, ANIM_MS);
}

/* ── Rotation ───────────────────────────────────────────────── */
function stopRotation() {
  if (rotTimer) { clearInterval(rotTimer); rotTimer = null; }
}

function startRotation() {
  stopRotation();
  if (!state.accounts.length) {
    updateCardDOM(null);
    return;
  }
  if (currentIndex >= state.accounts.length) currentIndex = 0;
  showCard(state.accounts[currentIndex], false);
  if (state.accounts.length <= 1) return;

  rotTimer = setInterval(function () {
    currentIndex = (currentIndex + 1) % state.accounts.length;
    showCard(state.accounts[currentIndex], true);
  }, state.interval * 1000);
}

/* ── Editor: accounts list ──────────────────────────────────── */
function renderAccountsList() {
  var list = document.getElementById('accountsList');
  if (!list) return;

  if (!state.accounts.length) {
    list.innerHTML = '<p class="accounts-empty">No accounts added yet.</p>';
    return;
  }

  list.innerHTML = state.accounts.map(function (acc, i) {
    var p = PLATFORMS[acc.platform] || {};
    return (
      '<div class="account-item">' +
        '<span class="acct-icon" style="background:' + (p.color || '#888') + '">' + (p.icon || '') + '</span>' +
        '<div class="acct-info">' +
          '<span class="acct-platform">' + escapeHtml(p.name || acc.platform) + '</span>' +
          '<span class="acct-handle">' + escapeHtml(acc.handle) + '</span>' +
        '</div>' +
        '<button class="acct-remove" data-index="' + i + '" title="Remove">✕</button>' +
      '</div>'
    );
  }).join('');

  list.querySelectorAll('.acct-remove').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var idx = parseInt(this.getAttribute('data-index'), 10);
      state.accounts.splice(idx, 1);
      if (currentIndex >= state.accounts.length) currentIndex = Math.max(0, state.accounts.length - 1);
      renderAccountsList();
      startRotation();
      await saveSettings();
    });
  });
}

/* ── Apply API response ─────────────────────────────────────── */
function applySettings(data) {
  state.username     = data.username  || state.username;
  state.accounts     = Array.isArray(data.accounts) ? data.accounts : [];
  state.interval     = Number(data.interval)  || 5;
  state.animation    = data.animation || 'slide';
  state.borderRadius = Number(data.borderRadius) ?? 24;
  state.cardWidth    = Number(data.cardWidth)    || 480;

  var usernameEl     = document.getElementById('username');
  var intervalEl     = document.getElementById('interval');
  var animationEl    = document.getElementById('animation');
  var borderRadiusEl = document.getElementById('borderRadius');
  var cardWidthEl    = document.getElementById('cardWidth');

  if (usernameEl)     usernameEl.value     = state.username;
  if (intervalEl)     intervalEl.value     = state.interval;
  if (animationEl)    animationEl.value    = state.animation;
  if (borderRadiusEl) borderRadiusEl.value = state.borderRadius;
  if (cardWidthEl)    cardWidthEl.value    = state.cardWidth;

  renderAccountsList();

  var urlEl = document.getElementById('widgetUrl');
  if (urlEl) {
    var url = new URL('/widgets/social-rotator/index.html', window.location.origin);
    url.searchParams.set('username', state.username);
    url.searchParams.set('preview', 'true');
    urlEl.value = url.toString();
  }
}

/* ── API calls ──────────────────────────────────────────────── */
async function loadSettings(username) {
  setStatus('Loading…');
  try {
    var res  = await fetch('/api/social-rotator?username=' + encodeURIComponent(username));
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    applySettings(data);
    currentIndex = 0;
    startRotation();
    setStatus('Loaded for @' + state.username);
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
}

async function saveSettings() {
  setStatus('Saving…');
  var intervalEl     = document.getElementById('interval');
  var animationEl    = document.getElementById('animation');
  var borderRadiusEl = document.getElementById('borderRadius');
  var cardWidthEl    = document.getElementById('cardWidth');
  try {
    var res = await fetch('/api/social-rotator/settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        username:     state.username,
        accounts:     state.accounts,
        interval:     parseInt(intervalEl     ? intervalEl.value     : state.interval,     10),
        animation:    animationEl    ? animationEl.value    : state.animation,
        borderRadius: parseInt(borderRadiusEl ? borderRadiusEl.value : state.borderRadius, 10),
        cardWidth:    parseInt(cardWidthEl    ? cardWidthEl.value    : state.cardWidth,    10),
      }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    applySettings(data);
    startRotation();
    setStatus('Saved for @' + state.username);
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
}

/* ── Copy helper ────────────────────────────────────────────── */
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  var t = document.createElement('textarea');
  t.value = text; t.style.position = 'fixed'; t.style.top = '-9999px';
  document.body.appendChild(t); t.focus(); t.select(); document.execCommand('copy');
  document.body.removeChild(t);
}

/* ── Init ───────────────────────────────────────────────────── */
(async function init() {
  var params   = new URLSearchParams(window.location.search);
  var username = (params.get('username') || 'default').trim() || 'default';

  if (isPreviewMode()) document.body.classList.add('preview-mode');

  await loadSettings(username);

  if (isPreviewMode()) return; // OBS — editor UI not needed

  /* ── Load user button ────── */
  var loadBtn = document.getElementById('loadUserBtn');
  if (loadBtn) {
    loadBtn.addEventListener('click', async function () {
      var el = document.getElementById('username');
      var u  = el ? el.value.trim() : 'default';
      state.username = u || 'default';
      currentIndex   = 0;
      await loadSettings(state.username);
    });
  }

  /* ── Add account ─────────── */
  var addBtn = document.getElementById('addAccountBtn');
  if (addBtn) {
    addBtn.addEventListener('click', async function () {
      var platformEl = document.getElementById('addPlatform');
      var handleEl   = document.getElementById('addHandle');
      var handle = handleEl ? handleEl.value.trim() : '';
      if (!handle) { setStatus('Enter a handle first.'); return; }
      state.accounts.push({ platform: platformEl.value, handle: handle });
      if (handleEl) handleEl.value = '';
      currentIndex = 0;
      renderAccountsList();
      startRotation();
      await saveSettings();
    });
  }

  /* ── Add on Enter key ────── */
  var handleInput = document.getElementById('addHandle');
  if (handleInput) {
    handleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addBtn && addBtn.click(); }
    });
  }

  /* ── Save button ─────────── */
  var saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);

  /* ── Copy URL button ─────── */
  var copyBtn = document.getElementById('copyUrlBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async function () {
      var urlEl = document.getElementById('widgetUrl');
      if (!urlEl) return;
      try { await copyText(urlEl.value); setStatus('URL copied!'); }
      catch { setStatus('Copy failed'); }
    });
  }

  window.addEventListener('beforeunload', stopRotation);
})();
