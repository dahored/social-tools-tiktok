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
const sceneTransitionRoutes = require('./routes/scene-transition.routes');
const chatOverlayRoutes = require('./routes/chat-overlay.routes');
const channelsRoutes    = require('./routes/channels.routes');
const streamElementsRoutes = require('./routes/streamelements.routes');
const sceneTransitionService = require('./src/services/scene-transition.service');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
// Logo / sound uploads arrive as base64 data URLs — allow larger bodies on those routes only
app.use('/api/scene-transition/logo', express.json({ limit: '3mb' }));
app.use('/api/scene-transition/sound', express.json({ limit: '8mb' }));
app.use('/api/chat-overlay/sound', express.json({ limit: '4mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static assets ─────────────────────────────────────────────────────────────
app.use('/assets',  express.static(path.join(__dirname, 'assets')));
app.use('/widgets', express.static(path.join(__dirname, 'widgets')));
app.use('/media/transitions', express.static(sceneTransitionService.VIDEO_DIR));
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
app.use('/api/scene-transition', sceneTransitionRoutes);
app.use('/api/chat-overlay',     chatOverlayRoutes);
app.use('/api/channels',         channelsRoutes);
app.use('/api/streamelements',   streamElementsRoutes);

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
