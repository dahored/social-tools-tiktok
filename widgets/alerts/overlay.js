/* Alerts overlay (OBS Browser Source). URL params:
     username=<name>   whose channels / settings to use (channels come from the Chat Overlay)
     editor=true       inside the editor preview (parent pushes unsaved settings, plays the sound)
   Events arrive by SSE from /api/alerts/stream and are shown one at a time. */
(function () {
  'use strict';

  var params   = new URLSearchParams(window.location.search);
  var username = (params.get('username') || 'default').trim() || 'default';
  var inEditor = params.get('editor') === 'true';
  var stage    = document.getElementById('stage');

  var settings = {
    style: 'default', duration: 6, sound: 'style', volume: 70,
    types: { donation: true, subscription: true, gift_sub: true, follow: true, raid: true, share: true, like: true },
    likeMilestone: 1000, minBits: 1, minDiamonds: 1, showMessage: true,
    sounds: {}, size: 'large',
  };
  var queue = [];
  var busy = false;
  var sfx = new Audio();
  var MAX_QUEUE = 30;
  var LOW_PRIORITY = { like: true, share: true, follow: true };

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fmt(n) { return Number(n || 0).toLocaleString('es-MX'); }

  function applySettings(next) {
    settings = Object.assign({}, settings, next || {});
    settings.types = Object.assign({}, settings.types, (next && next.types) || {});
    if (next && next.sounds) settings.sounds = Object.assign({}, next.sounds);
    document.body.className = 'style-' + (settings.style === 'gta' ? 'gta' : 'default');
  }

  /* ── what to show ─────────────────────────────────────────────── */

  /** Returns the alert to show (possibly adjusted) or null when filtered out. */
  function accept(alert) {
    if (!settings.types[alert.type]) return null;
    if (alert.type === 'donation' && alert.amount) {
      if (alert.amount.unit === 'bits' && alert.amount.value < settings.minBits) return null;
      if (alert.amount.unit === 'diamonds' && alert.amount.value < settings.minDiamonds) return null;
    }
    if (alert.type === 'like') {
      var m = Number(settings.likeMilestone) || 1000;
      var reached = Math.floor((alert.count || 0) / m);
      if (reached < 1 || reached <= Math.floor((alert.previous || 0) / m)) return null;
      alert = Object.assign({}, alert, { count: reached * m });
    }
    return alert;
  }

  /** Title, highlight line ("money" in GTA terms) and detail line per event. */
  function describe(a) {
    var yt = a.platform === 'youtube';
    var count = a.count || 1;
    switch (a.type) {
      case 'donation': {
        var item = a.item && a.item.name
          ? a.item.name + (a.item.count > 1 ? ' x' + a.item.count : '')
          : '';
        return {
          title: a.platform === 'tiktok' ? '¡Regalo!' : (yt ? '¡Super Chat!' : '¡Donación!'),
          value: a.amount ? '+' + a.amount.display.toUpperCase() : '',
          money: true,
          detail: item,
        };
      }
      case 'subscription':
        return {
          title: yt ? '¡Nuevo miembro!' : (a.months > 1 ? '¡Resuscripción!' : '¡Nueva suscripción!'),
          value: a.months > 1 ? a.months + ' meses' : (a.tier || ''),
          respect: true,
        };
      case 'gift_sub':
        return {
          title: yt ? '¡Membresías regaladas!' : '¡Subs regaladas!',
          value: 'x' + fmt(count),
          respect: true,
          detail: a.recipient ? 'para ' + a.recipient : '',
        };
      case 'follow':
        return { title: '¡Nuevo seguidor!', value: 'Respeto +', respect: true };
      case 'raid':
        return { title: a.platform === 'kick' ? '¡Host!' : '¡Raid!', value: '+' + fmt(a.count) + ' espectadores', respect: true };
      case 'share':
        return { title: '¡Compartieron el live!', value: 'Respeto +', respect: true };
      case 'like':
        return { title: '¡' + fmt(a.count) + ' likes!', value: 'Respeto +', respect: true, hideUser: true };
      default:
        return { title: '¡Alerta!', value: '' };
    }
  }

  /* ── Neon banner (default style) ─────────────────────────────── */

  var ICON = {
    heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.6C6.4 16.1 1 11.3 1 7.2 1 3.4 4.1 2 6.3 2c1.3 0 4.1.5 5.7 4.5C13.6 2.5 16.5 2 17.7 2 20.3 2 23 3.6 23 7.2c0 4.1-5.1 8.6-11 14.4z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>',
    crown: '<svg viewBox="0 0 64 40"><defs><linearGradient id="crownG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".55" stop-color="#ffc83a"/><stop offset="1" stop-color="#e08a12"/></linearGradient></defs>' +
      '<path d="M4 34 2 8l16 13L32 2l14 19L62 8l-2 26z" fill="url(#crownG)" stroke="#7a4a00" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<rect x="4" y="32" width="56" height="7" rx="2" fill="#ffb92e" stroke="#7a4a00" stroke-width="2.5"/></svg>',
    gem: '<svg viewBox="0 0 64 64"><defs><linearGradient id="gemA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7d6ff"/><stop offset="1" stop-color="#8b4dff"/></linearGradient><linearGradient id="gemB" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b98cff"/><stop offset="1" stop-color="#5a1fd6"/></linearGradient></defs>' +
      '<path d="M32 3 54 26 32 61 10 26z" fill="url(#gemB)"/><path d="M32 3 42 26 32 61 22 26z" fill="url(#gemA)" opacity=".9"/><path d="M10 26h44L32 3z" fill="#fff" opacity=".22"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8.5" cy="8" r="3.6"/><circle cx="16.5" cy="9" r="3"/><path d="M1.5 20c0-4 3.1-6.6 7-6.6s7 2.6 7 6.6z"/><path d="M14.5 13.6c3.6-.3 7 1.9 7 5.8v.6h-5c0-2.6-.8-4.8-2-6.4z" opacity=".85"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9h18v4H3zM4.5 13h6.5v8H4.5zM13 13h6.5v8H13zM11 9h2v12h-2z"/><path d="M12 9C9 9 6.5 8 6.5 6s2-2.5 3.5-1.6C11 5 12 7 12 9zm0 0c3 0 5.5-1 5.5-3S15.5 3.5 14 4.4C13 5 12 7 12 9z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 4l8 7-8 7v-4.2c-5.6 0-9.4 1.7-12 5.9C3 13.7 6.6 9.6 14 8.6z"/></svg>',
  };

  /** Colour, icon, phrase and pill per event (the neon look is themed by event, not platform). */
  function neonTheme(a) {
    var unit = a.amount && a.amount.unit;
    var amount = a.amount ? a.amount.display : '';
    var count = a.count || 1;
    var yt = a.platform === 'youtube';
    switch (a.type) {
      case 'follow':
        return { color: '#3df26b', icon: 'tile', crown: true, title: '¡Ahora te sigue!', pill: [ICON.heart, 'Follow'] };
      case 'subscription':
        return {
          color: '#a45cff', icon: 'tile', crown: true,
          title: a.months > 1 ? '¡Lleva <em>' + a.months + ' meses</em> suscrito!' : (yt ? '¡Ahora es miembro!' : '¡Se ha suscrito!'),
          pill: [ICON.star, yt ? 'Miembro' : 'Sub'],
        };
      case 'gift_sub':
        return { color: '#ff4fd8', icon: 'gift', title: '¡Regaló <em>' + fmt(count) + (yt ? ' membresías' : ' subs') + '</em>!', pill: [ICON.gift, 'Regalo'] };
      case 'donation':
        if (unit === 'currency') return { color: '#22c7ff', icon: 'coin', title: '¡Ha donado <em>' + escapeHtml(amount) + '</em>!', thanks: 'Gracias por tu apoyo' };
        if (unit === 'bits') return { color: '#b06bff', icon: 'gem', title: '¡Ha enviado <em>' + fmt(a.amount.value) + ' bits</em>!', thanks: '¡Gracias por el apoyo!' };
        if (unit === 'diamonds') {
          var gift = a.item && a.item.name ? escapeHtml(a.item.name) + (a.item.count > 1 ? ' x' + a.item.count : '') : fmt(a.amount.value) + ' 💎';
          return { color: '#ff3c8e', icon: a.item && a.item.image ? 'image' : 'gem', image: a.item && a.item.image, title: '¡Ha enviado <em>' + gift + '</em>!', thanks: fmt(a.amount.value) + ' 💎 · ¡Gracias!' };
        }
        if (unit === 'stars') return { color: '#ffc83a', icon: 'coin', coin: '★', title: '¡Ha enviado <em>' + escapeHtml(amount) + '</em>!', thanks: 'Gracias por tu apoyo' };
        return { color: '#3df26b', icon: 'coin', coin: 'K', title: '¡Ha enviado <em>' + escapeHtml(amount) + '</em>!', thanks: 'Gracias por tu apoyo' };
      case 'raid':
        if (a.platform === 'kick') return { color: '#2d8cff', icon: 'people', title: '¡Te está hosteando!', thanks: a.count ? 'con ' + fmt(a.count) + ' espectadores · Bienvenidos' : 'Bienvenido a la comunidad' };
        return { color: '#ff3b3b', icon: 'raid', title: '¡Está haciendo un raid!', thanks: a.count ? 'con ' + fmt(a.count) + ' espectadores 🔥' : '¡Bienvenidos! 🔥' };
      case 'share':
        return { color: '#19d3c5', icon: 'share', title: '¡Compartió tu live!', pill: [ICON.share, 'Share'] };
      case 'like':
        return { color: '#ff3c8e', icon: 'heart', title: '¡<em>' + fmt(a.count) + '</em> likes!', thanks: 'Gracias por el amor', noName: true };
      default:
        return { color: '#22c7ff', icon: 'heart', title: '¡Gracias!' };
    }
  }

  function renderNeon(a) {
    var p = window.PLATFORM_ICONS[a.platform] || { name: a.platform, color: '#666', fg: '#fff', svg: '' };
    var t = neonTheme(a);
    var user = a.user || {};
    var icon;
    if (t.icon === 'tile') {
      icon = '<div class="na-tile" style="--brand:' + p.color + ';--brand-fg:' + p.fg + '">' + p.svg + '</div>';
    } else if (t.icon === 'coin') {
      icon = '<div class="na-coin"><span>' + (t.coin || '$') + '</span></div>';
    } else if (t.icon === 'gem') {
      icon = '<div class="na-gem">' + ICON.gem + '</div>';
    } else if (t.icon === 'image') {
      icon = '<div class="na-round"><img src="' + escapeHtml(t.image) + '" alt="" /></div>';
    } else if (t.icon === 'raid') {
      icon = '<div class="na-hex"><span class="na-target">' + ICON.target + '</span><span class="na-glyph">' + ICON.people + '</span></div>';
    } else {
      icon = '<div class="na-round"><span class="na-glyph">' + (ICON[t.icon] || ICON.heart) + '</span></div>';
    }
    var message = settings.showMessage && a.message ? escapeHtml(a.message) : (t.thanks || '');
    var sub = message ? '<div class="na-sub">' + message + ' <span class="na-heart">' + ICON.heart + '</span></div>' : '';
    var pill = t.pill && settings.size !== 'compact'
      ? '<div class="na-pill"><span class="na-pill-icon">' + t.pill[0] + '</span>' + t.pill[1] + '</div>'
      : (settings.size === 'compact' ? '<span class="na-end-heart">' + ICON.heart + '</span>' : '');

    var node = document.createElement('div');
    node.className = 'alert na na--' + a.type + (settings.size === 'compact' ? ' na--compact' : '');
    node.style.setProperty('--c', t.color);
    node.innerHTML =
      '<div class="na-card">' +
        '<span class="na-spark na-spark--1"></span><span class="na-spark na-spark--2"></span><span class="na-spark na-spark--3"></span>' +
        '<div class="na-icon">' + (t.crown ? '<span class="na-crown">' + ICON.crown + '</span>' : '') + icon + '</div>' +
        '<div class="na-text">' +
          (t.noName ? '' : '<div class="na-name">' + escapeHtml(user.name || '') + '</div>') +
          '<div class="na-title">' + t.title + '</div>' +
          (settings.size === 'compact' ? '' : sub) +
        '</div>' +
        pill +
        '<span class="na-stripes"></span>' +
      '</div>';
    return node;
  }

  function render(a) {
    if (settings.style !== 'gta') return renderNeon(a);
    var p = window.PLATFORM_ICONS[a.platform] || { name: a.platform, color: '#666', fg: '#fff', svg: '' };
    var d = describe(a);
    var user = a.user || {};
    var avatar = user.avatar
      ? '<img class="alert-avatar" src="' + escapeHtml(user.avatar) + '" alt="" />'
      : '<span class="alert-avatar alert-avatar--logo">' + p.svg + '</span>';
    var message = settings.showMessage && a.message ? '<div class="alert-message">' + escapeHtml(a.message) + '</div>' : '';
    var itemImg = a.item && a.item.image ? '<img class="alert-item" src="' + escapeHtml(a.item.image) + '" alt="" />' : '';

    var node = document.createElement('div');
    node.className = 'alert alert--' + a.type + (d.money ? ' is-money' : ' is-respect');
    node.style.setProperty('--platform', a.platform === 'tiktok' ? '#fe2c55' : p.color);
    node.style.setProperty('--platform-fg', p.fg);
    node.innerHTML =
      '<div class="alert-glow"></div>' +
      '<div class="alert-card">' +
        '<div class="alert-badge"><span class="alert-platform">' + p.svg + '</span>' + escapeHtml(p.name) + '</div>' +
        '<div class="alert-title">' + escapeHtml(d.title) + '</div>' +
        (d.hideUser ? '' : '<div class="alert-user">' + avatar + '<span class="alert-name">' + escapeHtml(user.name || '') + '</span></div>') +
        (d.value ? '<div class="alert-value">' + itemImg + '<span>' + escapeHtml(d.value) + '</span></div>' : '') +
        (d.detail ? '<div class="alert-detail">' + escapeHtml(d.detail) + '</div>' : '') +
        message +
      '</div>';
    return node;
  }

  /** Sound for an event type: the user's upload, the style's sound, or none. */
  function soundUrlFor(type, s) {
    s = s || settings;
    if (s.sound === 'off') return '';
    var entry = (s.sounds || {})[type] || {};
    if (entry.mode === 'off') return '';
    if (entry.mode === 'custom' && entry.file) {
      return '/api/alerts/sound/' + encodeURIComponent(username) + '/' + type + '?v=' + encodeURIComponent(entry.file + (s.updatedAt || ''));
    }
    return '/assets/sounds/alerts/' + (s.style === 'gta' ? 'gta' : 'default') + '.mp3';
  }

  function playSound(alert) {
    var url = soundUrlFor(alert.type);
    if (!url) return;
    if (inEditor) {
      if (window.parent !== window && typeof window.parent.onAlertSound === 'function') window.parent.onAlertSound(url, settings.volume, alert.type);
      return;
    }
    if (sfx.getAttribute('src') !== url) sfx.src = url;
    sfx.volume = Math.min(1, Math.max(0, (Number(settings.volume) || 0) / 100));
    sfx.currentTime = 0;
    sfx.play().catch(function () { /* autoplay blocked outside OBS */ });
  }

  /* ── queue ───────────────────────────────────────────────────── */

  function enqueue(raw) {
    var alert = accept(raw);
    if (!alert) return;
    if (queue.length >= MAX_QUEUE) {
      // keep donations/subs/raids; shed the noisy ones first
      var i = queue.findIndex(function (q) { return LOW_PRIORITY[q.type]; });
      if (i === -1) return;
      queue.splice(i, 1);
    }
    queue.push(alert);
    next();
  }

  function next() {
    if (busy || !queue.length) return;
    busy = true;
    var alert = queue.shift();
    var node = render(alert);
    stage.innerHTML = '';
    stage.appendChild(node);
    playSound(alert);
    var hold = Math.max(2, Number(settings.duration) || 6) * 1000;
    setTimeout(function () {
      node.classList.add('is-leaving');
      setTimeout(function () {
        node.remove();
        busy = false;
        setTimeout(next, 400);
      }, 700);
    }, hold);
  }

  // Editor hooks
  window.setAlertSettings = applySettings;
  window.alertSoundUrl = function (type, s) { return soundUrlFor(type, Object.assign({}, settings, s || {})); };
  window.clearAlerts = function () { queue = []; stage.innerHTML = ''; busy = false; };

  var es = new EventSource('/api/alerts/stream?username=' + encodeURIComponent(username));
  es.onmessage = function (event) {
    var data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type === 'alert-settings' && !window.__editorOverrides) applySettings(data.settings);
    else if (data.type === 'alert') enqueue(data.alert);
    if (window.parent !== window && typeof window.parent.onAlertEvent === 'function') window.parent.onAlertEvent(data);
  };

  fetch('/api/alerts?username=' + encodeURIComponent(username))
    .then(function (r) { return r.json(); })
    .then(function (s) { if (!window.__editorOverrides) applySettings(s); })
    .catch(function () {});
})();
