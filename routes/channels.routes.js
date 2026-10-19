'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../src/controllers/channels.controller');

// "Mis canales" — shared by every widget
router.get('/',  ctrl.get);
router.post('/', ctrl.save);

module.exports = router;
