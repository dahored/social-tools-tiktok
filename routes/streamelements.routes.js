'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../src/controllers/streamelements.controller');
const { authenticate } = require('../src/middleware/authenticate');

// Tokens are secrets: everything here needs a logged-in session
router.get('/',        authenticate, ctrl.status);
router.post('/',       authenticate, ctrl.add);
router.post('/remove', authenticate, ctrl.remove);

module.exports = router;
