'use strict';

const express          = require('express');
const router           = express.Router();
const ctrl             = require('../src/controllers/scene-transition.controller');
const { authenticate } = require('../src/middleware/authenticate');

// Overlay endpoints — no auth (OBS / Stream Deck access)
router.get('/',               ctrl.getSettings);
router.get('/stream',         ctrl.stream);
router.get('/videos',         ctrl.listVideos);
router.get('/logo/:username', ctrl.getLogo);
router.get('/sound/:username', ctrl.getSound);
router.all('/play',           ctrl.play);
router.post('/settings',      ctrl.saveSettings);

// Host render worker (video/render-worker.mjs)
router.get('/worker',               ctrl.workerStatus);
router.get('/worker/stream',        ctrl.workerStream);
router.get('/render/:id',           ctrl.getRenderJob);
router.post('/render/:id/status',   ctrl.updateRenderJob);

// Editor only — uploads and render requests
router.post('/logo',   authenticate, ctrl.uploadLogo);
router.post('/sound',  authenticate, ctrl.uploadSound);
router.post('/render', authenticate, ctrl.requestRender);
router.delete('/videos/:file', authenticate, ctrl.deleteVideo);

module.exports = router;
