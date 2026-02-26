# Social Tools TikTok

Streaming widget hub with a counter widget, JWT auth, role-based access, and pluggable database providers.

## Quick Start

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET before production use
docker compose up -d --build
```

Open locally: `http://localhost:4050`
Open from LAN: `http://<YOUR_LOCAL_IP>:4050`

---

## Widgets

| Widget        | Status      | URL                           |
|---------------|-------------|-------------------------------|
| Counter       | Live        | `/widgets/counter/index.html` |
| Alerts        | Planned     | —                             |
| Goals         | Planned     | —                             |
| Chat Overlay  | Planned     | —                             |

---

## Auth API

### Register
```
POST /auth/register
Content-Type: application/json

{ "name": "Alice", "email": "alice@example.com", "password": "secret123" }
```
First user ever is automatically `SUPER_ADMIN`. All others default to `MEMBER`.

### Login
```
POST /auth/login
Content-Type: application/json

{ "email": "alice@example.com", "password": "secret123" }
```
Returns `{ token, user }`.

---

## Users API (auth required)

All routes require `Authorization: Bearer <token>`.

| Method | Route         | Required Role          |
|--------|---------------|------------------------|
| GET    | /users        | SUPER_ADMIN, ADMIN     |
| GET    | /users/:id    | SUPER_ADMIN, ADMIN     |
| PUT    | /users/:id    | SUPER_ADMIN, ADMIN     |
| DELETE | /users/:id    | SUPER_ADMIN, ADMIN     |

ADMIN can only manage users they created. SUPER_ADMIN can manage all users.

---

## Counter API (no auth — widget access)

| Endpoint                               | Description         |
|----------------------------------------|---------------------|
| GET `/api/counter?username=<n>`        | Get state           |
| GET `/api/counter/stream?username=<n>` | SSE live stream     |
| GET/POST `/api/counter/increase`       | Increment           |
| GET/POST `/api/counter/decrease`       | Decrement           |
| GET/POST `/api/counter/reset`          | Reset to 0          |
| POST `/api/counter/settings`           | Update appearance   |

---

## Database Providers

Set `DB_PROVIDER` in `.env`:

| Value      | Description                           |
|------------|---------------------------------------|
| `file`     | JSON file (default, zero config)      |
| `mongo`    | MongoDB via mongoose (`MONGO_URI`)    |
| `supabase` | Supabase PostgreSQL (`SUPABASE_URL`)  |

---

## Roles

| Role         | Permissions                                     |
|--------------|-------------------------------------------------|
| SUPER_ADMIN  | Manage all users, assign any role               |
| ADMIN        | Manage users they created (ADMIN + MEMBER)      |
| MEMBER       | No user management                              |
