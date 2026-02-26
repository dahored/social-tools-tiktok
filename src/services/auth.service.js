'use strict';

const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const usersRepo = require('../repositories/users.repository');
const env       = require('../config/env');
const { ROLES } = require('../config/roles');

const SALT_ROUNDS = 12;

/**
 * Register a new user.
 *
 * Role assignment rules:
 *  - First user ever           → SUPER_ADMIN (bootstrapping)
 *  - Unauthenticated caller    → MEMBER
 *  - SUPER_ADMIN caller        → any role from dto.role (defaults to MEMBER)
 *  - ADMIN caller              → ADMIN or MEMBER only
 *  - MEMBER caller             → 403
 *
 * @param {{ name: string, email: string, password: string, role?: string }} dto
 * @param {string|null} callerRole
 * @param {string|null} callerId
 * @returns {Promise<object>} sanitized user (no password)
 */
async function register(dto, callerRole = null, callerId = null) {
  const existing = await usersRepo.findByEmail(dto.email);
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  const allUsers = await usersRepo.listAll();
  let role;

  if (allUsers.length === 0) {
    // Bootstrap: first account is always SUPER_ADMIN
    role = ROLES.SUPER_ADMIN;
  } else if (!callerRole) {
    role = ROLES.MEMBER;
  } else if (callerRole === ROLES.SUPER_ADMIN) {
    role = Object.values(ROLES).includes(dto.role) ? dto.role : ROLES.MEMBER;
  } else if (callerRole === ROLES.ADMIN) {
    role =
      dto.role === ROLES.ADMIN || dto.role === ROLES.MEMBER
        ? dto.role
        : ROLES.MEMBER;
  } else {
    const err = new Error('Insufficient permissions to create users');
    err.status = 403;
    throw err;
  }

  const hashed = await bcrypt.hash(dto.password, SALT_ROUNDS);
  const user   = await usersRepo.createUser({
    name:      dto.name,
    email:     dto.email,
    password:  hashed,
    role,
    createdBy: callerId,
  });

  return _sanitize(user);
}

/**
 * Authenticate a user and return a signed JWT.
 *
 * @param {{ email: string, password: string }} dto
 * @returns {Promise<{ token: string, user: object }>}
 */
async function login(dto) {
  const user = await usersRepo.findByEmail(dto.email);
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const match = await bcrypt.compare(dto.password, user.password);
  if (!match) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  return { token, user: _sanitize(user) };
}

function _sanitize(user) {
  const { password, ...safe } = user;
  return safe;
}

module.exports = { register, login };
