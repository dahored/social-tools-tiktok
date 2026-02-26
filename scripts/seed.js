'use strict';

/**
 * Seed script — creates SUPER_ADMIN + ADMIN users if they don't exist.
 *
 * Usage:
 *   node scripts/seed.js
 *
 * Override defaults via env vars:
 *   SEED_SUPER_EMAIL   SEED_SUPER_PASSWORD   SEED_SUPER_NAME
 *   SEED_ADMIN_EMAIL   SEED_ADMIN_PASSWORD   SEED_ADMIN_NAME
 */

try { require('dotenv').config(); } catch {} // optional: loaded by Docker env_file in container

const { getDatabaseProvider } = require('../src/db/factory');
const authService              = require('../src/services/auth.service');
const { ROLES }                = require('../src/config/roles');

const SUPER = {
  name:     process.env.SEED_SUPER_NAME     || 'Super Admin',
  email:    process.env.SEED_SUPER_EMAIL    || 'superadmin@local.dev',
  password: process.env.SEED_SUPER_PASSWORD || 'SuperAdmin1234!',
  role:     ROLES.SUPER_ADMIN,
};

const ADMIN = {
  name:     process.env.SEED_ADMIN_NAME     || 'Admin',
  email:    process.env.SEED_ADMIN_EMAIL    || 'admin@local.dev',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin1234!',
  role:     ROLES.ADMIN,
};

async function seed() {
  const db = getDatabaseProvider();
  await db.connect();

  // ── SUPER_ADMIN ──────────────────────────────────────────────
  const existingSuper = await db.findUserByEmail(SUPER.email);
  if (existingSuper) {
    console.log(`[seed] SUPER_ADMIN already exists: ${SUPER.email}`);
  } else {
    const user = await authService.register(SUPER, null, null);
    console.log(`[seed] Created SUPER_ADMIN: ${user.email} (id: ${user.id})`);
  }

  // Fetch the super admin to use as caller for the admin creation
  const superUser = await db.findUserByEmail(SUPER.email);

  // ── ADMIN ────────────────────────────────────────────────────
  const existingAdmin = await db.findUserByEmail(ADMIN.email);
  if (existingAdmin) {
    console.log(`[seed] ADMIN already exists: ${ADMIN.email}`);
  } else {
    const user = await authService.register(ADMIN, ROLES.SUPER_ADMIN, superUser.id);
    console.log(`[seed] Created ADMIN:       ${user.email} (id: ${user.id})`);
  }

  console.log('\n[seed] Done.\n');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Fatal error:', err.message);
  process.exit(1);
});
