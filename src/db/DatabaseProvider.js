'use strict';

/**
 * Abstract database provider interface.
 * All implementations must extend this class and override every method.
 *
 * @typedef {Object} CreateUserDTO
 * @property {string}      name
 * @property {string}      email
 * @property {string}      password   - already hashed
 * @property {string}      role
 * @property {string|null} createdBy
 *
 * @typedef {Object} UpdateUserDTO
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [password]
 * @property {string} [role]
 *
 * @typedef {Object} User
 * @property {string}      id
 * @property {string}      name
 * @property {string}      email
 * @property {string}      password
 * @property {string}      role
 * @property {string|null} createdBy
 * @property {string}      createdAt
 * @property {string}      updatedAt
 */

class DatabaseProvider {
  /** @returns {Promise<void>} */
  async connect() {
    throw new Error(`${this.constructor.name}.connect() not implemented`);
  }

  /** @returns {Promise<void>} */
  async disconnect() {
    throw new Error(`${this.constructor.name}.disconnect() not implemented`);
  }

  /**
   * @param {CreateUserDTO} data
   * @returns {Promise<User>}
   */
  async createUser(data) {
    throw new Error(`${this.constructor.name}.createUser() not implemented`);
  }

  /**
   * @param {string} email
   * @returns {Promise<User|null>}
   */
  async findUserByEmail(email) {
    throw new Error(`${this.constructor.name}.findUserByEmail() not implemented`);
  }

  /**
   * @param {string} id
   * @returns {Promise<User|null>}
   */
  async findUserById(id) {
    throw new Error(`${this.constructor.name}.findUserById() not implemented`);
  }

  /** @returns {Promise<User[]>} */
  async listUsers() {
    throw new Error(`${this.constructor.name}.listUsers() not implemented`);
  }

  /**
   * @param {string}        id
   * @param {UpdateUserDTO} data
   * @returns {Promise<User>}
   */
  async updateUser(id, data) {
    throw new Error(`${this.constructor.name}.updateUser() not implemented`);
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteUser(id) {
    throw new Error(`${this.constructor.name}.deleteUser() not implemented`);
  }
}

module.exports = DatabaseProvider;
