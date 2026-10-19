'use strict';

const service = require('../services/channels.service');

async function get(req, res) {
  try {
    res.json(await service.get(req.query.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function save(req, res) {
  try {
    res.json(await service.save({ username: 'default', ...req.body }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { get, save };
