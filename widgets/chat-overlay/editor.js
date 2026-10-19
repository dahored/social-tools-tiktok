'use strict';

var PLATFORMS = [
  { key: 'twitch',  placeholder: 'tu_usuario' },
  { key: 'kick',    placeholder: 'tu_usuario' },
  { key: 'youtube', placeholder: '@tuhandle o URL del directo' },
  { key: 'tiktok',  placeholder: '@tu_usuario' },
];
var STATE_LABEL = {
  off: 'Sin configurar', connecting: 'Conectando…', reconnecting: 'Reconectando…',
  connected: 'Conectado', offline: 'Sin directo', error: 'Error',
};

var state = { username: 'default', settings: null, pendingSound: null };
var previewSfx = new Audio();
var lastPreviewSound = 0;

function $(id) { return document.getElementById(id); }
function setStatus(text) { $('status').textContent = text; }

function normalizeUsername(raw) {
  return String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
}

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': 'Bearer ' + (localStorage.getItem('stt_token') || ''),
  };
}

function logoHtml(key) {
  var p = window.PLATFORM_ICONS[key];
  return '<span class="channel-logo" style="background:' + p.color + ';color:' + p.fg + '">' + p.svg + '</span>';
}

function buildChannelFields() {
  // Channels live in "Mis canales"; here we only show their live state
  $('channelFields').innerHTML = PLATFORMS.concat([{ key: 'facebook' }, { key: 'x' }]).map(function (pl) {
    var p = window.PLATFORM_ICONS[pl.key];
    return (
      '<div class="channel-row">' + logoHtml(pl.key) + '<span class="name">' + p.name + '</span>' +
        '<span class="channel-state" id="state-' + pl.key + '" data-state="off">' + STATE_LABEL.off + '</span>' +
      '</div>' +
      '<div class="channel-detail" id="detail-' + pl.key + '"></div>'
    );
  }).join('');

  $('testRow').innerHTML += PLATFORMS.concat([{ key: 'facebook' }]).map(function (pl) {
    return '<button type="button" class="btn-ghost btn-sm btn-test" data-test="' + pl.key + '">' +
      logoHtml(pl.key) + window.PLATFORM_ICONS[pl.key].name + '</button>';
  }).join('') + '<button type="button" class="btn-ghost btn-sm" id="clearBtn">Limpiar</button>';
}


function readForm() {
  var form = {
    style:       $('style').value,
    fontSize:    Number($('fontSize').value),
    maxMessages: Number($('maxMessages').value),
    hideAfter:   Number($('hideAfter').value),
    sound:         $('sound').value,
    soundVolume:   Number($('soundVolume').value),
    soundCooldown: Number($('soundCooldown').value),
  };
  return form;
}

function previewWindow() {
  var win = $('previewFrame').contentWindow;
  return win && typeof win.setChatSettings === 'function' ? win : null;
}

/** Pushes the (possibly unsaved) appearance to the preview iframe. */
function refreshPreview() {
  var win = previewWindow();
  if (!win) return;
  win.__editorOverrides = true;
  win.setChatSettings(readForm());
}

function applySettings(settings) {
  state.settings = settings;
  $('username').value    = state.username;
  $('style').value       = settings.style;
  $('fontSize').value    = settings.fontSize;
  $('maxMessages').value = settings.maxMessages;
  $('hideAfter').value   = settings.hideAfter;
  $('sound').value         = settings.sound || 'style';
  $('soundVolume').value   = settings.soundVolume;
  $('soundCooldown').value = settings.soundCooldown;
  $('soundFile').value     = '';
  state.pendingSound = null;
  renderSound();
  $('channelsLink').href = '/channels.html?username=' + encodeURIComponent(state.username);
  $('overlayUrl').value = new URL('/widgets/chat-overlay/overlay.html?username=' + encodeURIComponent(state.username), window.location.origin).toString();
  refreshPreview();
}

function setChannelState(platform, s, detail) {
  var el = $('state-' + platform);
  if (!el) return;
  el.setAttribute('data-state', s);
  el.textContent = STATE_LABEL[s] || s;
  $('detail-' + platform).textContent = detail || '';
}

/* ── Message sound ─────────────────────────────────────────────── */

function renderSound() {
  var mode = $('sound').value;
  $('soundVolumeValue').textContent = $('soundVolume').value;
  $('soundOptions').hidden = mode === 'off';
  $('customSoundFields').hidden = mode !== 'custom';
  $('soundInfo').textContent = state.pendingSound
    ? state.pendingSound.name + ' (sin subir)'
    : (state.settings && state.settings.soundFile ? 'Audio subido ✓' : 'Sin audio — sube un MP3, OGG, WAV o M4A corto');
}

/** URL for the (possibly unsaved) form, using the overlay's own rules. */
function previewSoundUrl() {
  var form = readForm();
  if (form.sound === 'custom' && state.pendingSound) return state.pendingSound.dataUrl;
  var win = previewWindow();
  if (!win || typeof win.chatSoundUrl !== 'function') return '';
  return win.chatSoundUrl(Object.assign({}, state.settings, form));
}

/** The editor plays the preview sound (it has the user's click; the iframe doesn't). */
function playPreviewSound(force) {
  var form = readForm();
  var url = previewSoundUrl();
  if (!url) return;
  var now = Date.now();
  if (!force && now - lastPreviewSound < form.soundCooldown * 1000) return;
  lastPreviewSound = now;
  previewSfx.src = url;
  previewSfx.volume = Math.min(1, Math.max(0, form.soundVolume / 100));
  previewSfx.currentTime = 0;
  previewSfx.play().catch(function () {});
}

/** Called by the preview iframe for every SSE event (statuses, messages…). */
window.onChatEvent = function (data) {
  if (data.type === 'message') playPreviewSound(false);
  if (data.type === 'snapshot') {
    PLATFORMS.concat([{ key: 'facebook' }, { key: 'x' }]).forEach(function (pl) {
      var st = data.statuses[pl.key];
      setChannelState(pl.key, st ? st.state : 'off', st && st.detail);
    });
  } else if (data.type === 'status') {
    setChannelState(data.platform, data.state, data.detail);
  }
};

async function api(path, options) {
  var res  = await fetch(path, options);
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

async function load() {
  setStatus('Loading…');
  try {
    applySettings(await api('/api/chat-overlay?username=' + encodeURIComponent(state.username)));
    setStatus('Loaded for @' + state.username);
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
}

async function save() {
  setStatus('Saving…');
  try {
    var settings = await api('/api/chat-overlay/settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(Object.assign({ username: state.username }, readForm())),
    });
    if (state.pendingSound) {
      var res = await fetch('/api/chat-overlay/sound', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ username: state.username, dataUrl: state.pendingSound.dataUrl }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 401) throw new Error('tu sesión expiró: inicia sesión de nuevo para subir el audio');
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      settings = data;
    }
    applySettings(settings);
    setStatus('Saved for @' + state.username);
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  var t = document.createElement('textarea');
  t.value = text; t.style.position = 'fixed'; t.style.top = '-9999px';
  document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
}

(function init() {
  var params = new URLSearchParams(window.location.search);
  state.username = normalizeUsername(params.get('username'));
  buildChannelFields();

  var frame = $('previewFrame');
  function frameSrc() {
    return '/widgets/chat-overlay/overlay.html?editor=true&username=' + encodeURIComponent(state.username);
  }
  frame.addEventListener('load', function () {
    if (state.settings) refreshPreview();
    else load();
  });
  frame.src = frameSrc();

  function switchUser(force) {
    var next = normalizeUsername($('username').value);
    if (force !== true && next === state.username) return;
    state.username = next;
    state.settings = null;
    frame.src = frameSrc();
  }
  $('loadUserBtn').addEventListener('click', function () { switchUser(true); });
  $('username').addEventListener('change', function () { switchUser(false); });

  ['style', 'fontSize', 'maxMessages', 'hideAfter'].forEach(function (id) {
    $(id).addEventListener('input', refreshPreview);
  });
  $('saveBtn').addEventListener('click', save);

  $('sound').addEventListener('change', renderSound);
  $('soundVolume').addEventListener('input', renderSound);
  $('soundTestBtn').addEventListener('click', function () { playPreviewSound(true); });
  $('soundFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setStatus('El audio debe pesar 2 MB o menos'); this.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      state.pendingSound = { dataUrl: reader.result, name: file.name };
      $('sound').value = 'custom';
      renderSound();
      setStatus('Audio listo — pulsa Guardar para subirlo');
    };
    reader.readAsDataURL(file);
  });


  $('testRow').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-test]');
    if (btn) {
      await fetch('/api/chat-overlay/test?username=' + encodeURIComponent(state.username) +
        '&platform=' + btn.getAttribute('data-test'), { method: 'POST' });
    } else if (e.target.id === 'clearBtn' && previewWindow()) {
      previewWindow().clearChat();
    }
  });

  $('copyUrlBtn').addEventListener('click', async function () {
    try { await copyText($('overlayUrl').value); setStatus('Copiado'); } catch (err) { setStatus('Copy failed'); }
  });
})();
