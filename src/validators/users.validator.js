'use strict';

const { z }        = require('zod');
const { validate } = require('./auth.validator');
const { ROLES }    = require('../config/roles');

const updateUserSchema = z
  .object({
    name:     z.string().min(1).max(80).optional(),
    email:    z.string().email().optional(),
    password: z.string().min(8).optional(),
    role:     z.enum([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MEMBER]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

module.exports = { updateUserSchema, validate };
