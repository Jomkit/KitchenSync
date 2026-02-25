# KitchenSync

KitchenSync is a small monorepo for a restaurant inventory and ordering MVP.

Backend uses Flask + Flask-SocketIO + SQLAlchemy + PostgreSQL. Frontend uses Vite + React + TypeScript.

## Read This First

- `AGENTS.md` contains non-negotiable architecture constraints and MVP rules.
- `docs/proposal.md` is an early planning document and includes outdated stack notes in some sections. Use the codebase as the source of truth.
- `docs/deploy-gcp.md` is the implementation-ready deployment runbook for Cloud Run + Cloud SQL + Scheduler + GitHub Actions.

## Repository Layout

- `backend/` Flask-SocketIO service, SQLAlchemy models, DB setup, seed script
- `frontend/` React dashboard (Vite)
- `docs/` planning notes
- `Makefile` root shortcuts for local development

## Current Implementation Status

Implemented today:
- Flask-SocketIO app with eventlet runtime (`backend/run.py`)
- Health endpoint: `GET /health`
- Health endpoint alias: `GET /healthz`
- Auth endpoint: `POST /auth/login` (seeded users, JWT access token with role claim)
- Protected examples: `GET /kitchen/overview`, `GET /foh/overview`, `GET /auth/me`
- Menu endpoint: `GET /menu` (availability + low stock + deterministic reason)
- Ingredients endpoints: `GET /ingredients`, `PATCH /ingredients/:id` (kitchen role)
- Reservation endpoints:
  - `POST /reservations`
  - `GET /reservations/:id`
  - `PATCH /reservations/:id`
  - `POST /reservations/:id/commit`
  - `POST /reservations/:id/release`
  - Reservation write endpoints are accessible to `online` and `foh` roles
- Runtime TTL settings endpoint:
  - `GET /admin/reservation-ttl` (allowed for `online` and `foh`)
  - `PATCH /admin/reservation-ttl` (FOH-only; TTL allowed values: 1-15 minutes)
  - includes runtime warning threshold for TTL pill (`5-120` seconds, default `30`)
- Global reservation timer UI:
  - Floating `TTL` pill appears for authenticated users when `activeReservationId` exists
  - Hover opens transparent countdown panel
  - Click pins panel open with solid/pressed style
  - For ordering roles (`online` + `foh`), pill turns red + auto-opens when remaining time is at/below warning threshold
  - Warning threshold is configurable by FOH (default `30s`, range `5-120s`)
  - When timer reaches elapsed state, `/online` shows a temporary blocking overlay while local reservation-status cleanup runs
  - During that cleanup overlay, ordering interactions are disabled to prevent post-expiry cart mutations
- Reservation expiration worker (`backend/app/reservation_expiration.py`): runs every 30s, expires active reservations, emits `stateChanged`
- Internal expiry trigger: `POST /internal/expire_once` with `X-Internal-Secret`
- Socket events:
  - broadcast: `stateChanged` (used by frontend refetch flow)
  - request/response: client `ping` -> server `pong`
- PostgreSQL Docker services for dev/test (`backend/docker-compose.yml`)
- SQLAlchemy domain models in `backend/app/models.py`
- Schema bootstrap via `create_all()` and sample data seed via `backend/seed.py`
- Frontend routes:
  - `/kitchen` (kitchen editable, foh readonly)
  - `/foh` (front-of-house status board)
  - `/online` (ordering/cart flow for online and foh users)
  - `/menu` (non-interactive menu board for all authenticated users)
  - `/online/confirmed` (post-checkout confirmation screen)
- Backend tests under `backend/tests/` for reservation correctness, concurrency, expiration, and availability serialization

## Current MVP Database Schema

Source of truth: `backend/app/models.py`

- `users`
  - `email` unique, non-null
  - `password` non-null (MVP plain-text)
  - `role` non-null (`kitchen|foh|online`)
  - `display_name` nullable, non-unique
- `ingredients`
  - `name` unique, non-null
  - `on_hand_qty` non-null integer
  - `low_stock_threshold_qty` non-null integer, default `5`
  - `is_out` non-null boolean
- `menu_items`
  - `name` unique, non-null
  - `price_cents` non-null integer
  - `category` nullable string
  - `allergens` nullable string (CSV for MVP)
- `recipes`
  - `menu_item_id`, `ingredient_id`, `qty_required`
  - unique constraint on `(menu_item_id, ingredient_id)`
- `reservations`
  - `user_id`, `status`, `created_at`, `updated_at`, `expires_at`
  - `status` values used by MVP: `active|committed|released|expired`
- `reservation_items`
  - `reservation_id`, `menu_item_id`, `qty`, `notes`
  - unique constraint on `(reservation_id, menu_item_id)`
- `reservation_ingredients`
  - `reservation_id`, `ingredient_id`, `qty_reserved`
  - unique constraint on `(reservation_id, ingredient_id)`

## Prerequisites

- Python 3.11+
- Node.js 20+ and npm
- Docker with Compose plugin

## Quickstart

1. Start PostgreSQL (dev + optional test):
```bash
make db-up
make test-db-up
```

Optional: open a Postgres CLI session:
```bash
make db-cli
# or
make test-db-cli
```

2. Configure backend env:
```bash
cp backend/.env.example backend/.env
```

3. Create backend venv and install deps:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

4. Initialize schema and seed sample data (from the activated backend venv shell):
```bash
python seed.py
```
Optional equivalent from repo root:
```bash
make seed
```

5. Start backend (required entrypoint, same backend shell):
```bash
python run.py
```

6. In a new terminal, start frontend:
```bash
cd frontend
npm install
npm run dev
```

7. Open:
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:5000/health`

Seeded login credentials (`make seed`):
- `kitchen@example.com` / `pass`
- `foh@example.com` / `pass`
- `online@example.com` / `pass`

## Environment Variables

Environment variables are centralized in `backend/config.py`, which loads `backend/.env` at startup and exposes typed settings to the backend runtime.

Backend reads these values:

- `APP_ENV` default: `development` (`test` switches DB resolution to test config)
- `DATABASE_URL` preferred for cloud/staging/prod (secret-managed full URL)
- `HOST` default: `0.0.0.0`
- `PORT` default: `5000`
- `FLASK_DEBUG` set to `1` to enable debug/reloader
- `JWT_SECRET_KEY` default: `dev-change-me`
- `JWT_ALGORITHM` default: `HS256`
- `JWT_ACCESS_TOKEN_TTL_MINUTES` default: `60`
- `RESERVATION_TTL_SECONDS` default: `600`
  - used as startup default; FOH can override runtime TTL via `/admin/reservation-ttl`
- `RESERVATION_WARNING_THRESHOLD_SECONDS` default: `30`
  - used as startup default; FOH can override runtime warning threshold via `/admin/reservation-ttl`
- `EXPIRATION_INTERVAL_SECONDS` default: `30`
- `ENABLE_INPROCESS_EXPIRATION_JOB` default: `1` in local/dev, `0` in production/staging
- `INTERNAL_EXPIRE_SECRET` required in production/staging (used by `POST /internal/expire_once`)
- `CORS_ALLOWED_ORIGINS` default: `http://localhost:5173` (comma-separated)
- `FRONTEND_DIST_DIR` default: `../frontend/dist`
- `LOG_LEVEL` default: `INFO` (`DEBUG|INFO|WARNING|ERROR|CRITICAL`)

Database URL resolution in `backend/config.py`:
- `APP_ENV=test` + `TEST_DATABASE_URL` if present
- `DATABASE_URL` if present
- `APP_ENV=test` -> build URL from `TEST_DB_*` vars
- Otherwise build URL from `DB_*` vars

Production/staging safeguard:
- If `APP_ENV` is `production` or `staging` and `DATABASE_URL` is not set, the app fails fast unless `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` are explicitly provided.

Supported component vars:
- `DB_DRIVER`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE`
- `TEST_DB_DRIVER`, `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_NAME`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_SSLMODE`

Notes:
- `.env.example` includes both full-URL and component-based examples.
- Backend CORS and Socket.IO allowed origin are hardcoded to `http://localhost:5173`.

## Database Access (Local Docker)

Development DB:
- Host: `localhost`
- Port: `5432`
- Database: `kitchensync`
- Username: `postgres`
- Password: `postgres`
- CLI: `make db-cli`

Test DB:
- Host: `localhost`
- Port: `5433`
- Database: `kitchensync_test`
- Username: `postgres`
- Password: `postgres`
- CLI: `make test-db-cli`

## Makefile Shortcuts

- `make db-up` / `make db-down` / `make db-logs` / `make db-cli` / `make db-reset`
- `make test-db-up` / `make test-db-down` / `make test-db-logs` / `make test-db-cli` / `make test-db-reset`
- `make seed` (seeds development DB)
- `make test-seed` (seeds test DB using the same `backend/seed.py`)
- `make backend-dev`
- `make frontend-dev`
- `make test` (runs `pytest -qv` in `backend/`)
- `make clean`

## Development Notes

- Always run backend with `python run.py` (not `flask run`) so Socket.IO runs with eventlet.
- No migrations are used in this MVP; schema is created via SQLAlchemy `create_all()`.
- `backend/seed.py` resets backend tables (`drop_all()` then `create_all()`) before inserting sample data.
- Frontend API/socket defaults are same-origin in deployed builds.
- Frontend env values can be configured with `frontend/.env` (see `frontend/.env.example`).
- `stateChanged` is the realtime broadcast event used for client refetch.
- Frontend unit tests run via Vitest (`cd frontend && npm test`).
- Frontend logging level can be controlled with `VITE_LOG_LEVEL` (`debug|info|warn|error`), defaulting to `debug` in dev and `warn` otherwise.
- Landing behavior:
  - Visiting `/` directly redirects authenticated users by role.
  - Navbar `Home` links to an explicit landing view (`/?landing=1`) without forcing role redirect.

## Troubleshooting

- If DB connection fails, verify Docker containers are running and `DATABASE_URL` matches the right port (`5432` dev, `5433` test).
- If you hit SQL errors about missing columns/tables after pulling changes, reset and reseed local DB:
  - `make db-reset`
  - `cd backend && python seed.py`
- If `make test` fails with `pytest: command not found`, install pytest in the backend venv (`pip install pytest`).
- If `npm test` times out in `frontend/src/App.test.tsx`, ensure you're on the latest test file changes (the current suite expects real timers, not forced fake timers).
