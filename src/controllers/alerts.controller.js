'use strict';

const service = require('../services/alerts.service');

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

function sendTest(req, res) {
  const q = { ...req.body, ...req.query };
  res.json(service.sendTest(q.username, q.type, q.platform));
}

async function uploadSound(req, res) {
  try {
    res.json(await service.uploadSound(req.body?.username, req.body?.type, req.body?.dataUrl));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getSound(req, res) {
  try {
    const file = await service.getSoundPath(req.params.username, req.params.type);
    if (!file) return res.status(404).json({ error: 'No custom sound' });
    res.sendFile(file, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'No custom sound' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getSettings, saveSettings, sendTest, uploadSound, getSound };
