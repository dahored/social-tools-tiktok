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

function logoHtml(key) {
  var p = window.PLATFORM_ICONS[key];
  return '<span class="channel-logo" style="background:' + p.color + ';color:' + p.fg + '">' + p.svg + '</span>';
}

function buildChannelFields() {
  $('channelFields').innerHTML = PLATFORMS.map(function (pl) {
    var p = window.PLATFORM_ICONS[pl.key];
    return (
      '<div class="field channel-field">' +
        '<label for="ch-' + pl.key + '">' + logoHtml(pl.key) + p.name +
          '<span class="channel-state" id="state-' + pl.key + '" data-state="off">' + STATE_LABEL.off + '</span>' +
        '</label>' +
        '<input id="ch-' + pl.key + '" type="text" placeholder="' + pl.placeholder + '" autocomplete="off" />' +
        '<div class="channel-detail" id="detail-' + pl.key + '"></div>' +
      '</div>'
    );
  }).join('');

  // Facebook: no free-text channel — connected through the official login
  $('channelFields').innerHTML +=
    '<div class="field channel-field">' +
      '<label>' + logoHtml('facebook') + 'Facebook' +
        '<span class="channel-state" id="state-facebook" data-state="off">' + STATE_LABEL.off + '</span>' +
      '</label>' +
      '<div id="fbBody" class="fb-body"></div>' +
      '<div class="channel-detail" id="detail-facebook"></div>' +
    '</div>';

  $('testRow').innerHTML += PLATFORMS.concat([{ key: 'facebook' }]).map(function (pl) {
    return '<button type="button" class="btn-ghost btn-sm btn-test" data-test="' + pl.key + '">' +
      logoHtml(pl.key) + window.PLATFORM_ICONS[pl.key].name + '</button>';
  }).join('') + '<button type="button" class="btn-ghost btn-sm" id="clearBtn">Limpiar</button>';
}

/* ── Facebook connect ──────────────────────────────────────────────── */

function authHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': 'Bearer ' + (localStorage.getItem('stt_token') || ''),
  };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function renderFacebook(fb) {
  var body = $('fbBody');
  if (!fb.configured) {
    var redirect = window.location.origin + '/api/chat-overlay/facebook/callback';
    body.innerHTML =
      '<details class="fb-setup"><summary>Configurar Facebook (una sola vez)</summary><ol>' +
        '<li>Entra a <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> y crea una app (caso de uso: administrar tu Página).</li>' +
        '<li>Agrega el producto <strong>Facebook Login</strong> y en "URI de redireccionamiento de OAuth válidos" pega:<code class="cmd">' + escapeHtml(redirect) + '</code></li>' +
        '<li>Copia el <strong>App ID</strong> y el <strong>App Secret</strong> en tu archivo <code>.env</code> como <code>FACEBOOK_APP_ID</code> y <code>FACEBOOK_APP_SECRET</code>.</li>' +
        '<li>Reinicia la app (Docker) y vuelve aquí: aparecerá el botón <strong>Conectar Facebook</strong>.</li>' +
      '</ol><p class="hint">Solo funciona con <strong>Páginas</strong>: Facebook no permite leer directos de perfiles personales.</p></details>';
    return;
  }
  if (!fb.connected) {
    body.innerHTML = '<button type="button" class="btn-primary fb-connect" id="fbConnectBtn">Conectar Facebook</button>' +
      '<p class="hint">Inicia sesión una vez y elige la Página donde transmites.</p>';
    return;
  }
  var options = fb.pages.map(function (p) {
    return '<option value="' + escapeHtml(p.id) + '"' + (p.id === fb.pageId ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>';
  }).join('');
  body.innerHTML =
    '<select id="fbPage" aria-label="Página de Facebook">' + options + '</select>' +
    '<div class="fb-actions">' +
      '<button type="button" class="btn-ghost btn-sm" id="fbConnectBtn">Reconectar</button>' +
      '<button type="button" class="btn-ghost btn-sm" id="fbDisconnectBtn">Desconectar</button>' +
    '</div>';
}

async function loadFacebook() {
  try {
    var res = await fetch('/api/chat-overlay/facebook/status?username=' + encodeURIComponent(state.username), { headers: authHeaders() });
    if (res.status === 401) { $('fbBody').innerHTML = '<p class="hint">Inicia sesión de nuevo para gestionar Facebook.</p>'; return; }
    renderFacebook(await res.json());
  } catch (e) {
    $('fbBody').innerHTML = '<p class="hint">No se pudo cargar el estado de Facebook.</p>';
  }
}

async function facebookAction(path, body) {
  var res = await fetch(path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(Object.assign({ username: state.username }, body || {})) });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

async function connectFacebook() {
  try {
    var data = await facebookAction('/api/chat-overlay/facebook/login');
    var popup = window.open(data.url, 'facebook-login', 'width=600,height=720');
    if (!popup) window.location.href = data.url; // popup blocked: full-page flow
  } catch (e) {
    setStatus('Facebook: ' + e.message);
  }
}

window.addEventListener('message', function (e) {
  if (e.origin !== window.location.origin || !e.data || e.data.type !== 'facebook-connected') return;
  setStatus(e.data.ok ? 'Facebook conectado' : 'Facebook: ' + e.data.message);
  loadFacebook();
});

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
  PLATFORMS.forEach(function (pl) { form[pl.key] = $('ch-' + pl.key).value.trim(); });
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
  PLATFORMS.forEach(function (pl) { $('ch-' + pl.key).value = settings[pl.key] || ''; });
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
    PLATFORMS.concat([{ key: 'facebook' }]).forEach(function (pl) {
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
    loadFacebook();
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

  $('channelFields').addEventListener('click', async function (e) {
    if (e.target.id === 'fbConnectBtn') connectFacebook();
    if (e.target.id === 'fbDisconnectBtn') {
      if (!window.confirm('¿Desconectar Facebook? Se borrará el permiso guardado.')) return;
      try { renderFacebook(await facebookAction('/api/chat-overlay/facebook/disconnect')); setStatus('Facebook desconectado'); }
      catch (err) { setStatus('Facebook: ' + err.message); }
    }
  });
  $('channelFields').addEventListener('change', async function (e) {
    if (e.target.id !== 'fbPage') return;
    try { renderFacebook(await facebookAction('/api/chat-overlay/facebook/page', { pageId: e.target.value })); setStatus('Página de Facebook cambiada'); }
    catch (err) { setStatus('Facebook: ' + err.message); }
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
