'use strict';

const { Router } = require('express');
const usersController             = require('../src/controllers/users.controller');
const { authenticate }            = require('../src/middleware/authenticate');
const { authorize, ROLES }        = require('../src/middleware/authorize');
const { updateUserSchema, validate } = require('../src/validators/users.validator');

const router = Router();

// All user management routes require auth and ADMIN+ role
const canManage = [authenticate, authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN)];

// GET    /users
router.get('/',    ...canManage, usersController.list);

// GET    /users/:id
router.get('/:id', ...canManage, usersController.get);

// PUT    /users/:id
router.put('/:id', ...canManage, validate(updateUserSchema), usersController.update);

// DELETE /users/:id
router.delete('/:id', ...canManage, usersController.remove);

module.exports = router;
