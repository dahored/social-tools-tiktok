'use strict';

const DatabaseProvider = require('../DatabaseProvider');

class MongoProvider extends DatabaseProvider {
  /** @param {string} uri */
  constructor(uri) {
    super();
    this._uri      = uri;
    this._mongoose = null;
    this._User     = null;
  }

  async connect() {
    if (!this._uri) {
      throw new Error('MONGO_URI is required for MongoProvider');
    }

    let mongoose;
    try {
      mongoose = require('mongoose');
    } catch {
      throw new Error(
        'mongoose package is required for MongoProvider. Run: npm install mongoose'
      );
    }

    this._mongoose = mongoose;

    const userSchema = new mongoose.Schema(
      {
        name:      { type: String, required: true },
        email:     { type: String, required: true, unique: true, lowercase: true },
        password:  { type: String, required: true },
        role:      { type: String, required: true },
        createdBy: { type: String, default: null },
      },
      { timestamps: true }
    );

    this._User = mongoose.models.User || mongoose.model('User', userSchema);
    await mongoose.connect(this._uri);
  }

  async disconnect() {
    if (this._mongoose) await this._mongoose.disconnect();
  }

  _toPlain(doc) {
    const obj = doc.toObject({ versionKey: false });
    return {
      id:        obj._id.toString(),
      name:      obj.name,
      email:     obj.email,
      password:  obj.password,
      role:      obj.role,
      createdBy: obj.createdBy ?? null,
      createdAt: obj.createdAt?.toISOString() ?? null,
      updatedAt: obj.updatedAt?.toISOString() ?? null,
    };
  }

  async createUser(data) {
    const doc = await this._User.create({
      name:      data.name,
      email:     data.email,
      password:  data.password,
      role:      data.role,
      createdBy: data.createdBy ?? null,
    });
    return this._toPlain(doc);
  }

  async findUserByEmail(email) {
    const doc = await this._User.findOne({ email: email.toLowerCase() });
    return doc ? this._toPlain(doc) : null;
  }

  async findUserById(id) {
    try {
      const doc = await this._User.findById(id);
      return doc ? this._toPlain(doc) : null;
    } catch {
      return null;
    }
  }

  async listUsers() {
    const docs = await this._User.find();
    return docs.map((d) => this._toPlain(d));
  }

  async updateUser(id, data) {
    const update = {};
    if (data.name     !== undefined) update.name     = data.name;
    if (data.email    !== undefined) update.email    = data.email.toLowerCase();
    if (data.password !== undefined) update.password = data.password;
    if (data.role     !== undefined) update.role     = data.role;

    const doc = await this._User.findByIdAndUpdate(id, update, { new: true });
    if (!doc) {
      const err = new Error(`User ${id} not found`);
      err.status = 404;
      throw err;
    }
    return this._toPlain(doc);
  }

  async deleteUser(id) {
    const result = await this._User.findByIdAndDelete(id);
    if (!result) {
      const err = new Error(`User ${id} not found`);
      err.status = 404;
      throw err;
    }
  }
}

module.exports = MongoProvider;
