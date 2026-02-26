'use strict';

const path = require('path');

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production');
}

const env = {
  port:        Number(process.env.PORT) || 4050,
  nodeEnv:     process.env.NODE_ENV || 'development',
  jwtSecret:   jwtSecret || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbProvider:  (process.env.DB_PROVIDER || 'file').toLowerCase(),
  mongoUri:    process.env.MONGO_URI || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_ANON_KEY || '',
  dataDir:     process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), 'data'),
};

module.exports = env;
