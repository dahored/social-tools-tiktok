'use strict';

const { ROLES } = require('../config/roles');

/**
 * Role-based authorization middleware factory.
 * Must be placed after authenticate middleware.
 *
 * @param {...string} roles - allowed roles
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.get('/users', authenticate, authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN), controller.list);
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authorize, ROLES };
