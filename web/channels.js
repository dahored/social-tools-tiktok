'use strict';

/* "Mis canales": accounts shared by every widget + the Facebook Page connection. */

var FIELDS = [
  { key: 'twitch',   placeholder: 'tu_usuario',                 hint: 'Chat, alertas y rotator' },
  { key: 'kick',     placeholder: 'tu_usuario',                 hint: 'Chat, alertas y rotator' },
  { key: 'youtube',  placeholder: '@tuhandle o URL del canal',  hint: 'Chat, alertas y rotator' },
  { key: 'tiktok',   placeholder: '@tu_usuario',                hint: 'Chat, alertas y rotator' },
  { key: 'facebook', placeholder: 'tu_pagina',                  hint: 'Nombre visible en el rotator (el chat usa la Página conectada abajo)' },
  { key: 'x',        placeholder: '@tu_usuario',                hint: 'Rotator; chat y alertas vía StreamElements' },
];
var STATE_LABEL = {
  off: 'Sin configurar', connecting: 'Conectando…', reconnecting: 'Reconectando…',
  connected: 'Conectado', offline: 'Sin directo', error: 'Error',
};

var state = { username: 'default', stream: null };

function $(id) { return document.getElementById(id); }
function setStatus(text) { $('status').textContent = text; }

function normalizeUsername(raw) {
  return String(raw || 'default').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
}

function logoHtml(key) {
  var p = window.PLATFORM_ICONS[key];
  return '<span class="channel-logo" style="background:' + p.color + ';color:' + p.fg + '">' + p.svg + '</span>';
}

function buildFields() {
  $('channelFields').innerHTML = FIELDS.map(function (f) {
    var p = window.PLATFORM_ICONS[f.key];
    var live = f.key !== 'facebook'; // x's live state comes from StreamElements
    return (
      '<div class="field channel-field">' +
        '<label for="ch-' + f.key + '">' + logoHtml(f.key) + p.name +
          (live ? '<span class="channel-state" id="state-' + f.key + '" data-state="off">' + STATE_LABEL.off + '</span>' : '') +
        '</label>' +
        '<input id="ch-' + f.key + '" type="text" placeholder="' + f.placeholder + '" autocomplete="off" />' +
        // live ones show connection details here; facebook/x are display-only handles
        '<div class="channel-detail" id="' + (live ? 'detail-' : 'hint-') + f.key + '">' + f.hint + '</div>' +
      '</div>'
    );
  }).join('');
  $('fbLogo').outerHTML = logoHtml('facebook');
}

function setChannelState(platform, s, detail) {
  var el = $('state-' + platform);
  if (!el) return;
  el.setAttribute('data-state', s);
  el.textContent = STATE_LABEL[s] || s;
  var d = $('detail-' + platform);
  if (!d) return;
  var f = FIELDS.find(function (x) { return x.key === platform; });
  d.textContent = detail || (platform === 'facebook' ? '' : (f ? f.hint : ''));
}

/** Live connection states come from the same stream the overlays use. */
function connectStatus() {
  if (state.stream) state.stream.close();
  state.stream = new EventSource('/api/chat-overlay/stream?username=' + encodeURIComponent(state.username));
  state.stream.onmessage = function (event) {
    var data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type === 'snapshot') {
      ['twitch', 'kick', 'youtube', 'tiktok', 'facebook', 'x'].forEach(function (k) {
        var st = data.statuses[k];
        setChannelState(k, st ? st.state : 'off', st && st.detail);
      });
    } else if (data.type === 'status') {
      setChannelState(data.platform, data.state, data.detail);
    }
  };
}

async function load() {
  setStatus('Loading…');
  try {
    var res = await fetch('/api/channels?username=' + encodeURIComponent(state.username));
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    $('username').value = state.username;
    FIELDS.forEach(function (f) { $('ch-' + f.key).value = data[f.key] || ''; });
    loadFacebook();
    loadStreamElements();
    connectStatus();
    setStatus('Loaded for @' + state.username);
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
}

async function save() {
  setStatus('Saving…');
  var body = { username: state.username };
  FIELDS.forEach(function (f) { body[f.key] = $('ch-' + f.key).value.trim(); });
  try {
    var res = await fetch('/api/channels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    setStatus('Guardado — los widgets se actualizan solos');
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
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

/* ── StreamElements ───────────────────────────────────────── */

function seHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('stt_token') || '') };
}

function renderStreamElements(data) {
  var list = (data && data.channels) || [];
  $('seList').innerHTML = list.length
    ? list.map(function (c) {
        var icon = window.PLATFORM_ICONS[c.provider] ? c.provider : 'streamelements';
        return '<div class="se-item">' + logoHtml(icon) +
          '<span class="se-name">' + escapeHtml(c.name) + '</span>' +
          '<span class="se-provider">' + escapeHtml(c.provider) + '</span>' +
          '<button type="button" class="btn-ghost" data-se-remove="' + escapeHtml(c.id) + '" data-se-name="' + escapeHtml(c.name) + '">Quitar</button>' +
        '</div>';
      }).join('')
    : '<p class="se-empty">Ningún canal de StreamElements enlazado.</p>';
}

async function loadStreamElements() {
  try {
    var res = await fetch('/api/streamelements?username=' + encodeURIComponent(state.username), { headers: seHeaders() });
    if (res.status === 401) { $('seList').innerHTML = '<p class="se-empty">Inicia sesión de nuevo para gestionar StreamElements.</p>'; return; }
    renderStreamElements(await res.json());
  } catch (e) {
    $('seList').innerHTML = '<p class="se-empty">No se pudo cargar StreamElements.</p>';
  }
}

async function seAction(path, body) {
  var res = await fetch(path, { method: 'POST', headers: seHeaders(), body: JSON.stringify(Object.assign({ username: state.username }, body)) });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

(function init() {
  var params = new URLSearchParams(window.location.search);
  state.username = normalizeUsername(params.get('username'));
  buildFields();
  load();

  function switchUser(force) {
    var next = normalizeUsername($('username').value);
    if (force !== true && next === state.username) return;
    state.username = next;
    load();
  }
  $('loadUserBtn').addEventListener('click', function () { switchUser(true); });
  $('username').addEventListener('change', function () { switchUser(false); });
  $('saveBtn').addEventListener('click', save);

  $('seAddBtn').addEventListener('click', async function () {
    var token = $('seToken').value.trim();
    if (!token) { setStatus('Pega primero el JWT Token'); return; }
    setStatus('Validando con StreamElements…');
    try {
      renderStreamElements(await seAction('/api/streamelements', { token: token }));
      $('seToken').value = '';
      setStatus('Canal de StreamElements enlazado');
    } catch (err) {
      setStatus('StreamElements: ' + err.message);
    }
  });
  $('seList').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-se-remove]');
    if (!btn) return;
    if (!window.confirm('¿Quitar "' + btn.getAttribute('data-se-name') + '" de StreamElements? Se borrará su token.')) return;
    try { renderStreamElements(await seAction('/api/streamelements/remove', { id: btn.getAttribute('data-se-remove') })); setStatus('Canal quitado'); }
    catch (err) { setStatus('StreamElements: ' + err.message); }
  });

  $('fbBody').addEventListener('click', async function (e) {
    if (e.target.id === 'fbConnectBtn') connectFacebook();
    if (e.target.id === 'fbDisconnectBtn') {
      if (!window.confirm('¿Desconectar Facebook? Se borrará el permiso guardado.')) return;
      try { renderFacebook(await facebookAction('/api/chat-overlay/facebook/disconnect')); setStatus('Facebook desconectado'); }
      catch (err) { setStatus('Facebook: ' + err.message); }
    }
  });
  $('fbBody').addEventListener('change', async function (e) {
    if (e.target.id !== 'fbPage') return;
    try { renderFacebook(await facebookAction('/api/chat-overlay/facebook/page', { pageId: e.target.value })); setStatus('Página de Facebook cambiada'); }
    catch (err) { setStatus('Facebook: ' + err.message); }
  });
})();
