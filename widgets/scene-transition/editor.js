'use strict';

var state = {
  username: 'default',
  settings: null,
  logoMode: 'text',
  pendingLogo: null, // data URL chosen but not uploaded yet
  pendingSound: null, // { dataUrl, name } chosen but not uploaded yet
  videos: [],
  orientation: 'horizontal', // preview / OBS URL / download — not a saved setting
};

function $(id) { return document.getElementById(id); }

var previewSfx = new Audio();
var previewSfxStop = null;

function customSoundUrl() {
  if (state.pendingSound) return state.pendingSound.dataUrl;
  if (!state.settings || !state.settings.soundFile) return '';
  return '/api/scene-transition/sound/' + encodeURIComponent(state.username) +
    '?v=' + encodeURIComponent(state.settings.updatedAt || '');
}

/** Sound the preview should play for the (possibly unsaved) form, or '' for none. */
function previewSoundUrl(form, win) {
  if (form.soundMode === 'off') return '';
  if (form.soundMode === 'custom' && customSoundUrl()) return customSoundUrl();
  return '/assets/sounds/transitions/' + (win.SceneTransitions[form.game] ? form.game : 'default') + '.mp3';
}

function renderSoundInfo() {
  $('customSoundFields').hidden = $('soundMode').value !== 'custom';
  var name = state.pendingSound
    ? state.pendingSound.name + ' (sin subir)'
    : (state.settings && state.settings.soundFile ? 'Audio subido ✓ — pulsa ▶ Reproducir para escucharlo' : '');
  $('soundInfo').textContent = name || 'Sin audio — sube un MP3, OGG, WAV o M4A';
}

function setStatus(text) { $('status').textContent = text; }

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function normalizeUsername(raw) {
  return String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
}

function absUrl(path) {
  return new URL(path, window.location.origin).toString();
}

function logoUrl() {
  if (state.pendingLogo) return state.pendingLogo;
  if (!state.settings || !state.settings.logoFile) return '';
  return '/api/scene-transition/logo/' + encodeURIComponent(state.username) +
    '?v=' + encodeURIComponent(state.settings.updatedAt || '');
}

/* ── Form <-> preview ──────────────────────────────────────── */

function readForm() {
  return {
    game:     $('game').value,
    logoMode: state.logoMode,
    line1:    $('line1').value,
    line2:    $('line2').value,
    accent:   $('accent').value,
    soundMode: $('soundMode').value,
  };
}

function setMode(mode) {
  state.logoMode = mode;
  document.querySelectorAll('.mode-toggle button').forEach(function (b) {
    b.classList.toggle('is-active', b.getAttribute('data-mode') === mode);
  });
  $('imageFields').hidden = mode !== 'image';
}

function renderLogoPreview() {
  var url = logoUrl();
  $('logoPreview').innerHTML = url
    ? '<img src="' + escapeHtml(url) + '" alt="Logo" />'
    : 'Sin logo — sube un PNG/SVG con fondo transparente';
}

/** Rebuilds the iframe preview from the (possibly unsaved) form. */
function refreshPreview(play) {
  var win = $('previewFrame').contentWindow;
  if (!win || typeof win.setTransition !== 'function') return;
  var form = readForm();
  var def = win.setTransition(form.game, {
    logoMode: form.logoMode,
    line1:    form.line1,
    line2:    form.line2,
    accent:   form.accent,
    logoUrl:  logoUrl(),
  });
  $('cutPoint').textContent = Math.round(def.cutPoint * 1000);
  // Park on the fully-covered frame so the look is visible without playing
  if (play) {
    win.playTransition();
    // Played from the editor page: it has the click's user activation, the iframe doesn't
    var url = previewSoundUrl(form, win);
    if (url) {
      previewSfx.src = url;
      previewSfx.currentTime = 0;
      previewSfx.play().catch(function () {});
      clearTimeout(previewSfxStop);
      previewSfxStop = setTimeout(function () { previewSfx.pause(); }, 6000);
    }
  }
  else win.seekTransition(def.cutPoint);
}

function applySettings(settings) {
  state.settings = settings;
  state.pendingLogo = null;
  $('username').value = state.username;
  $('game').value     = settings.game;
  $('accent').value   = settings.accent;
  state.pendingSound  = null;
  $('soundMode').value = settings.soundMode || 'style';
  $('soundFile').value = '';
  renderSoundInfo();
  $('line1').value    = settings.line1 || '';
  $('line2').value    = settings.line2 || '';
  $('logoFile').value = '';
  setMode(settings.logoMode);
  renderLogoPreview();
  renderUrls();
  refreshPreview(false);
}

function renderUrls() {
  var u = encodeURIComponent(state.username);
  var vertical = state.orientation === 'vertical';
  $('overlayUrl').value = absUrl('/widgets/scene-transition/overlay.html?username=' + u + (vertical ? '&orientation=vertical' : ''));
  $('sourceSize').textContent = vertical ? '1080×1920' : '1920×1080';
  $('playUrl').value    = absUrl('/api/scene-transition/play?username=' + u);
}

async function renderVideos() {
  var list = $('videoList');
  try {
    var res  = await fetch('/api/scene-transition/videos?username=' + encodeURIComponent(state.username));
    var data = await res.json();
    state.videos = data.videos || [];
    if (!data.videos || !data.videos.length) {
      list.innerHTML = '<p class="hint">Aún no hay videos generados para @' + escapeHtml(state.username) + '.</p>';
      return;
    }
    list.innerHTML = data.videos.map(function (v) {
      var url = absUrl(v.url);
      var when = new Date(v.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      return (
        '<div class="video-item">' +
          '<div class="video-meta">' +
            '<span class="video-name">' + escapeHtml(v.game.toUpperCase()) + '</span>' +
            '<span class="video-tags">' +
              (v.orientation === 'vertical' ? '▯ Vertical' : '▭ Horizontal') + ' · ' + escapeHtml(v.format.toUpperCase()) +
              ' · ' + escapeHtml(when) +
            '</span>' +
          '</div>' +
          '<div class="video-actions">' +
            '<a href="' + escapeHtml(url) + '" download>Descargar</a>' +
            '<a href="#" data-copy-text="' + escapeHtml(url) + '">Copiar URL</a>' +
            '<button type="button" class="video-delete" data-delete="' + escapeHtml(v.file) + '">Borrar</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  } catch (e) {
    list.innerHTML = '<p class="hint">No se pudo cargar la lista de videos.</p>';
  }
}

/* ── API ───────────────────────────────────────────────────── */

async function api(path, options) {
  var res  = await fetch(path, options);
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

async function load() {
  setStatus('Loading…');
  try {
    var settings = await api('/api/scene-transition?username=' + encodeURIComponent(state.username));
    applySettings(settings);
    renderVideos();
    setStatus('Loaded for @' + state.username);
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
}

async function save() {
  setStatus('Saving…');
  var btn = $('saveBtn');
  btn.disabled = true;
  try {
    // Settings first — they don't need a session, so a logo failure can't block them
    var settings = await api('/api/scene-transition/settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(Object.assign({ username: state.username }, readForm())),
    });

    var uploads = [
      { path: '/api/scene-transition/logo',  dataUrl: state.pendingLogo, what: 'el logo' },
      { path: '/api/scene-transition/sound', dataUrl: state.pendingSound && state.pendingSound.dataUrl, what: 'el audio' },
    ];
    for (var u = 0; u < uploads.length; u++) {
      if (!uploads[u].dataUrl) continue;
      var res = await fetch(uploads[u].path, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('stt_token') || ''),
        },
        body: JSON.stringify({ username: state.username, dataUrl: uploads[u].dataUrl }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 401) {
        applySettings(settings);
        setStatus('Ajustes guardados, pero tu sesión expiró: inicia sesión de nuevo para subir ' + uploads[u].what);
        if (window.confirm('Tu sesión expiró. ¿Ir a iniciar sesión para poder subir ' + uploads[u].what + '?')) {
          localStorage.removeItem('stt_token');
          localStorage.removeItem('stt_user');
          window.location.href = '/login.html';
        }
        return true;
      }
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      settings = data;
    }

    applySettings(settings);
    setStatus('Saved for @' + state.username);
    return true;
  } catch (e) {
    setStatus('Error: ' + e.message);
    return false;
  } finally {
    btn.disabled = false;
  }
}

/* ── Download (render on the host worker if needed) ────────── */

function isDirty() {
  if (!state.settings) return false;
  if (state.pendingLogo || state.pendingSound) return true;
  var form = readForm();
  return ['game', 'logoMode', 'line1', 'line2', 'accent', 'soundMode'].some(function (k) {
    return String(form[k] || '') !== String(state.settings[k] || '');
  });
}

function triggerDownload(url) {
  var a = document.createElement('a');
  a.href = url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
  a.download = url.split('/').pop().split('?')[0];
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function setRenderState(text) { $('renderState').textContent = text; }

async function pollJob(id) {
  var started = Date.now();
  for (;;) {
    await new Promise(function (r) { setTimeout(r, 1000); });
    var job = await api('/api/scene-transition/render/' + encodeURIComponent(id));
    var secs = Math.round((Date.now() - started) / 1000);
    if (job.status === 'done') return job;
    if (job.status === 'error') throw new Error(job.error || 'El render falló');
    setRenderState((job.status === 'rendering' ? 'Renderizando… ' : 'En cola… ') + secs + ' s');
    if (Date.now() - started > 5 * 60 * 1000) throw new Error('El render tardó demasiado');
  }
}

async function download() {
  var btn = $('downloadBtn');
  var format = $('videoFormat').value;
  btn.disabled = true;
  $('workerHelp').hidden = true;
  try {
    // The video is rendered from the saved settings
    if (isDirty()) {
      setRenderState('Guardando cambios…');
      if (!(await save())) return;
    }

    var game = state.settings.game;
    var fresh = state.videos.find(function (v) {
      return v.game === game && v.format === format && v.orientation === state.orientation &&
        new Date(v.updatedAt) > new Date(state.settings.updatedAt || 0);
    });
    if (fresh) {
      triggerDownload(fresh.url);
      setRenderState('Descargado (ya estaba al día).');
      return;
    }

    setRenderState('Preparando video…');
    var res, data;
    // The render service may still be starting (e.g. right after `docker compose up`): retry briefly
    for (var attempt = 0; attempt < 10; attempt++) {
      res = await fetch('/api/scene-transition/render', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('stt_token') || ''),
        },
        body: JSON.stringify({ username: state.username, format: format, orientation: state.orientation }),
      });
      data = await res.json().catch(function () { return {}; });
      if (res.status !== 503) break;
      setRenderState('Iniciando el servicio de video…');
      await new Promise(function (r) { setTimeout(r, 3000); });
    }
    if (res.status === 503) {
      $('workerHelp').hidden = false;
      setRenderState('El servicio de video no está disponible.');
      return;
    }
    if (res.status === 401) {
      setRenderState('Tu sesión expiró: inicia sesión de nuevo.');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);

    var job = await pollJob(data.id);
    triggerDownload(job.url);
    setRenderState('¡Listo! Video descargado.');
    renderVideos();
  } catch (e) {
    setRenderState('Error: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

/* ── Copy helper ───────────────────────────────────────────── */

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

/* ── Init ──────────────────────────────────────────────────── */

(function init() {
  var params = new URLSearchParams(window.location.search);
  state.username = normalizeUsername(params.get('username'));

  var frame = $('previewFrame');
  function frameSrc() {
    return '/widgets/scene-transition/overlay.html?editor=true&username=' + encodeURIComponent(state.username) +
      (state.orientation === 'vertical' ? '&orientation=vertical' : '');
  }
  frame.addEventListener('load', function () {
    // Orientation switch keeps the (possibly unsaved) form; a new user loads from the server
    if (state.settings) refreshPreview(false);
    else load();
  });

  function setOrientation(orientation) {
    state.orientation = orientation === 'vertical' ? 'vertical' : 'horizontal';
    try { localStorage.setItem('stt_transition_orientation', state.orientation); } catch (e) { /* private mode */ }
    document.querySelectorAll('[data-orientation]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-orientation') === state.orientation);
    });
    $('previewWrap').classList.toggle('is-vertical', state.orientation === 'vertical');
    renderUrls();
    frame.src = frameSrc();
  }
  document.querySelectorAll('[data-orientation]').forEach(function (b) {
    b.addEventListener('click', function () { setOrientation(b.getAttribute('data-orientation')); });
  });

  var savedOrientation = null;
  try { savedOrientation = localStorage.getItem('stt_transition_orientation'); } catch (e) { /* private mode */ }
  setOrientation(params.get('orientation') || savedOrientation || 'horizontal');

  function switchUser(force) {
    var next = normalizeUsername($('username').value);
    if (force !== true && next === state.username) return;
    state.username = next;
    state.settings = null;
    frame.src = frameSrc();
  }
  $('loadUserBtn').addEventListener('click', function () { switchUser(true); });
  // Typing a new username and saving must not write to the previous user
  $('username').addEventListener('change', function () { switchUser(false); });

  document.querySelectorAll('.mode-toggle button').forEach(function (b) {
    b.addEventListener('click', function () {
      setMode(b.getAttribute('data-mode'));
      refreshPreview(false);
    });
  });

  ['game', 'accent', 'line1', 'line2'].forEach(function (id) {
    $(id).addEventListener('input', function () { refreshPreview(false); });
  });

  $('logoFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setStatus('El logo debe pesar 2 MB o menos'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      state.pendingLogo = reader.result;
      renderLogoPreview();
      refreshPreview(false);
      setStatus('Logo listo — pulsa Guardar para subirlo');
    };
    reader.readAsDataURL(file);
  });

  $('soundMode').addEventListener('change', renderSoundInfo);
  $('soundFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setStatus('El audio debe pesar 5 MB o menos'); this.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      state.pendingSound = { dataUrl: reader.result, name: file.name };
      $('soundMode').value = 'custom';
      renderSoundInfo();
      setStatus('Audio listo — pulsa Guardar para subirlo');
    };
    reader.readAsDataURL(file);
  });

  $('saveBtn').addEventListener('click', save);
  $('downloadBtn').addEventListener('click', download);
  $('playBtn').addEventListener('click', function () { refreshPreview(true); });
  $('playLiveBtn').addEventListener('click', async function () {
    try {
      var data = await api('/api/scene-transition/play?username=' + encodeURIComponent(state.username), { method: 'POST' });
      setStatus('Reproducido en ' + data.listeners + ' overlay(s)');
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  });

  // Delete with inline confirmation: "Borrar" → "¿Borrar? Sí / No"
  $('videoList').addEventListener('click', async function (e) {
    var del = e.target.closest('[data-delete]');
    var yes = e.target.closest('[data-delete-yes]');
    var no  = e.target.closest('[data-delete-no]');
    if (del) {
      var actions = del.parentElement;
      actions.dataset.html = actions.innerHTML;
      actions.innerHTML =
        '<span class="video-confirm">¿Borrar este video?</span>' +
        '<button type="button" class="video-delete is-confirm" data-delete-yes="' + escapeHtml(del.getAttribute('data-delete')) + '">Sí, borrar</button>' +
        '<button type="button" class="video-cancel" data-delete-no>No</button>';
    } else if (no) {
      no.parentElement.innerHTML = no.parentElement.dataset.html;
    } else if (yes) {
      yes.disabled = true;
      try {
        var res = await fetch('/api/scene-transition/videos/' + encodeURIComponent(yes.getAttribute('data-delete-yes')) +
          '?username=' + encodeURIComponent(state.username), {
          method:  'DELETE',
          headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('stt_token') || '') },
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.status === 401) throw new Error('tu sesión expiró, inicia sesión de nuevo');
        if (!res.ok && res.status !== 404) throw new Error(data.error || 'HTTP ' + res.status);
        setStatus('Video borrado');
      } catch (err) {
        setStatus('No se pudo borrar: ' + err.message);
      }
      renderVideos();
    }
  });

  document.addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-copy], [data-copy-text]');
    if (!btn) return;
    e.preventDefault();
    var text = btn.getAttribute('data-copy-text') || $(btn.getAttribute('data-copy')).value;
    try { await copyText(text); setStatus('Copiado'); } catch (err) { setStatus('Copy failed'); }
  });
})();
