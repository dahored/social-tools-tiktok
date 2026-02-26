'use strict';

const { Router }       = require('express');
const counterController = require('../src/controllers/counter.controller');

const router = Router();

// Counter widget endpoints — no auth required (OBS/Stream Deck access)

// GET  /api/counter?username=<name>
router.get('/', counterController.getCounter);

// GET  /api/counter/stream?username=<name>  (SSE)
router.get('/stream', counterController.streamCounter);

// ALL  /api/counter/(increase|decrease|reset)?username=<name>
// Accepts GET and POST for Stream Deck compatibility
router.all('/:action(increase|decrease|reset)', counterController.counterAction);

// POST /api/counter/settings
router.post('/settings', counterController.updateSettings);

module.exports = router;
