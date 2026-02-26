'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Strict authentication middleware.
 * Rejects requests without a valid Bearer token.
 * Sets req.user = { id, role } on success.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: message });
  }
}

/**
 * Optional authentication middleware.
 * Sets req.user if a valid token is present, otherwise continues without setting it.
 * Never rejects the request.
 */
function authenticateOptional(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      req.user = { id: payload.id, role: payload.role };
    } catch {
      // Ignore invalid token in optional mode
    }
  }
  next();
}

module.exports = { authenticate, authenticateOptional };
