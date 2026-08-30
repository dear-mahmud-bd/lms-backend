# EMS Backend — Strapi CMS & API

The backend for the LMS: a [Strapi 5](https://strapi.io) headless CMS that owns the data model,
authentication (with a custom email-OTP step), role-based access control, and all business logic
(enrollment, progress %, quiz auto-grading, admin stats).

Every access rule is enforced **server-side** here — the frontend never decides access on its own.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework / CMS | **Strapi `5.52.1`** (headless, REST-first) |
| Language | **TypeScript** |
| Runtime | **Node.js `>=20 <=26`** |
| Database (local) | **SQLite** via `better-sqlite3` (file at `.tmp/data.db`) |
| Database (deployed) | **PostgreSQL** on Railway (same Strapi, different `DATABASE_CLIENT`) |
| Auth | Strapi **Users & Permissions** plugin, extended with a custom OTP verification step |
| Email | `@strapi/provider-email-nodemailer` (SMTP) — sends the OTP on register |
| Extra read layer | `@strapi/plugin-graphql` — **read-only**, additive; does not replace REST |

> **Fixed stack.** No MongoDB, Redis, Kafka, Docker, or Nginx are part of this project. Strapi's
> own database is the only datastore. GraphQL is an additive read layer only.

---

## Prerequisites

- **Node.js 20–26** and **npm** (`node -v` to check).
- No external database needed locally — SQLite is file-based and created automatically.
- (Optional) SMTP credentials if you want real OTP emails. Without them the app still works: the
  OTP is printed to the server console instead (dev fallback).

---

## Running locally

```bash
cd ems-backend
npm install
cp .env.example .env      # then fill in the secrets (see below)
npm run develop
```

- Admin panel: **http://localhost:1337/admin** (create the first admin user on first boot)
- API base URL: **http://localhost:1337/api**
- First boot takes ~60–90s while Strapi builds the admin panel and runs migrations.

### Available scripts

| Script | What it does |
|---|---|
| `npm run develop` | Start with **auto-reload** (use this for local dev) |
| `npm run start` | Start **without** auto-reload (production-style boot) |
| `npm run build` | Build the admin panel |
| `npm run strapi` | Raw Strapi CLI passthrough |

---

## Environment variables

Set these in `ems-backend/.env` (never committed). Locally, secrets can be any value; on Railway
they are set **by hand** in the dashboard.

**Server & secrets**

| Var | Purpose |
|---|---|
| `HOST` / `PORT` | Bind address (default `0.0.0.0:1337`) |
| `APP_KEYS` | Comma-separated session signing keys |
| `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `ENCRYPTION_KEY` | Strapi secrets |

**Database** — local defaults to SQLite; leave the Postgres fields blank locally.

| Var | Local | Deployed (Railway) |
|---|---|---|
| `DATABASE_CLIENT` | `sqlite` | `postgres` |
| `DATABASE_FILENAME` | `.tmp/data.db` | — |
| `DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD/SSL` | blank | provided by Railway |

**Email (OTP)** — optional locally.

| Var | Purpose |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | SMTP transport |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | Sender identity |

> If SMTP isn't configured, register still succeeds and the OTP is logged to the console as
> `[otp] <email> -> <code> (dev fallback)`. Emails are lowercased before storing.

---

## Data model

Content-types live in `src/api/<name>/`. See `docs/erd.md` for fields and relations.

`course` · `lesson` · `enrollment` · `progress` · `quiz` · `question` · `quiz-attempt` ·
`blog-post` · `notification` — plus a custom `admin` API for stats/role management, and a
`users-permissions` extension adding `appRole` + OTP fields to the user.

**Roles (`appRole`, fixed):** `admin`, `content-manager`, `instructor`, `student`.
`appRole` is **not** client-selectable — any value sent on register is stripped and forced to
`student`. Role changes happen only via the admin route.

---

## Access control (server-side)

Two reusable global policies enforce the permission matrix (`docs/permission-matrix.md`):

- `src/policies/has-app-role.ts` — gates a route by required `appRole`(s).
- `src/policies/is-owner.ts` — "own only" rule (e.g. an instructor may edit only their own
  courses). Ownership is resolved from the server-side owner relation
  (`course.instructor`, `*.student`, `blog-post.author`, …), **never** a client-sent id.
  A failed ownership check returns **403**.

Server-set fields (`instructor`, `student`, `recipient`, `author`, `score`, `enrolledAt`,
`completedAt`, `submittedAt`) are assigned server-side and ignored if sent by the client.

---

## Key endpoints

Full request/response shapes are in `docs/api-contracts.md`. Highlights:

**Auth (custom OTP flow)**
- `POST /api/auth/local/register` — creates an unverified user, issues an OTP (no JWT returned).
- `POST /api/auth/verify-otp` — verify OTP → sets `confirmed: true` → returns JWT.
- `POST /api/auth/local` — login (blocked until confirmed).

**Domain (custom routes marked)**
- `GET /api/courses`, `POST/PUT/DELETE /api/courses/:id` — course CRUD (own-only for instructors).
- `GET /api/courses/:id/lessons` — lessons (students must be enrolled).
- `POST /api/enrollments`, `GET /api/enrollments/me`.
- `POST /api/progress/mark-complete` *(custom)*, `GET /api/progress/:courseId` *(custom, computes %)*.
- `POST /api/quiz-attempts` *(custom, auto-grades)*, `GET /api/quiz-attempts/me`.
- `POST /api/blog-posts`, `PUT /api/blog-posts/:id/publish` *(custom)*; public reads are
  published-only.
- `GET /api/admin/stats`, `GET /api/admin/users`, `PUT /api/admin/users/:id/role` *(custom, admin only)*.
- `GET /api/notifications/me`, `PUT /api/notifications/:id/read`.

**GraphQL (read-only):** `POST /graphql` — additive dashboard queries only; `shadowCRUD: false`
so there are no auto-generated mutations or CRUD. Playground is dev-only.

---

## Quick smoke test

With the server running:

```bash
curl -i http://localhost:1337/_health                       # -> 204
curl -i http://localhost:1337/api/courses                   # -> 200 (public list)
curl -i http://localhost:1337/api/admin/stats               # -> 403 (unauthenticated)
curl -i -X POST http://localhost:1337/api/auth/local/register \
  -H "Content-Type: application/json" \
  -d '{"username":"jane","email":"jane@example.com","password":"Test1234"}'
# -> 200, then read the OTP from the server console and POST /api/auth/verify-otp
```

Protected routes returning **403 (not 404)** while unauthenticated is the expected, correct
behavior — it proves the server-side policies are enforcing.

---

## Project structure

```
ems-backend/
├─ config/                 # server, database, plugins (email, graphql), middlewares
├─ src/
│  ├─ api/<content-type>/  # schema, controllers, routes, services per entity
│  ├─ extensions/
│  │  └─ users-permissions/ # appRole + OTP register/verify overrides
│  └─ policies/            # has-app-role.ts, is-owner.ts (global RBAC)
├─ .env                    # secrets (not committed)
└─ package.json
```
