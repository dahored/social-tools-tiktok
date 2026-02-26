'use strict';

const bcrypt    = require('bcryptjs');
const usersRepo = require('../repositories/users.repository');
const { ROLES } = require('../config/roles');

const SALT_ROUNDS = 12;

/**
 * List users visible to the caller based on their role.
 * SUPER_ADMIN → all users
 * ADMIN       → users they created
 * MEMBER      → 403
 *
 * @param {{ id: string, role: string }} caller
 */
async function list(caller) {
  if (caller.role === ROLES.SUPER_ADMIN) {
    return (await usersRepo.listAll()).map(_sanitize);
  }
  if (caller.role === ROLES.ADMIN) {
    return (await usersRepo.listByCreator(caller.id)).map(_sanitize);
  }
  _forbidden();
}

/**
 * @param {string}                     id
 * @param {{ id: string, role: string }} caller
 */
async function get(id, caller) {
  const user = await _requireUser(id);
  _assertAccess(user, caller);
  return _sanitize(user);
}

/**
 * @param {string}                     id
 * @param {object}                     dto
 * @param {{ id: string, role: string }} caller
 */
async function update(id, dto, caller) {
  const user = await _requireUser(id);
  _assertAccess(user, caller);

  const patch = {};
  if (dto.name)     patch.name     = dto.name;
  if (dto.email)    patch.email    = dto.email;
  if (dto.password) patch.password = await bcrypt.hash(dto.password, SALT_ROUNDS);

  // Only SUPER_ADMIN may change roles
  if (dto.role && caller.role === ROLES.SUPER_ADMIN) {
    patch.role = dto.role;
  }

  const updated = await usersRepo.update(id, patch);
  return _sanitize(updated);
}

/**
 * @param {string}                     id
 * @param {{ id: string, role: string }} caller
 */
async function remove(id, caller) {
  const user = await _requireUser(id);
  _assertAccess(user, caller);
  await usersRepo.remove(id);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _requireUser(id) {
  const user = await usersRepo.findById(id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return user;
}

function _assertAccess(user, caller) {
  if (caller.role === ROLES.SUPER_ADMIN) return;
  if (caller.role === ROLES.ADMIN && user.createdBy === caller.id) return;
  _forbidden();
}

function _forbidden() {
  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
}

function _sanitize(user) {
  const { password, ...safe } = user;
  return safe;
}

module.exports = { list, get, update, remove };
