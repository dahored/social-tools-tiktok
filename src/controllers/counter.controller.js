'use strict';

const counterService = require('../services/counter.service');

async function getCounter(req, res) {
  try {
    const username = counterService.sanitizeUsername(req.query.username);
    const state    = await counterService.getCounter(username);
    res.json({ username, ...state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function streamCounter(req, res) {
  const username = counterService.sanitizeUsername(req.query.username);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  counterService.registerSseClient(username, res);

  counterService
    .getCounter(username)
    .then((state) => res.write(`data: ${JSON.stringify({ username, ...state })}\n\n`))
    .catch((err)  => res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`));

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    counterService.unregisterSseClient(username, res);
  });
}

async function counterAction(req, res) {
  try {
    const username = counterService.sanitizeUsername(
      req.query.username || req.body?.username
    );
    const state = await counterService.applyAction(username, req.params.action);
    res.json({ username, ...state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateSettings(req, res) {
  try {
    const username = counterService.sanitizeUsername(
      req.query.username || req.body?.username
    );
    const state = await counterService.updateSettings(username, req.body);
    res.json({ username, ...state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getCounter, streamCounter, counterAction, updateSettings };
