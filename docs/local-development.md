# Local Development Reference

This document covers local environment details that are intentionally kept out of the quickstart README.

## Environment Variables

Backend env is centralized in `backend/config.py`, loaded from `backend/.env`.

Core backend vars:
- `APP_ENV` default: `development`
- `DATABASE_URL` preferred in cloud/staging/prod
- `HOST` default: `0.0.0.0`
- `PORT` default: `5000`
- `FLASK_DEBUG` default: `0`
- `JWT_SECRET_KEY` default: `dev-change-me`
- `JWT_ALGORITHM` default: `HS256`
- `JWT_ACCESS_TOKEN_TTL_MINUTES` default: `60`
- `RESERVATION_TTL_SECONDS` default: `600`
- `RESERVATION_WARNING_THRESHOLD_SECONDS` default: `30` (must be `5..120`)
- `EXPIRATION_INTERVAL_SECONDS` default: `30`
- `ENABLE_INPROCESS_EXPIRATION_JOB` default:
  - `1` in local/dev
  - `0` in production/staging
- `INTERNAL_EXPIRE_SECRET` required in production/staging
- `CORS_ALLOWED_ORIGINS` default: `http://localhost:5173`
- `FRONTEND_DIST_DIR` default: `../frontend/dist`
- `LOG_LEVEL` default: `INFO`

Database URL resolution in `backend/config.py`:
1. `APP_ENV=test` + `TEST_DATABASE_URL` if present
2. `DATABASE_URL` if present
3. `APP_ENV=test` -> build from `TEST_DB_*`
4. otherwise build from `DB_*`

Production/staging safeguard:
- If `APP_ENV` is `production` or `staging` and `DATABASE_URL` is missing, the app fails unless required `DB_*` parts are set.

## Local Database Access

Development DB:
- host: `localhost`
- port: `5432`
- database: `kitchensync`
- user/password: `postgres` / `postgres`
- CLI: `make db-cli`

Test DB:
- host: `localhost`
- port: `5433`
- database: `kitchensync_test`
- user/password: `postgres` / `postgres`
- CLI: `make test-db-cli`

## Makefile Shortcuts

- DB lifecycle:
  - `make db-up`, `make db-down`, `make db-logs`, `make db-cli`, `make db-reset`
  - `make test-db-up`, `make test-db-down`, `make test-db-logs`, `make test-db-cli`, `make test-db-reset`
- Seeding:
  - `make seed` (dev DB)
  - `make test-seed` (test DB)
- App run:
  - `make backend-dev`
  - `make frontend-dev`
- Tests:
  - `make backend-test`
  - `make frontend-test`
  - `make test` (alias of backend tests)
- Cleanup:
  - `make clean`

## Development Notes

- Backend must run with `python run.py` so Socket.IO uses eventlet.
- Schema management is `create_all()` + `seed.py` (no migrations in MVP).
- `backend/seed.py` performs `drop_all()` then `create_all()` before sample data insert.
- Frontend env values can be set in `frontend/.env` (`frontend/.env.example` for guidance).
- Frontend logging level uses `VITE_LOG_LEVEL` (`debug|info|warn|error`).
- Landing behavior:
  - `/` redirects authenticated users by role
  - `/?landing=1` forces explicit landing view

## Troubleshooting

- DB connection failures:
  - confirm Docker containers are running
  - verify correct port (`5432` dev, `5433` test)
- Missing tables/columns after pulling:
  - `make db-reset`
  - `cd backend && python seed.py`
- `make test` fails with `pytest: command not found`:
  - activate backend venv
  - install pytest in venv
