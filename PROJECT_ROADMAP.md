# Social Tools TikTok — Refactor Roadmap

> This document tracks the full evolution of the project from a simple counter widget server
> to a production-ready streaming widget hub with auth, roles, and database abstraction.
> It is designed to preserve AI context across long refactor sessions.

---

## Progress Overview

| Phase | Title                         | Status     |
|-------|-------------------------------|------------|
| 1     | Project Analysis              | ✅ Done     |
| 2     | Rename App                    | ✅ Done     |
| 3     | UI Modernization              | ✅ Done     |
| 4     | Status Report                 | ✅ Done (below) |
| 5     | Database Provider Abstraction | ✅ Done     |
| 6     | Authentication System         | ✅ Done     |
| 7     | Roles & Authorization         | ✅ Done     |
| 8     | Clean Architecture Refactor   | ✅ Done     |
| 9     | Roadmap & Documentation       | ✅ Done     |

---

## Phase 1 — Project Analysis

- [x] Detect frontend framework → **Vanilla HTML/CSS/JS** (no framework)
- [x] Detect backend framework → **Express.js** (Node.js)
- [x] Detect desktop framework → **None**
- [x] Detect database → **File-based JSON** (`data/counter-state.json`)
- [x] Detect ORM/DB client → **None** (raw `fs`)
- [x] Detect auth → **None**
- [x] Detect build tools → **None** (plain Node)
- [x] Detect CI/CD → **None**
- [x] Identify risks → **Low** (no internal imports use the package name)

---

## Phase 2 — Rename

- [x] `package.json` — name updated to `social-tools-tiktok`
- [x] `package.json` — description updated
- [x] `docker-compose.yml` — service + container renamed
- [x] `docker-compose.dev.yml` — service + container renamed
- [x] `docker-compose.yml` — added `env_file: .env` support
- [x] `docker-compose.dev.yml` — added `env_file: .env` support
- [x] `server.js` — console.log string updated
- [x] `web/index.html` — title + heading updated
- [x] `nodemon.json` — added `src/` and `routes/` to watch list
- [x] No broken import references (package name not used in imports)

**Risk analysis:** Low. Package name is not referenced via `require()` anywhere.
Docker volume renamed from `counter-data` → `app-data`.
⚠️ Existing Docker deployments must migrate the volume or re-initialize data.

---

## Phase 3 — UI Modernization

- [x] Dark background upgraded to deep black (`#0a0a0f`)
- [x] TikTok brand colors applied (`#ff0050` red, `#00f2ea` cyan)
- [x] Radial gradient glow background (brand feel)
- [x] Brand icon with gradient + glow shadow
- [x] Card hover lift + glow overlay effect
- [x] Animated pulsing live status dot
- [x] Improved button styles (primary gradient + ghost variant)
- [x] Status pill components (live / pending)
- [x] Card icon system with color coding by widget type
- [x] Full responsive layout (single column on mobile)
- [x] CSS custom properties throughout (maintainable)

**Before:** Basic dark theme with flat cards and minimal visual hierarchy.
**After:** TikTok-branded design with depth, animation, and clear status communication.

---

## Phase 4 — Project Status Report

### 1. Architecture Overview
Node.js HTTP server (Express) serving both the REST API and static frontend assets.
Widgets are plain HTML files served statically. State is persisted to JSON files.
Real-time updates use SSE (Server-Sent Events).

### 2. Tech Stack (Verified)
- **Runtime:** Node.js 20 (Alpine Docker)
- **Framework:** Express 4.x
- **Frontend:** Vanilla HTML/CSS/JS
- **Persistence:** JSON files via Node `fs`
- **Real-time:** SSE (EventSource)
- **Container:** Docker + docker-compose (prod + dev)
- **Dev reload:** nodemon

### 3. Folder Structure (Post-Refactor)
```
social-tools-tiktok/
├── assets/                    # Static fonts
├── data/                      # Runtime JSON storage (gitignored)
├── src/
│   ├── config/env.js          # Centralized env config
│   ├── config/roles.js        # Role constants
│   ├── controllers/           # Request/response handling only
│   ├── db/
│   │   ├── DatabaseProvider.js  # Abstract interface
│   │   ├── factory.js           # Provider singleton factory
│   │   └── providers/           # File / Mongo / Supabase
│   ├── middleware/            # authenticate, authorize
│   ├── repositories/          # DB access layer
│   ├── services/              # Business logic
│   └── validators/            # Zod schemas + validate()
├── routes/                    # Express router definitions
├── web/                       # Hub frontend (index.html)
├── widgets/                   # Widget HTML+JS+CSS
├── server.js                  # Entry point only
├── .env.example
└── PROJECT_ROADMAP.md
```

### 4. Backend Status
- ✅ Express server with clean entry point
- ✅ Counter API (GET, SSE, increase/decrease/reset, settings)
- ✅ Auth API (register, login)
- ✅ Users API (CRUD with role + ownership guards)
- ✅ Health endpoint

### 5. Frontend Status
- ✅ Widget Hub (`web/index.html`) — modernized
- ✅ Counter Widget (`widgets/counter/`) — unchanged (working)
- ⬜ Alerts Widget — placeholder only
- ⬜ Goals Widget — placeholder only
- ⬜ Chat Overlay — placeholder only

### 6. Desktop Integration
- ❌ Not applicable (web/Docker only)

### 7. Database Status
- ✅ File provider (default, active)
- ✅ Mongo provider (implemented, requires `MONGO_URI`)
- ✅ Supabase provider (implemented, requires `SUPABASE_URL` + `SUPABASE_ANON_KEY`)
- ✅ Provider factory with env-based switching

### 8. Auth Status
- ✅ Register with role assignment
- ✅ Login with JWT
- ✅ Password hashing (bcrypt, 12 rounds)
- ✅ JWT middleware (strict + optional)
- ✅ Role-based authorization middleware
- ✅ Ownership validation in users service
- ✅ Input validation via Zod

### 9. Security Risks
- ⚠️ `JWT_SECRET` defaults to dev string in non-production → must set in prod
- ⚠️ Counter widget routes are unauthenticated by design (OBS/Stream Deck compatibility)
- ⚠️ CORS is fully open (`cors()` with no origin restriction) — restrict in prod
- ⚠️ File provider stores passwords hashed in plain JSON — acceptable for dev; use Mongo/Supabase in prod
- ⚠️ No rate limiting on auth endpoints — add `express-rate-limit` in prod
- ⚠️ No HTTPS — handle at reverse proxy (nginx/Caddy) level

### 10. Technical Debt
- [ ] No tests (unit or integration)
- [ ] No rate limiting
- [ ] CORS not restricted to known origins
- [ ] No request logging (morgan or similar)
- [ ] No graceful shutdown handler (SIGTERM)
- [ ] README needs updating post-refactor

### 11. Recommended Next Steps (Priority Order)
1. Run `npm install` to pick up new dependencies
2. Copy `.env.example` → `.env` and set `JWT_SECRET`
3. Add `express-rate-limit` to auth routes
4. Add `morgan` for request logging
5. Write integration tests for auth + users flow
6. Add CORS origin whitelist for production
7. Build remaining widgets (Alerts, Goals, Chat Overlay)

---

## Phase 5 — Database Provider Abstraction

- [x] `DatabaseProvider` abstract class defined
- [x] `FileProvider` implemented (default)
- [x] `MongoProvider` implemented (lazy-loads mongoose)
- [x] `SupabaseProvider` implemented (lazy-loads @supabase/supabase-js)
- [x] `factory.js` with singleton pattern
- [x] `users.repository.js` delegates to provider
- [x] `counter.repository.js` remains file-based (widget-specific)

**Architecture decision:** Counter state is NOT routed through DatabaseProvider.
Reason: Counter is a stateless widget accessible without auth. Its state is
username-keyed (stream alias) not user-ID-keyed. Keeping it file-based preserves
backward compatibility and simplicity.

---

## Phase 6 — Authentication System

- [x] `POST /auth/register` — creates user with role assignment
- [x] `POST /auth/login` — returns JWT + sanitized user
- [x] Password hashing with bcrypt (12 salt rounds)
- [x] JWT signing with configurable secret and expiry
- [x] `authenticate` middleware (strict — rejects missing/invalid tokens)
- [x] `authenticateOptional` middleware (used on /register for admin-initiated creation)
- [x] Zod validation on all auth endpoints (422 + field details on failure)

**Bootstrap rule:** The very first registered user is automatically SUPER_ADMIN.
All subsequent unauthenticated registrations create MEMBER accounts.

---

## Phase 7 — Roles & Authorization

### Role Definitions
| Role         | Can see users           | Can modify users              |
|--------------|-------------------------|-------------------------------|
| SUPER_ADMIN  | All users               | All users + role changes       |
| ADMIN        | Users they created      | Users they created (no roles) |
| MEMBER       | ❌                      | ❌                             |

- [x] `ROLES` constants in `src/config/roles.js`
- [x] `authorize(...roles)` middleware factory
- [x] Ownership check in `users.service.js` (`createdBy` field)
- [x] SUPER_ADMIN bootstrapping on first register
- [x] Role field in User model (`id`, `name`, `email`, `password`, `role`, `createdBy`, `createdAt`, `updatedAt`)

### Protected Routes
```
POST   /auth/register      — public (optional auth for admin-initiated)
POST   /auth/login         — public

GET    /users              — SUPER_ADMIN, ADMIN
GET    /users/:id          — SUPER_ADMIN, ADMIN (ownership validated)
PUT    /users/:id          — SUPER_ADMIN, ADMIN (ownership validated)
DELETE /users/:id          — SUPER_ADMIN, ADMIN (ownership validated)

GET    /api/counter        — public (widget access)
GET    /api/counter/stream — public (SSE)
ALL    /api/counter/:action — public (Stream Deck)
POST   /api/counter/settings — public (widget config)
```

---

## Phase 8 — Architecture Rules

- [x] No business logic in routes (routes call controllers only)
- [x] No business logic in controllers (controllers call services only)
- [x] Services contain all domain logic
- [x] Repositories abstract all data access
- [x] Providers implement the DatabaseProvider interface
- [x] Middleware handles cross-cutting concerns (auth, authz, validation)
- [x] `server.js` is an entry point only (wiring + startup)

---

## Architecture Decisions Log

| Decision | Rationale |
|----------|-----------|
| File provider as default | Zero-config startup, good for dev/small deployments |
| Lazy-load optional providers | Avoids requiring mongoose/supabase when using file provider |
| Counter state NOT in DatabaseProvider | Widget state is username-scoped, not user-ID-scoped; keeping separate avoids coupling |
| unauthenticated counter access | OBS browser sources and Stream Deck cannot send JWT headers |
| First user = SUPER_ADMIN | Bootstrapping without a seed script; avoids chicken-and-egg auth problem |
| bcrypt 12 rounds | Balance between security and performance in a non-high-traffic app |
| Zod over Joi | Smaller bundle, better TypeScript inference, simpler API |
| optionalDependencies for mongoose/supabase | Prevents install failures when only file provider is needed |

---

## Pending Questions

- [ ] Should counter widget state eventually be linked to auth users?
- [ ] What is the production deployment target? (VPS, cloud, local NAS?)
- [ ] Should CORS origin be restricted? If so, what origins?
- [ ] Should the Supabase provider use service_role or anon key?
- [ ] What widgets are highest priority after counter?

---

## Risk Tracking

| Risk | Severity | Mitigation |
|------|----------|------------|
| JWT_SECRET not set in prod | High | Startup throws if NODE_ENV=production and no JWT_SECRET |
| Open CORS in prod | Medium | Document restriction requirement; implement when domain is known |
| No rate limiting on auth | Medium | Add `express-rate-limit` before going public |
| File provider in prod | Low-Med | Fine for personal/LAN use; document DB provider switch |
| Docker volume rename | Low | `counter-data` → `app-data`; existing deployments must re-create or rename volume |

