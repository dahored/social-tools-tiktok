'use strict';

const service = require('../services/streamelements.service');
const { sanitizeUsername } = require('../services/channels.service');

async function status(req, res) {
  try {
    res.json(await service.status(sanitizeUsername(req.query.username)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function add(req, res) {
  try {
    res.json(await service.addToken(sanitizeUsername(req.body?.username), req.body?.token));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function remove(req, res) {
  try {
    res.json(await service.removeChannel(sanitizeUsername(req.body?.username), req.body?.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { status, add, remove };
