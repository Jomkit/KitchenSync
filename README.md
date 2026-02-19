# KitchenSync

KitchenSync is a small monorepo for a restaurant inventory and reservation MVP.

Backend uses Flask + Flask-SocketIO + SQLAlchemy + PostgreSQL. Frontend uses Vite + React + TypeScript.

## Read This First

- `AGENTS.md` contains non-negotiable architecture constraints and MVP rules.
- `docs/proposal.md` is an early planning document and includes outdated stack notes in some sections. Use the codebase as the source of truth.

## Repository Layout

- `backend/` Flask-SocketIO service, SQLAlchemy models, DB setup, seed script
- `frontend/` React dashboard (Vite)
- `docs/` planning notes
- `Makefile` root shortcuts for local development

## Current Implementation Status

Implemented today:
- Flask-SocketIO app with eventlet runtime (`backend/run.py`)
- Health endpoint: `GET /health`
- Socket event: client `ping` -> server `pong`
- PostgreSQL Docker services for dev/test (`backend/docker-compose.yml`)
- SQLAlchemy domain models in `backend/app/models.py`
- Schema bootstrap via `create_all()` and sample data seed via `backend/seed.py`
- Frontend dashboard that connects to Socket.IO and listens for `stateChanged`

Not implemented yet:
- Backend REST endpoints used by frontend (`/menu`, `/ingredients`)
- Reservation API flows and expiration worker behavior
- Backend test suite files (Make target exists, but tests are not yet committed)

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

4. Initialize schema and seed sample data:
```bash
make seed
```

5. Start backend (required entrypoint):
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

## Environment Variables

Environment variables are centralized in `backend/config.py`, which loads `backend/.env` at startup and exposes typed settings to the backend runtime.

Backend reads these values:

- `APP_ENV` default: `development` (`test` switches DB resolution to test config)
- `DATABASE_URL` preferred for cloud/staging/prod (secret-managed full URL)
- `HOST` default: `0.0.0.0`
- `PORT` default: `5000`
- `FLASK_DEBUG` set to `1` to enable debug/reloader

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
- `make test` (runs `pytest -q` in `backend/`)
- `make clean`

## Development Notes

- Always run backend with `python run.py` (not `flask run`) so Socket.IO runs with eventlet.
- No migrations are used in this MVP; schema is created via SQLAlchemy `create_all()`.
- Frontend currently hardcodes backend URL to `http://localhost:5000` in `frontend/src/App.tsx`.
- `stateChanged` is the only intended realtime broadcast event for data refresh.

## Troubleshooting

- If frontend shows request errors for menu/ingredients, that is expected until `/menu` and `/ingredients` endpoints are implemented in backend.
- If DB connection fails, verify Docker containers are running and `DATABASE_URL` matches the right port (`5432` dev, `5433` test).
- If `make test` fails with `pytest: command not found`, install pytest in the backend venv (`pip install pytest`).
