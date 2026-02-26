'use strict';

const fs     = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const DatabaseProvider = require('../DatabaseProvider');

class FileProvider extends DatabaseProvider {
  /** @param {string} dataDir */
  constructor(dataDir) {
    super();
    this._file = path.join(dataDir, 'users.json');
  }

  async connect() {
    await fs.mkdir(path.dirname(this._file), { recursive: true });
    try {
      await fs.access(this._file);
    } catch {
      await fs.writeFile(this._file, JSON.stringify({ users: {} }, null, 2));
    }
  }

  async disconnect() {}

  async _read() {
    try {
      const raw    = await fs.readFile(this._file, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.users !== 'object') return { users: {} };
      return parsed;
    } catch {
      return { users: {} };
    }
  }

  async _write(store) {
    await fs.writeFile(this._file, JSON.stringify(store, null, 2));
  }

  async createUser(data) {
    const store = await this._read();
    const id    = crypto.randomUUID();
    const now   = new Date().toISOString();
    const user  = {
      id,
      name:      data.name,
      email:     data.email.toLowerCase(),
      password:  data.password,
      role:      data.role,
      createdBy: data.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    store.users[id] = user;
    await this._write(store);
    return user;
  }

  async findUserByEmail(email) {
    const store = await this._read();
    return (
      Object.values(store.users).find(
        (u) => u.email === email.toLowerCase()
      ) ?? null
    );
  }

  async findUserById(id) {
    const store = await this._read();
    return store.users[id] ?? null;
  }

  async listUsers() {
    const store = await this._read();
    return Object.values(store.users);
  }

  async updateUser(id, data) {
    const store = await this._read();
    const user  = store.users[id];
    if (!user) {
      const err = new Error(`User ${id} not found`);
      err.status = 404;
      throw err;
    }
    const updated = {
      ...user,
      ...(data.name     !== undefined && { name:     data.name }),
      ...(data.email    !== undefined && { email:    data.email.toLowerCase() }),
      ...(data.password !== undefined && { password: data.password }),
      ...(data.role     !== undefined && { role:     data.role }),
      updatedAt: new Date().toISOString(),
    };
    store.users[id] = updated;
    await this._write(store);
    return updated;
  }

  async deleteUser(id) {
    const store = await this._read();
    if (!store.users[id]) {
      const err = new Error(`User ${id} not found`);
      err.status = 404;
      throw err;
    }
    delete store.users[id];
    await this._write(store);
  }
}

module.exports = FileProvider;
