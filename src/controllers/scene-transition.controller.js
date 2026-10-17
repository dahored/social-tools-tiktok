'use strict';

const service = require('../services/scene-transition.service');

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

async function uploadLogo(req, res) {
  try {
    res.json(await service.saveLogo(req.body?.username, req.body?.dataUrl));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getLogo(req, res) {
  try {
    const file = await service.getLogoPath(req.params.username);
    if (!file) return res.status(404).json({ error: 'No logo uploaded' });
    res.sendFile(file, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No logo uploaded' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    if (!file) return res.status(404).json({ error: 'No custom sound uploaded' });
    res.sendFile(file, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No custom sound uploaded' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listVideos(req, res) {
  try {
    res.json({ videos: await service.listVideos(req.query.username) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteVideo(req, res) {
  try {
    const deleted = await service.deleteVideo(req.query.username, req.params.file);
    if (!deleted) return res.status(404).json({ error: 'Video not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

function play(req, res) {
  res.json(service.play(req.query.username || req.body?.username));
}

function stream(req, res) {
  const username = service.sanitizeUsername(req.query.username);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  service.registerSseClient(username, res);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    service.unregisterSseClient(username, res);
  });
}

function requestRender(req, res) {
  try {
    res.status(202).json(service.requestRender(req.body?.username, req.body?.format, req.body?.orientation));
  } catch (err) {
    if (err.code === 'NO_WORKER') {
      return res.status(503).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
}

function getRenderJob(req, res) {
  const job = service.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
}

function updateRenderJob(req, res) {
  const job = service.updateJob(req.params.id, req.body || {});
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
}

function workerStatus(req, res) {
  res.json({ workers: service.workerCount() });
}

function workerStream(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  service.registerWorker(res);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    service.unregisterWorker(res);
  });
}

module.exports = {
  getSettings,
  saveSettings,
  uploadLogo,
  getLogo,
  uploadSound,
  getSound,
  listVideos,
  deleteVideo,
  play,
  stream,
  requestRender,
  getRenderJob,
  updateRenderJob,
  workerStatus,
  workerStream,
};
