'use strict';

var TYPES = [
  { key: 'donation',     label: 'Donaciones / regalos' },
  { key: 'subscription', label: 'Suscripciones / miembros' },
  { key: 'gift_sub',     label: 'Subs regaladas' },
  { key: 'follow',       label: 'Follows' },
  { key: 'raid',         label: 'Raids / hosts' },
  { key: 'share',        label: 'Shares' },
  { key: 'like',         label: 'Likes' },
];
var PLATFORMS = ['tiktok', 'youtube', 'twitch', 'kick', 'x', 'facebook'];

/** Events each platform actually sends (with its own name for them). */
var SUPPORT = {
  tiktok:   { donation: 'Regalo', subscription: 'Suscripción', follow: 'Follow', share: 'Share', like: 'Likes' },
  youtube:  { donation: 'Super Chat / Sticker', subscription: 'Nuevo miembro', gift_sub: 'Membresías regaladas' },
  twitch:   { donation: 'Bits / tip', subscription: 'Suscripción', gift_sub: 'Subs regaladas', raid: 'Raid', follow: 'Follow (vía StreamElements)' },
  x:        { follow: 'Follow', subscription: 'Suscripción', donation: 'Tip' }, // via StreamElements
  kick:     { donation: 'Kicks', subscription: 'Suscripción', gift_sub: 'Subs regaladas', raid: 'Host', follow: 'Follow' },
  facebook: {},
};
var STATE_LABEL = {
  off: 'Sin configurar', connecting: 'Conectando…', reconnecting: 'Reconectando…',
  connected: 'Conectado', offline: 'Sin directo', error: 'Error',
};

var state = { username: 'default', settings: null, pendingSounds: {} }; // type → { dataUrl, name }
var previewSfx = new Audio();

function $(id) { return document.getElementById(id); }
function setStatus(text) { $('status').textContent = text; }

function normalizeUsername(raw) {
  return String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
}

function logoHtml(key) {
  var p = window.PLATFORM_ICONS[key];
  return '<span class="channel-logo" style="background:' + p.color + ';color:' + p.fg + '">' + p.svg + '</span>';
}

function buildStatic() {
  $('channelList').innerHTML = PLATFORMS.map(function (key) {
    return '<div class="channel-row">' + logoHtml(key) + '<span class="name">' + window.PLATFORM_ICONS[key].name + '</span>' +
      '<span class="channel-state" id="state-' + key + '" data-state="off">' + STATE_LABEL.off + '</span></div>';
  }).join('');
  $('typeList').innerHTML = TYPES.map(function (t) {
    var logos = PLATFORMS.filter(function (k) { return SUPPORT[k][t.key]; }).map(logoHtml).join('');
    return '<label class="check-row"><input type="checkbox" data-type="' + t.key + '" checked /> ' + t.label +
      '<span class="type-platforms">' + logos + '</span></label>';
  }).join('');
  $('testPlatform').innerHTML = PLATFORMS.map(function (k) {
    return '<option value="' + k + '">' + window.PLATFORM_ICONS[k].name + (k === 'facebook' ? ' (sin alertas)' : '') + '</option>';
  }).join('');
  renderTestTypes();
}

/** Only offer the event types the selected platform supports. */
function renderTestTypes() {
  var platform = $('testPlatform').value;
  var types = SUPPORT[platform] || {};
  var keys = Object.keys(types);
  var previous = $('testType').value;
  $('testType').innerHTML = keys.map(function (k) { return '<option value="' + k + '">' + types[k] + '</option>'; }).join('');
  if (keys.indexOf(previous) !== -1) $('testType').value = previous;
  $('testType').disabled = !keys.length;
  $('testBtn').disabled = !keys.length;
  $('testNote').textContent = keys.length
    ? 'Las pruebas también aparecen en OBS si el overlay está abierto.'
    : 'Facebook solo permite leer comentarios por su API (no Stars ni follows), así que no genera alertas.';
}

/* ── Per-event sounds ───────────────────────────────────── */

function buildSoundList() {
  $('soundList').innerHTML = TYPES.map(function (t) {
    return (
      '<div class="sound-row" data-sound-row="' + t.key + '">' +
        '<div class="sound-label">' + t.label + '<span class="sound-file" id="soundFile-' + t.key + '"></span></div>' +
        '<select data-sound-mode="' + t.key + '" aria-label="Sonido de ' + t.label + '">' +
          '<option value="style">Del estilo</option>' +
          '<option value="custom">Personalizado</option>' +
          '<option value="off">Sin sonido</option>' +
        '</select>' +
        '<label class="btn-ghost btn-sm" title="Subir audio">⬆<input type="file" data-sound-upload="' + t.key + '" ' +
          'accept="audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.ogg,.wav,.m4a" /></label>' +
        '<button type="button" class="btn-ghost btn-sm" data-sound-play="' + t.key + '" title="Escuchar">🔊</button>' +
      '</div>'
    );
  }).join('');
}

function renderSounds() {
  var sounds = (state.settings && state.settings.sounds) || {};
  TYPES.forEach(function (t) {
    var select = document.querySelector('[data-sound-mode="' + t.key + '"]');
    var pending = state.pendingSounds[t.key];
    var saved = sounds[t.key] || {};
    var label = $('soundFile-' + t.key);
    if (pending) label.textContent = pending.name + ' (sin subir)';
    else if (saved.file) label.textContent = 'Audio propio ✓';
    else label.textContent = '';
    select.closest('.sound-row').classList.toggle('is-muted', select.value === 'off');
  });
}

function readSounds() {
  var out = {};
  TYPES.forEach(function (t) {
    out[t.key] = { mode: document.querySelector('[data-sound-mode="' + t.key + '"]').value };
  });
  return out;
}

/** Sound for a type with the unsaved form (pending upload wins). */
function soundUrlFor(type) {
  var form = readForm();
  if (form.sound === 'off' || form.sounds[type].mode === 'off') return '';
  if (form.sounds[type].mode === 'custom' && state.pendingSounds[type]) return state.pendingSounds[type].dataUrl;
  var win = previewWindow();
  if (!win || typeof win.alertSoundUrl !== 'function') return '';
  var saved = ((state.settings && state.settings.sounds) || {})[type] || {};
  var sounds = {};
  sounds[type] = { mode: form.sounds[type].mode, file: saved.file };
  return win.alertSoundUrl(type, Object.assign({}, state.settings, form, { sounds: sounds }));
}

function playUrl(url, volume) {
  if (!url) return;
  previewSfx.src = url;
  previewSfx.volume = Math.min(1, Math.max(0, (Number(volume) || 0) / 100));
  previewSfx.currentTime = 0;
  previewSfx.play().catch(function () {});
}

function readForm() {
  var types = {};
  document.querySelectorAll('[data-type]').forEach(function (el) { types[el.getAttribute('data-type')] = el.checked; });
  return {
    style:         $('style').value,
    size:          $('size').value,
    soundPack:     $('soundPack').value,
    duration:      Number($('duration').value),
    sound:         $('sound').value,
    volume:        Number($('volume').value),
    showMessage:   $('showMessage').checked,
    likeMilestone: Number($('likeMilestone').value),
    minBits:       Number($('minBits').value),
    minDiamonds:   Number($('minDiamonds').value),
    types:         types,
    sounds:        readSounds(),
  };
}

function previewWindow() {
  var win = $('previewFrame').contentWindow;
  return win && typeof win.setAlertSettings === 'function' ? win : null;
}

/** Pushes the (possibly unsaved) settings to the preview iframe. */
function refreshPreview() {
  $('volumeValue').textContent = $('volume').value;
  $('sizeField').hidden = $('style').value === 'gta';
  var win = previewWindow();
  if (!win) return;
  win.__editorOverrides = true;
  win.setAlertSettings(readForm());
}

function applySettings(s) {
  state.settings = s;
  $('username').value      = state.username;
  $('style').value         = s.style;
  $('size').value          = s.size || 'large';
  $('soundPack').value     = s.soundPack || 'auto';
  $('duration').value      = s.duration;
  $('sound').value         = s.sound;
  $('volume').value        = s.volume;
  $('showMessage').checked = s.showMessage !== false;
  $('likeMilestone').value = s.likeMilestone;
  $('minBits').value       = s.minBits;
  $('minDiamonds').value   = s.minDiamonds;
  document.querySelectorAll('[data-type]').forEach(function (el) { el.checked = s.types[el.getAttribute('data-type')] !== false; });
  state.pendingSounds = {};
  TYPES.forEach(function (t) {
    var entry = (s.sounds || {})[t.key] || {};
    document.querySelector('[data-sound-mode="' + t.key + '"]').value = entry.mode === 'custom' && !entry.file ? 'style' : (entry.mode || 'style');
  });
  renderSounds();
  var u = encodeURIComponent(state.username);
  $('overlayUrl').value = new URL('/widgets/alerts/overlay.html?username=' + u, window.location.origin).toString();
  $('channelsLink').href = '/channels.html?username=' + u;
  refreshPreview();
}

function setChannelState(platform, s, detail) {
  var el = $('state-' + platform);
  if (!el) return;
  el.setAttribute('data-state', s);
  el.textContent = STATE_LABEL[s] || s;
  el.title = detail || '';
}

/** SSE events relayed by the preview iframe. */
window.onAlertEvent = function (data) {
  if (data.type === 'snapshot') {
    PLATFORMS.forEach(function (k) {
      var st = data.statuses[k];
      setChannelState(k, st ? st.state : 'off', st && st.detail);
    });
  } else if (data.type === 'status') {
    setChannelState(data.platform, data.state, data.detail);
  }
};

/** The preview iframe asks the editor to play the sound (the editor has the user's click). */
window.onAlertSound = function (url, volume, type) {
  // an unsaved upload for this type plays instead of what the iframe knows
  playUrl(type ? soundUrlFor(type) : url, volume);
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
    applySettings(await api('/api/alerts?username=' + encodeURIComponent(state.username)));
    setStatus('Loaded for @' + state.username);
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
}

async function save() {
  setStatus('Saving…');
  try {
    var settings = await api('/api/alerts/settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(Object.assign({ username: state.username }, readForm())),
    });
    var types = Object.keys(state.pendingSounds);
    for (var i = 0; i < types.length; i++) {
      var res = await fetch('/api/alerts/sound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('stt_token') || ''),
        },
        body: JSON.stringify({ username: state.username, type: types[i], dataUrl: state.pendingSounds[types[i]].dataUrl }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 401) throw new Error('tu sesión expiró: inicia sesión de nuevo para subir los audios');
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
  buildStatic();
  buildSoundList();

  var frame = $('previewFrame');
  function frameSrc() {
    return '/widgets/alerts/overlay.html?editor=true&username=' + encodeURIComponent(state.username);
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

  document.querySelector('.editor-sidebar').addEventListener('input', function (e) {
    if (e.target.id !== 'username') refreshPreview();
  });
  document.querySelector('.editor-sidebar').addEventListener('change', function (e) {
    if (e.target.id !== 'username') refreshPreview();
  });
  $('saveBtn').addEventListener('click', save);

  $('soundList').addEventListener('change', function (e) {
    var type = e.target.getAttribute('data-sound-upload');
    if (type) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) { setStatus('El audio debe pesar 3 MB o menos'); e.target.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function () {
        state.pendingSounds[type] = { dataUrl: reader.result, name: file.name };
        document.querySelector('[data-sound-mode="' + type + '"]').value = 'custom';
        renderSounds();
        setStatus('Audio listo — pulsa Guardar para subirlo');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
    if (e.target.hasAttribute('data-sound-mode')) renderSounds();
  });
  $('soundList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-sound-play]');
    if (btn) playUrl(soundUrlFor(btn.getAttribute('data-sound-play')), $('volume').value);
  });

  $('testPlatform').addEventListener('change', renderTestTypes);
  $('testBtn').addEventListener('click', function () {
    fetch('/api/alerts/test?username=' + encodeURIComponent(state.username) +
      '&type=' + $('testType').value + '&platform=' + $('testPlatform').value, { method: 'POST' });
  });
  $('clearBtn').addEventListener('click', function () {
    var win = previewWindow();
    if (win) win.clearAlerts();
  });
  $('copyUrlBtn').addEventListener('click', async function () {
    try { await copyText($('overlayUrl').value); setStatus('Copiado'); } catch (err) { setStatus('Copy failed'); }
  });
})();
