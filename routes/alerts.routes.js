'use strict';

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../src/controllers/alerts.controller');
const { authenticate } = require('../src/middleware/authenticate');
const chatCtrl = require('../src/controllers/chat-overlay.controller');

// No auth — OBS browser source / Stream Deck access, like the other widgets
router.get('/',          ctrl.getSettings);
router.post('/settings', ctrl.saveSettings);
router.all('/test',      ctrl.sendTest);
router.get('/sound/:username/:type', ctrl.getSound);
router.post('/sound', authenticate, ctrl.uploadSound);
// Same live room as the chat overlay (shared platform connections)
router.get('/stream',    chatCtrl.stream);

module.exports = router;
