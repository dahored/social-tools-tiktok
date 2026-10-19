'use strict';

const service = require('../services/chat-overlay.service');

async function getSettings(req, res) {
  try {
    res.json(await service.getSettings(req.query.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function saveSettings(req, res) {
  try {
    res.json(await service.saveSettings({ username: 'default', ...req.body }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function stream(req, res) {
  const username = service.sanitizeUsername(req.query.username);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(keepAlive);
    service.unsubscribe(username, res);
  });

  try {
    await service.subscribe(username, res);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
  }
}

function sendTest(req, res) {
  res.json(service.sendTest(req.query.username || req.body?.username, req.query.platform || req.body?.platform));
}

async function uploadSound(req, res) {
  try {
    res.json(await service.saveSound(req.body?.username, req.body?.dataUrl));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getSound(req, res) {
  try {
    const file = await service.getSoundPath(req.params.username);
    if (!file) return res.status(404).json({ error: 'No custom sound' });
    res.sendFile(file, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No custom sound' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ── Facebook ─────────────────────────────────────────────────────────── */

function origin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function facebookStatus(req, res) {
  try {
    res.json(await service.facebookStatus(req.query.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function facebookLogin(req, res) {
  try {
    res.json({ url: service.facebookLoginUrl(req.body?.username, origin(req)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/** OAuth redirect target: tells the editor popup's opener and closes itself. */
async function facebookCallback(req, res) {
  let ok = false;
  let message;
  let username = 'default';
  try {
    if (req.query.error) throw new Error(req.query.error_description || 'Conexión cancelada');
    username = await service.facebookCallback({ code: req.query.code, state: req.query.state, origin: origin(req) });
    ok = true;
    message = 'Facebook conectado. Puedes cerrar esta ventana.';
  } catch (err) {
    message = err.message;
  }
  const back = `/channels.html?username=${encodeURIComponent(username)}`;
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Facebook</title>
<body style="font-family:system-ui;background:#0a0a0f;color:#f0f0f5;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px;padding:24px">
<p style="font-size:1.1rem">${ok ? '✅' : '⚠️'} ${escapeHtml(message)}</p>
<p><a style="color:#00f2ea" href="${back}">Volver a Mis canales</a></p></div>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'facebook-connected', ok: ${ok}, message: ${JSON.stringify(message)} }, window.location.origin);
    ${ok ? 'setTimeout(function () { window.close(); }, 800);' : ''}
  }
</script></body>`);
}

async function facebookSelectPage(req, res) {
  try {
    res.json(await service.facebookSelectPage(req.body?.username, req.body?.pageId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function facebookDisconnect(req, res) {
  try {
    res.json(await service.facebookDisconnect(req.body?.username));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  getSettings,
  saveSettings,
  stream,
  sendTest,
  uploadSound,
  getSound,
  facebookStatus,
  facebookLogin,
  facebookCallback,
  facebookSelectPage,
  facebookDisconnect,
};
