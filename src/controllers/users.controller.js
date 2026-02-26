'use strict';

const usersService = require('../services/users.service');

async function list(req, res) {
  try {
    const users = await usersService.list(req.user);
    res.json({ users });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function get(req, res) {
  try {
    const user = await usersService.get(req.params.id, req.user);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function update(req, res) {
  try {
    const user = await usersService.update(req.params.id, req.body, req.user);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function remove(req, res) {
  try {
    await usersService.remove(req.params.id, req.user);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { list, get, update, remove };
