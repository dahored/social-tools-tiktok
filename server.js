'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const env                  = require('./src/config/env');
const { getDatabaseProvider } = require('./src/db/factory');

const authRoutes          = require('./routes/auth.routes');
const usersRoutes         = require('./routes/users.routes');
const counterRoutes       = require('./routes/counter.routes');
const socialRotatorRoutes = require('./routes/social-rotator.routes');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static assets ─────────────────────────────────────────────────────────────
app.use('/assets',  express.static(path.join(__dirname, 'assets')));
app.use('/widgets', express.static(path.join(__dirname, 'widgets')));
app.use(express.static(path.join(__dirname, 'web')));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:     'ok',
    port:       env.port,
    dbProvider: env.dbProvider,
    time:       new Date().toISOString(),
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/auth',                authRoutes);
app.use('/users',               usersRoutes);
app.use('/api/counter',         counterRoutes);
app.use('/api/social-rotator',  socialRotatorRoutes);

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  const db = getDatabaseProvider();
  await db.connect();

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Social Tools TikTok running on http://0.0.0.0:${env.port}`);
    console.log(`  DB provider : ${env.dbProvider}`);
    console.log(`  Environment : ${env.nodeEnv}`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
