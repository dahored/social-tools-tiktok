'use strict';

const { z } = require('zod');

const registerSchema = z.object({
  name:     z.string().min(1, 'Name is required').max(80),
  email:    z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role:     z.string().optional(),
});

const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Creates an Express middleware that validates req.body against a Zod schema.
 * Responds with 422 + field-level error detail on failure.
 * Replaces req.body with the parsed (coerced) data on success.
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {import('express').RequestHandler}
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        error:   'Validation failed',
        details: result.error.errors.map((e) => ({
          field:   e.path.join('.'),
          message: e.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { registerSchema, loginSchema, validate };
