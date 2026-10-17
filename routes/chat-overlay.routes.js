'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../src/controllers/chat-overlay.controller');
const { authenticate } = require('../src/middleware/authenticate');

// No auth — OBS browser source / Stream Deck access, like the other widgets
router.get('/',          ctrl.getSettings);
router.get('/stream',    ctrl.stream);
router.post('/settings', ctrl.saveSettings);
router.all('/test',      ctrl.sendTest);
router.get('/sound/:username', ctrl.getSound);
router.post('/sound', authenticate, ctrl.uploadSound);

// "Conectar Facebook" — editor only (the callback is protected by a signed state)
router.get('/facebook/status',       authenticate, ctrl.facebookStatus);
router.post('/facebook/login',       authenticate, ctrl.facebookLogin);
router.get('/facebook/callback',     ctrl.facebookCallback);
router.post('/facebook/page',        authenticate, ctrl.facebookSelectPage);
router.post('/facebook/disconnect',  authenticate, ctrl.facebookDisconnect);

module.exports = router;
