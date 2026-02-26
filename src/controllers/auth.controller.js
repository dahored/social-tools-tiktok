'use strict';

const authService = require('../services/auth.service');

async function register(req, res) {
  try {
    const caller = req.user ?? null;
    const user   = await authService.register(
      req.body,
      caller?.role ?? null,
      caller?.id   ?? null
    );
    res.status(201).json({ user });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}

module.exports = { register, login };
