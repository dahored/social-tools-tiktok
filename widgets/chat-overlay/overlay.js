/* Chat overlay (OBS Browser Source). URL params:
     username=<name>   whose settings / channels to use
     editor=true       inside the editor preview (parent can push unsaved settings)
   Messages arrive by SSE from /api/chat-overlay/stream. */
(function () {
  'use strict';

  var params   = new URLSearchParams(window.location.search);
  var username = (params.get('username') || 'default').trim() || 'default';
  var chatEl   = document.getElementById('chat');
  var settings = { style: 'default', maxMessages: 8, hideAfter: 0, fontSize: 26, sound: 'style', soundVolume: 60, soundCooldown: 1 };
  var inEditor = params.get('editor') === 'true'; // the editor page plays the preview sound itself
  var sfx = new Audio();
  var lastSoundAt = 0;

  var ROLE_LABEL = { broadcaster: 'STREAMER', moderator: 'MOD', vip: 'VIP', subscriber: 'SUB' };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** Lightens dark user colours so names stay readable on dark cards. */
  function readable(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 110) {
      var k = (110 - lum) / 255 + 0.25;
      r = Math.round(r + (255 - r) * k); g = Math.round(g + (255 - g) * k); b = Math.round(b + (255 - b) * k);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function applySettings(next) {
    settings = Object.assign({}, settings, next);
    document.body.className = 'style-' + (settings.style === 'gta' ? 'gta' : 'default');
    document.documentElement.style.setProperty('--chat-font', (Number(settings.fontSize) || 26) + 'px');
    trim();
  }

  /** Message sound: style default, the user's upload, or nothing; throttled for busy chats. */
  function soundUrl(s) {
    if (s.sound === 'off') return '';
    if (s.sound === 'custom' && s.soundFile) {
      return '/api/chat-overlay/sound/' + encodeURIComponent(username) + '?v=' + encodeURIComponent(s.updatedAt || '');
    }
    return '/assets/sounds/chat/' + (s.style === 'gta' ? 'gta' : 'default') + '.mp3';
  }

  function playSound() {
    var url = soundUrl(settings);
    if (!url || inEditor) return;
    var now = Date.now();
    if (now - lastSoundAt < (Number(settings.soundCooldown) || 0) * 1000) return;
    lastSoundAt = now;
    if (sfx.getAttribute('src') !== url) sfx.src = url;
    sfx.volume = Math.min(1, Math.max(0, (Number(settings.soundVolume) || 0) / 100));
    sfx.currentTime = 0;
    sfx.play().catch(function () { /* autoplay blocked outside OBS */ });
  }

  function trim() {
    var items = chatEl.querySelectorAll('.msg:not(.is-leaving)');
    var extra = items.length - (Number(settings.maxMessages) || 8);
    for (var i = 0; i < extra; i++) leave(items[i]);
  }

  function leave(node) {
    if (!node || node.classList.contains('is-leaving')) return;
    node.classList.add('is-leaving');
    setTimeout(function () { node.remove(); }, 450);
  }

  function render(msg) {
    if (chatEl.querySelector('[data-id="' + CSS.escape(msg.id) + '"]')) return;
    var p = window.PLATFORM_ICONS[msg.platform] || { name: msg.platform, color: '#666', fg: '#fff', svg: '' };

    var text = (msg.parts || []).map(function (part) {
      return part.type === 'emote'
        ? '<img class="msg-emote" src="' + escapeHtml(part.url) + '" alt="' + escapeHtml(part.name) + '" title="' + escapeHtml(part.name) + '" />'
        : escapeHtml(part.text);
    }).join('');

    var roles = (msg.author.roles || []).map(function (r) {
      return '<span class="msg-role role-' + r + '">' + ROLE_LABEL[r] + '</span>';
    }).join('');

    var node = document.createElement('div');
    node.className = 'msg msg--' + msg.platform;
    node.setAttribute('data-id', msg.id);
    node.setAttribute('data-user', String(msg.author.name || '').toLowerCase());
    node.setAttribute('data-platform', msg.platform);
    node.style.setProperty('--platform', p.color);
    node.style.setProperty('--platform-fg', p.fg);
    var color = readable(msg.author.color);
    if (color) node.style.setProperty('--user-color', color);

    node.innerHTML =
      '<div class="msg-icon" title="' + escapeHtml(p.name) + '"><span class="msg-icon-inner">' + p.svg + '</span></div>' +
      '<div class="msg-body">' +
        '<div class="msg-head">' + roles + '<span class="msg-name">' + escapeHtml(msg.author.name) + '</span></div>' +
        '<div class="msg-text">' + text + '</div>' +
      '</div>';

    chatEl.appendChild(node);
    trim();
    var hide = Number(settings.hideAfter) || 0;
    if (hide > 0) setTimeout(function () { leave(node); }, hide * 1000);
  }

  function remove(evt) {
    var nodes = chatEl.querySelectorAll('.msg[data-platform="' + evt.platform + '"]');
    nodes.forEach(function (n) {
      if (evt.all ||
          (evt.ids && evt.ids.indexOf(n.getAttribute('data-id')) !== -1) ||
          (evt.user && n.getAttribute('data-user') === String(evt.user).toLowerCase())) {
        leave(n);
      }
    });
  }

  // Editor hooks: preview unsaved settings, clear the list, reuse the sound rules
  window.setChatSettings = applySettings;
  window.chatSoundUrl = function (s) { return soundUrl(Object.assign({}, settings, s)); };
  window.clearChat = function () { chatEl.innerHTML = ''; };

  var es = new EventSource('/api/chat-overlay/stream?username=' + encodeURIComponent(username));
  es.onmessage = function (event) {
    var data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type === 'snapshot') {
      if (!window.__editorOverrides) applySettings(data.settings);
      // Show the last few so a refreshed source isn't empty
      (data.recent || []).slice(-(Number(settings.maxMessages) || 8)).forEach(render);
    } else if (data.type === 'settings') {
      if (!window.__editorOverrides) applySettings(data.settings);
    } else if (data.type === 'message') {
      render(data.message);
      playSound();
    } else if (data.type === 'delete') {
      remove(data);
    }
    if (window.parent !== window && typeof window.parent.onChatEvent === 'function') window.parent.onChatEvent(data);
  };

  applySettings({});
})();
