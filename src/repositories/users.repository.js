'use strict';

const { getDatabaseProvider } = require('../db/factory');

const db = () => getDatabaseProvider();

/** @param {import('../db/DatabaseProvider').CreateUserDTO} data */
const createUser   = (data)       => db().createUser(data);
const findByEmail  = (email)      => db().findUserByEmail(email);
const findById     = (id)         => db().findUserById(id);
const listAll      = ()           => db().listUsers();
const update       = (id, data)   => db().updateUser(id, data);
const remove       = (id)         => db().deleteUser(id);

async function listByCreator(createdById) {
  const all = await db().listUsers();
  return all.filter((u) => u.createdBy === createdById);
}

module.exports = { createUser, findByEmail, findById, listAll, listByCreator, update, remove };
