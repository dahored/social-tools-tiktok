'use strict';

const { Router } = require('express');
const authController             = require('../src/controllers/auth.controller');
const { registerSchema, loginSchema, validate } = require('../src/validators/auth.validator');
const { authenticateOptional }   = require('../src/middleware/authenticate');

const router = Router();

// POST /auth/register
// Unauthenticated → creates MEMBER
// Authenticated SUPER_ADMIN/ADMIN → can pass role in body
router.post('/register', authenticateOptional, validate(registerSchema), authController.register);

// POST /auth/login
router.post('/login', validate(loginSchema), authController.login);

module.exports = router;
