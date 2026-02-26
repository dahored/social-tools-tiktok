(function () {
  'use strict';

  /* Skip in OBS preview mode */
  if (new URLSearchParams(window.location.search).get('preview') === 'true') return;

  /* ── Styles ─────────────────────────────────────────────────── */
  var styleEl = document.createElement('style');
  styleEl.id  = 'nb-style';
  styleEl.textContent = [
    /* Navbar bar */
    '#app-navbar{',
      'position:fixed;top:0;left:0;right:0;z-index:1000;',
      'height:60px;',
      'background:rgba(10,10,15,.92);',
      'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
      'border-bottom:1px solid #2a2a38;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    '}',
    '.nb-inner{',
      'max-width:1040px;width:94%;margin:0 auto;height:100%;',
      'display:flex;align-items:center;gap:0;',
    '}',
    /* Logo */
    'a.nb-brand{',
      'display:flex;align-items:center;gap:10px;',
      'text-decoration:none;color:#f0f0f5;flex-shrink:0;',
      'margin-right:28px;',
    '}',
    '.nb-brand-icon{',
      'width:32px;height:32px;border-radius:8px;',
      'background:linear-gradient(135deg,#ff0050,#c400d6);',
      'display:flex;align-items:center;justify-content:center;',
      'font-size:.95rem;box-shadow:0 0 14px rgba(255,0,80,.25);flex-shrink:0;',
    '}',
    '.nb-brand-name{',
      'font-size:.92rem;font-weight:700;letter-spacing:-.01em;white-space:nowrap;',
    '}',
    /* Nav links (desktop) */
    'ul.nb-links{',
      'display:flex;align-items:center;gap:2px;list-style:none;padding:0;margin:0;',
    '}',
    'a.nb-link{',
      'display:inline-flex;align-items:center;',
      'padding:7px 14px;border-radius:999px;',
      'text-decoration:none;font-size:.85rem;font-weight:500;',
      'color:#a0a0b8;transition:background .15s,color .15s;white-space:nowrap;',
    '}',
    'a.nb-link:hover{background:rgba(240,240,245,.06);color:#f0f0f5;}',
    'a.nb-link.nb-active{background:rgba(0,242,234,.09);color:#00f2ea;}',
    /* Push auth to right */
    '.nb-spacer{flex:1;min-width:8px;}',
    /* Auth area */
    '.nb-auth{display:flex;align-items:center;gap:8px;flex-shrink:0;}',
    '.nb-chip{display:inline-flex;align-items:center;gap:7px;font-size:.8rem;color:#a0a0b8;}',
    '.nb-chip-name{white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;}',
    '.nb-avatar{',
      'width:28px;height:28px;border-radius:50%;',
      'background:linear-gradient(135deg,#ff0050,#c400d6);',
      'display:flex;align-items:center;justify-content:center;',
      'font-size:.65rem;font-weight:700;color:#fff;flex-shrink:0;',
      'border:1.5px solid rgba(255,0,80,.3);',
    '}',
    '.nb-role{',
      'font-size:.65rem;padding:2px 7px;border-radius:999px;font-weight:600;',
      'background:rgba(0,242,234,.08);border:1px solid rgba(0,242,234,.2);color:#00f2ea;',
    '}',
    /* Buttons */
    '.nb-btn{',
      'display:inline-flex;align-items:center;gap:5px;',
      'text-decoration:none;font-size:.8rem;font-weight:600;',
      'padding:6px 14px;border-radius:999px;',
      'border:1px solid transparent;cursor:pointer;',
      'transition:background .15s,border-color .15s;',
      'font-family:inherit;white-space:nowrap;',
    '}',
    '.nb-btn-signin{background:rgba(255,0,80,.08);border-color:rgba(255,0,80,.25);color:#ff6080;}',
    '.nb-btn-signin:hover{background:rgba(255,0,80,.15);}',
    '.nb-btn-out{background:#18181f;border-color:#2a2a38;color:#a0a0b8;}',
    '.nb-btn-out:hover{background:#1f1f28;border-color:#35354a;color:#f0f0f5;}',
    /* Hamburger (mobile) */
    '.nb-ham{',
      'display:none;background:none;border:none;cursor:pointer;',
      'padding:8px 6px;color:#a0a0b8;flex-shrink:0;margin-left:8px;',
      'transition:color .15s;',
    '}',
    '.nb-ham:hover{color:#f0f0f5;}',
    '.nb-ham-icon{display:flex;flex-direction:column;gap:5px;}',
    '.nb-ham-line{display:block;width:22px;height:2px;background:currentColor;border-radius:2px;transition:transform .2s,opacity .2s;}',
    /* Mobile drawer */
    '#nb-drawer{',
      'display:none;position:fixed;top:60px;left:0;right:0;z-index:999;',
      'background:#111118;border-bottom:1px solid #2a2a38;',
      'padding:12px 20px 18px;flex-direction:column;gap:4px;',
    '}',
    '#nb-drawer.nb-open{display:flex;}',
    '#nb-drawer a.nb-link{',
      'padding:10px 14px;border-radius:10px;justify-content:flex-start;',
    '}',
    '.nb-drawer-divider{',
      'height:1px;background:#2a2a38;margin:8px 0;',
    '}',
    '.nb-drawer-auth{',
      'display:flex;align-items:center;justify-content:space-between;',
      'gap:8px;padding-top:4px;flex-wrap:wrap;',
    '}',
    /* Responsive */
    '@media(max-width:680px){',
      'ul.nb-links{display:none!important;}',
      '.nb-auth{display:none!important;}',
      '.nb-ham{display:flex!important;}',
      '.nb-brand-name{font-size:.82rem;}',
    '}',
  ].join('');
  document.head.appendChild(styleEl);

  /* ── Config: nav links ──────────────────────────────────────── */
  var NAV_LINKS = [
    { label: 'Widget Hub', href: '/' },
  ];

  var path = window.location.pathname;

  function isActive(href) {
    if (href === '/') return path === '/' || path === '/index.html';
    var base = href.replace('/index.html', '');
    return path === href || path.startsWith(base + '/') || path === base;
  }

  function buildLinks(li) {
    return NAV_LINKS.map(function (l) {
      var cls = 'nb-link' + (isActive(l.href) ? ' nb-active' : '');
      var tag = li ? '<li>' : '';
      var close = li ? '</li>' : '';
      return tag + '<a class="' + cls + '" href="' + l.href + '">' + l.label + '</a>' + close;
    }).join('');
  }

  /* ── Auth state ─────────────────────────────────────────────── */
  var token = localStorage.getItem('stt_token');
  var user  = {};
  try { user = JSON.parse(localStorage.getItem('stt_user') || '{}'); } catch {}

  function buildAuthHtml() {
    if (token) {
      var initials = (user.name || 'U')
        .split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      var roleLower = (user.role || '').replace('_', ' ');
      return (
        '<span class="nb-chip">' +
          '<span class="nb-avatar">' + initials + '</span>' +
          '<span class="nb-chip-name">' + (user.name || 'User') + '</span>' +
          '<span class="nb-role">' + roleLower + '</span>' +
        '</span>' +
        '<button class="nb-btn nb-btn-out nb-signout-btn">Sign out</button>'
      );
    }
    return '<a class="nb-btn nb-btn-signin" href="/login.html">Sign in</a>';
  }

  /* ── Build DOM ──────────────────────────────────────────────── */
  var nav = document.createElement('nav');
  nav.id  = 'app-navbar';
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML =
    '<div class="nb-inner">' +
      '<a class="nb-brand" href="/">' +
        '<div class="nb-brand-icon">🎬</div>' +
        '<span class="nb-brand-name">Social Tools TikTok</span>' +
      '</a>' +
      '<ul class="nb-links">' + buildLinks(true) + '</ul>' +
      '<div class="nb-spacer"></div>' +
      '<div class="nb-auth">' + buildAuthHtml() + '</div>' +
      '<button class="nb-ham" id="nb-ham" aria-label="Open menu" aria-expanded="false">' +
        '<span class="nb-ham-icon">' +
          '<span class="nb-ham-line"></span>' +
          '<span class="nb-ham-line"></span>' +
          '<span class="nb-ham-line"></span>' +
        '</span>' +
      '</button>' +
    '</div>';

  var drawer = document.createElement('div');
  drawer.id  = 'nb-drawer';
  drawer.innerHTML =
    buildLinks(false) +
    '<div class="nb-drawer-divider"></div>' +
    '<div class="nb-drawer-auth">' + buildAuthHtml() + '</div>';

  /* ── Mount ──────────────────────────────────────────────────── */
  function mount() {
    document.body.insertBefore(drawer, document.body.firstChild);
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.style.paddingTop = '60px';

    /* Sign-out handlers (navbar + drawer) */
    document.querySelectorAll('.nb-signout-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        localStorage.removeItem('stt_token');
        localStorage.removeItem('stt_user');
        window.location.replace('/login.html');
      });
    });

    /* Hamburger toggle */
    var ham    = document.getElementById('nb-ham');
    var drw    = document.getElementById('nb-drawer');
    var isOpen = false;

    if (ham && drw) {
      ham.addEventListener('click', function () {
        isOpen = !isOpen;
        drw.classList.toggle('nb-open', isOpen);
        ham.setAttribute('aria-expanded', String(isOpen));
      });

      /* Close on backdrop click */
      document.addEventListener('click', function (e) {
        if (isOpen && !nav.contains(e.target) && !drw.contains(e.target)) {
          isOpen = false;
          drw.classList.remove('nb-open');
          ham.setAttribute('aria-expanded', 'false');
        }
      });

      /* Close on nav link click */
      drw.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          isOpen = false;
          drw.classList.remove('nb-open');
          ham.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
