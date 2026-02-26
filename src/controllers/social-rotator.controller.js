'use strict';

const service = require('../services/social-rotator.service');

async function getSettings(req, res) {
  try {
    const username = req.query.username || 'default';
    res.json(await service.getSettings(username));
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

module.exports = { getSettings, saveSettings };
