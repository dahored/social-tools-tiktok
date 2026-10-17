/* ── GTA scene transition ──────────────────────────────────────────────
   Shared by the live OBS overlay (overlay.html) and the HyperFrames video
   render (video/render-transition.mjs). Builds the DOM inside `root` and
   returns a paused GSAP timeline.

   Look: Vice City sunset poster — pastel sky, palm silhouettes framing the
   corners, seagulls, logo in a rounded box with spaced caps underneath. */
(function () {
  'use strict';

  // Read by video/render-transition.mjs — keep as plain number literals
  var DURATION  = 2.2;
  var CUT_POINT = 1.0;

  var OFF_RIGHT = 2900;
  var OFF_LEFT  = -3100;

  function el(tag, className, parent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  function fmt(n) { return Math.round(n * 10) / 10; }

  /** Shrinks a text line until it fits (long channel names). */
  function fitLine(node, maxWidth, baseSize) {
    node.style.fontSize = baseSize + 'px';
    var width = node.scrollWidth;
    if (width > maxWidth) node.style.fontSize = Math.floor(baseSize * maxWidth / width) + 'px';
  }

  /* ── Palms ─────────────────────────────────────────────────────────
     Each palm is drawn in frame coordinates (1920×1080, or 1080×1920 when
     vertical) so it can be
     placed by its trunk base and crown. Fronds are drooping spines with
     dense leaflets that merge into a silhouette but keep a comb edge. */

  function quad(a, c, b, t) {
    var u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }

  /** Returns { spine, leaflets } path data for one drooping frond. */
  function frondPath(crown, deg, len, droop, size) {
    var a = deg * Math.PI / 180;
    var spine = [];
    var steps = 24;
    for (var j = 0; j <= steps; j++) {
      var t = j / steps;
      spine.push({
        x: crown.x + Math.cos(a) * len * t,
        y: crown.y + Math.sin(a) * len * t + droop * t * t,
        t: t,
      });
    }

    var leaflets = '';
    for (var n = 2; n < spine.length; n++) {
      var p = spine[n], prev = spine[n - 1];
      var dx = p.x - prev.x, dy = p.y - prev.y;
      var m = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / m, uy = dy / m, nx = -uy, ny = ux;
      var L = size * (0.3 + 0.9 * Math.sin(Math.PI * Math.min(p.t * 1.08, 1)));
      for (var side = -1; side <= 1; side += 2) {
        // leaflets hang mostly downward, fanned slightly to each side
        var vx = ux * 0.45 + nx * side * 0.38;
        var vy = uy * 0.45 + ny * side * 0.38 + 0.85;
        var vm = Math.sqrt(vx * vx + vy * vy);
        var ex = p.x + vx / vm * L, ey = p.y + vy / vm * L;
        leaflets += 'M' + fmt(p.x) + ' ' + fmt(p.y) +
          ' Q' + fmt((p.x + ex) / 2 + nx * side * 8) + ' ' + fmt((p.y + ey) / 2 - 6) +
          ' ' + fmt(ex) + ' ' + fmt(ey) + ' ';
      }
    }
    return {
      spine: 'M' + spine.map(function (q) { return fmt(q.x) + ' ' + fmt(q.y); }).join(' L'),
      leaflets: leaflets,
    };
  }

  function palmSvg(palm, W, H) {
    var paths = '';

    // Tapered, slightly bumpy trunk from base to crown
    var left = [], right = [];
    for (var i = 0; i <= 30; i++) {
      var t = i / 30;
      var p = quad(palm.base, palm.bend, palm.crown, t);
      var w = palm.trunk * (1 - 0.45 * t) + (i % 3 === 0 ? 2.5 : 0);
      left.push(fmt(p.x - w) + ',' + fmt(p.y));
      right.unshift(fmt(p.x + w) + ',' + fmt(p.y));
    }
    paths += '<polygon points="' + left.concat(right).join(' ') + '"/>';

    palm.fronds.forEach(function (f) {
      var frond = frondPath(palm.crown, f[0], f[1], f[2], palm.leaf);
      paths += '<path d="' + frond.spine + '" fill="none" stroke="currentColor" stroke-width="' +
        palm.stroke * 1.6 + '" stroke-linecap="round" stroke-linejoin="round"/>';
      paths += '<path d="' + frond.leaflets + '" fill="none" stroke="currentColor" stroke-width="' +
        palm.stroke + '" stroke-linecap="round"/>';
    });
    paths += '<circle cx="' + palm.crown.x + '" cy="' + palm.crown.y + '" r="' + palm.trunk * 1.6 + '"/>';

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" ' +
      'xmlns="http://www.w3.org/2000/svg" fill="currentColor">' + paths + '</svg>';
  }

  // [angle°, length, droop] — 0° points right, 90° down
  var PALMS = [
    { // big palm, top-left corner
      cls: 'gta-palm--l',
      base: { x: -40, y: 1180 }, bend: { x: 260, y: 600 }, crown: { x: 150, y: 120 },
      trunk: 26, leaf: 120, stroke: 7,
      fronds: [[-5, 560, 260], [25, 520, 240], [55, 430, 200], [85, 360, 120], [120, 380, 160],
               [160, 420, 220], [195, 360, 200], [230, 300, 180], [265, 260, 230], [300, 330, 260], [330, 470, 270]],
    },
    { // smaller palm, bottom-left
      cls: 'gta-palm--l2',
      base: { x: 180, y: 1180 }, bend: { x: 290, y: 1000 }, crown: { x: 330, y: 790 },
      trunk: 16, leaf: 80, stroke: 5,
      fronds: [[-15, 330, 170], [20, 300, 160], [60, 230, 110], [120, 240, 120], [165, 300, 160],
               [205, 260, 160], [250, 200, 170], [290, 220, 180], [325, 290, 190]],
    },
    { // big palm, top-right corner
      cls: 'gta-palm--r',
      base: { x: 1700, y: 1180 }, bend: { x: 1640, y: 560 }, crown: { x: 1800, y: 90 },
      trunk: 24, leaf: 115, stroke: 7,
      fronds: [[185, 560, 260], [155, 520, 250], [125, 430, 200], [95, 340, 120], [60, 360, 150],
               [20, 380, 200], [-15, 340, 210], [-50, 300, 200], [-85, 250, 230], [-120, 330, 260], [-150, 470, 270]],
    },
  ];

  /** Mirrors a palm horizontally inside a frame of width W (for the vertical layout). */
  function mirror(palm, W, overrides) {
    var flip = function (p) { return { x: W - p.x, y: p.y }; };
    return Object.assign({}, palm, {
      base: flip(palm.base), bend: flip(palm.bend), crown: flip(palm.crown),
      fronds: palm.fronds.map(function (f) { return [180 - f[0], f[1], f[2]]; }),
    }, overrides || {});
  }

  // Vertical (1080×1920): tall palms hug both sides, a small pair at the bottom
  var PALM_L_TALL = {
    cls: 'gta-palm--l',
    base: { x: -80, y: 2020 }, bend: { x: 230, y: 1100 }, crown: { x: 110, y: 240 },
    trunk: 26, leaf: 120, stroke: 7, fronds: PALMS[0].fronds,
  };
  var PALM_L_LOW = {
    cls: 'gta-palm--l2',
    base: { x: 60, y: 2020 }, bend: { x: 170, y: 1800 }, crown: { x: 210, y: 1560 },
    trunk: 16, leaf: 80, stroke: 5, fronds: PALMS[1].fronds,
  };
  var PALMS_VERTICAL = [
    PALM_L_TALL,
    PALM_L_LOW,
    mirror(PALM_L_TALL, 1080, { cls: 'gta-palm--r', crown: { x: 990, y: 150 } }),
    mirror(PALM_L_LOW, 1080, { cls: 'gta-palm--l2', crown: { x: 900, y: 1660 } }),
  ];

  var GULL = '<svg viewBox="0 0 60 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 18 Q15 2 30 16 Q45 2 58 18" ' +
    'fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function mount(root, vars) {
    vars = vars || {};
    root.innerHTML = '';

    var vertical = vars.orientation === 'vertical';
    var W = vertical ? 1080 : 1920;
    var H = vertical ? 1920 : 1080;

    var wrap = el('div', 'gta' + (vertical ? ' is-vertical' : ''), root);
    if (vars.accent) wrap.style.setProperty('--accent', vars.accent);

    var bands = [
      el('div', 'gta-panel gta-band--1', wrap),
      el('div', 'gta-panel gta-band--2', wrap),
      el('div', 'gta-panel gta-band--3', wrap),
    ];

    var cover = el('div', 'gta-panel gta-cover', wrap);
    var inner = el('div', 'gta-cover-inner', cover);

    // Scenery lives in a screen-sized frame (the panel is wider than the screen)
    var frame = el('div', 'gta-frame', inner);
    el('div', 'gta-sky-tint', frame);
    el('div', 'gta-clouds', frame);

    var palms = (vertical ? PALMS_VERTICAL : PALMS).map(function (palm) {
      var node = el('div', 'gta-palm ' + palm.cls, frame);
      node.innerHTML = palmSvg(palm, W, H);
      node.style.transformOrigin = palm.base.x + 'px ' + palm.base.y + 'px';
      return node;
    });

    var gullSpots = vertical ? [[640, 560, 1], [695, 530, .75], [730, 588, .6]] : [[1340, 640, 1], [1395, 610, .75], [1430, 668, .6]];
    var gulls = gullSpots.map(function (g) {
      var node = el('div', 'gta-gull', frame);
      node.innerHTML = GULL;
      node.style.left = g[0] + 'px';
      node.style.top = g[1] + 'px';
      node.style.width = 60 * g[2] + 'px';
      return node;
    });

    // Centre piece (vertically centred): striped sun + glass logo box, optional gradient name
    var line1 = String(vars.line1 || '').trim().toUpperCase();
    var line2 = String(vars.line2 || '').trim().toUpperCase();
    var hasImage = vars.logoMode === 'image' && vars.logoUrl;

    var logo   = el('div', 'gta-logo' + (line1 || line2 ? '' : ' is-solo'), frame);
    var emblem = el('div', 'gta-emblem', logo);
    var sun    = el('div', 'gta-sun', emblem);
    var box    = null;
    var shine  = null;
    if (hasImage || line1) {
      box = el('div', 'gta-box', emblem);
      var glass = el('div', 'gta-box-glass', box);
      if (hasImage) {
        var img = el('img', '', glass);
        img.src = vars.logoUrl;
        img.alt = '';
      } else {
        el('span', 'gta-box-letter', glass).textContent = line1.charAt(0);
      }
      shine = el('div', 'gta-box-shine', box);
    }

    // Small caption above the big name
    var caption = null;
    if (line2) {
      caption = el('div', 'gta-caption', logo);
      el('span', '', caption).textContent = line2;
    }

    var name = null;
    if (line1) {
      // Outline copy underneath, gradient copy on top (sibling order = paint order)
      name = el('div', 'gta-name', logo);
      el('span', 'gta-name-outline', name).textContent = line1;
      el('span', 'gta-name-fill', name).textContent = line1;
      var fitName = function () { fitLine(name, W - 160, 156); };
      fitName();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitName);
    }

    // Twinkles placed around the emblem centre
    var sparkles = [[-260, -120, 1], [240, -150, .7], [280, 90, .9], [-300, 140, .6], [30, -230, .5]].map(function (sp) {
      var node = el('div', 'gta-sparkle', emblem);
      node.style.left = 'calc(50% + ' + sp[0] + 'px)';
      node.style.top = 'calc(50% + ' + sp[1] + 'px)';
      node.style.setProperty('--size', 46 * sp[2] + 'px');
      return node;
    });

    var flash = el('div', 'gta-flash', wrap);

    var tl = gsap.timeline({ paused: true });

    // In — colour bands sweep from the right, cover lands on top
    bands.concat(cover).forEach(function (panel, i) {
      tl.fromTo(panel, { x: OFF_RIGHT }, { x: 0, duration: 0.45, ease: 'power4.out' }, i * 0.07);
    });
    tl.fromTo(flash, { opacity: 0.7 }, { opacity: 0, duration: 0.35, ease: 'power2.out' }, 0.42);

    // Palms sway in the breeze, gulls glide across
    palms.forEach(function (palm, i) {
      tl.fromTo(palm, { rotation: i % 2 ? -1.2 : 1.2 }, { rotation: i % 2 ? 0.8 : -0.8, duration: 1.4, ease: 'sine.inOut' }, 0.2);
    });
    gulls.forEach(function (gull, i) {
      tl.fromTo(gull, { x: -40, y: 10 }, { x: 140, y: -30, duration: 1.4, ease: 'none' }, 0.2);
      tl.fromTo(gull, { scaleY: 1 }, { scaleY: 0.45, duration: 0.18, repeat: 7, yoyo: true, ease: 'sine.inOut' }, 0.2 + i * 0.06);
    });

    // Sun rises, box drops in, name snaps into focus
    tl.fromTo(sun, { y: 220, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: 'power3.out' }, 0.25);
    if (box) {
      tl.fromTo(box, { y: -120, rotation: -14, scale: 0.7, opacity: 0 },
        { y: 0, rotation: -4, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.8)' }, 0.36);
      tl.fromTo(shine, { x: -420 }, { x: 420, duration: 0.6, ease: 'power2.inOut' }, 0.8);
    }
    if (caption) {
      tl.fromTo(caption, { y: 24, opacity: 0, letterSpacing: '0.7em' },
        { y: 0, opacity: 1, letterSpacing: '0.32em', duration: 0.4, ease: 'power3.out' }, 0.46);
    }
    if (name) {
      tl.fromTo(name, { scale: 1.5, opacity: 0, filter: 'blur(14px)' },
        { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.38, ease: 'power3.out' }, 0.5);
    }
    sparkles.forEach(function (sp, i) {
      tl.fromTo(sp, { scale: 0, rotation: 0, opacity: 0 },
        { scale: 1, rotation: 90, opacity: 1, duration: 0.3, ease: 'back.out(3)', yoyo: true, repeat: 1, repeatDelay: 0.25 },
        0.6 + i * 0.12);
    });
    tl.to(logo, { scale: 1.04, duration: 0.8, ease: 'power1.inOut' }, 0.7);

    // Out — cover leaves first, bands follow, revealing the new scene
    [cover].concat(bands.slice().reverse()).forEach(function (panel, i) {
      tl.to(panel, { x: OFF_LEFT, duration: 0.45, ease: 'power4.in' }, 1.45 + i * 0.07);
    });

    return tl;
  }

  window.SceneTransitions = window.SceneTransitions || {};
  window.SceneTransitions.gta = {
    label:    'GTA',
    duration: DURATION,
    /** Seconds at which the screen is fully covered — use as OBS Stinger "transition point". */
    cutPoint: CUT_POINT,
    mount:    mount,
  };
})();
