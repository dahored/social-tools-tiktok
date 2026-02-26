'use strict';

const env = require('../config/env');

/** @type {import('./DatabaseProvider')|null} */
let _instance = null;

/**
 * Returns the configured database provider singleton.
 * The instance is created lazily on first call and reused thereafter.
 *
 * @returns {import('./DatabaseProvider')}
 */
function getDatabaseProvider() {
  if (_instance) return _instance;

  switch (env.dbProvider) {
    case 'mongo': {
      const MongoProvider = require('./providers/MongoProvider');
      _instance = new MongoProvider(env.mongoUri);
      break;
    }
    case 'supabase': {
      const SupabaseProvider = require('./providers/SupabaseProvider');
      _instance = new SupabaseProvider(env.supabaseUrl, env.supabaseKey);
      break;
    }
    case 'file':
    default: {
      const FileProvider = require('./providers/FileProvider');
      _instance = new FileProvider(env.dataDir);
      break;
    }
  }

  return _instance;
}

/**
 * Reset the singleton (test helper only).
 */
function _resetProvider() {
  _instance = null;
}

module.exports = { getDatabaseProvider, _resetProvider };
