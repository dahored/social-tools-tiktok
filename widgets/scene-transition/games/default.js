/* ── Default scene transition (no game) ────────────────────────────────
   Clean, modern look driven by the accent colour: dark glass cover with
   soft glows and a subtle grid, logo in a glowing box, name + pill tag.
   Same contract as games/gta.js: mount(root, vars) → paused GSAP timeline. */
(function () {
  'use strict';

  // Read by video/render-transition.mjs — keep as plain number literals
  var DURATION  = 2.0;
  var CUT_POINT = 0.9;

  var OFF_RIGHT = 2900;
  var OFF_LEFT  = -3100;

  function el(tag, className, parent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  function fitLine(node, maxWidth, baseSize) {
    node.style.fontSize = baseSize + 'px';
    var width = node.scrollWidth;
    if (width > maxWidth) node.style.fontSize = Math.floor(baseSize * maxWidth / width) + 'px';
  }

  function hexToRgb(hex) {
    var n = parseInt(String(hex || '#ff3c8e').replace('#', ''), 16);
    return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
  }

  function mount(root, vars) {
    vars = vars || {};
    root.innerHTML = '';

    var vertical = vars.orientation === 'vertical';
    var wrap = el('div', 'dft' + (vertical ? ' is-vertical' : ''), root);
    var accent = vars.accent || '#ff3c8e';
    wrap.style.setProperty('--accent', accent);
    wrap.style.setProperty('--accent-rgb', hexToRgb(accent));

    var bands = [
      el('div', 'dft-panel dft-band--1', wrap),
      el('div', 'dft-panel dft-band--2', wrap),
    ];

    var cover = el('div', 'dft-panel dft-cover', wrap);
    var inner = el('div', 'dft-cover-inner', cover);
    var frame = el('div', 'dft-frame', inner);
    el('div', 'dft-grid', frame);
    var glowA = el('div', 'dft-glow dft-glow--a', frame);
    var glowB = el('div', 'dft-glow dft-glow--b', frame);
    var sweep = el('div', 'dft-sweep', frame);

    var line1 = String(vars.line1 || '').trim();
    var line2 = String(vars.line2 || '').trim();
    var hasImage = vars.logoMode === 'image' && vars.logoUrl;

    var logo = el('div', 'dft-logo' + (line1 || line2 ? '' : ' is-solo'), frame);
    var box  = null;
    if (hasImage || line1) {
      box = el('div', 'dft-box', logo);
      if (hasImage) {
        var img = el('img', '', box);
        img.src = vars.logoUrl;
        img.alt = '';
      } else {
        box.classList.add('dft-box--letter');
        box.textContent = line1.charAt(0).toUpperCase();
      }
    }

    var caption = null;
    if (line2) {
      caption = el('div', 'dft-caption', logo);
      caption.textContent = line2.toUpperCase();
    }

    var name = null;
    if (line1) {
      name = el('div', 'dft-name', logo);
      name.textContent = line1;
      fitLine(name, vertical ? 940 : 1400, vertical ? 128 : 104);
    }

    var tl = gsap.timeline({ paused: true });

    // In — two bands then the cover sweep from the right
    bands.concat(cover).forEach(function (panel, i) {
      tl.fromTo(panel, { x: OFF_RIGHT }, { x: 0, duration: 0.42, ease: 'power4.out' }, i * 0.07);
    });

    tl.fromTo(glowA, { x: -120, y: 40 }, { x: 80, y: -30, duration: 1.4, ease: 'sine.inOut' }, 0.15);
    tl.fromTo(glowB, { x: 120, y: -40 }, { x: -60, y: 30, duration: 1.4, ease: 'sine.inOut' }, 0.15);
    tl.fromTo(sweep, { x: -1400 }, { x: 1400, duration: 0.9, ease: 'power2.inOut' }, 0.45);

    if (box)  tl.fromTo(box, { scale: 0.5, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.42, ease: 'back.out(1.8)' }, 0.32);
    if (caption) tl.fromTo(caption, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.34, ease: 'power3.out' }, 0.4);
    if (name) tl.fromTo(name, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: 'power3.out' }, 0.44);
    tl.to(logo, { scale: 1.03, duration: 0.7, ease: 'power1.inOut' }, 0.7);

    // Out — cover leaves first, bands follow
    [cover].concat(bands.slice().reverse()).forEach(function (panel, i) {
      tl.to(panel, { x: OFF_LEFT, duration: 0.42, ease: 'power4.in' }, 1.36 + i * 0.07);
    });

    return tl;
  }

  window.SceneTransitions = window.SceneTransitions || {};
  window.SceneTransitions['default'] = {
    label:    'Default',
    duration: DURATION,
    cutPoint: CUT_POINT,
    mount:    mount,
  };
})();
