'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../src/controllers/social-rotator.controller');

router.get('/',          ctrl.getSettings);
router.post('/settings', ctrl.saveSettings);

module.exports = router;
