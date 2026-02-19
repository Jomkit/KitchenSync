# Repository Guidelines

## Architectural Constraints (Non-Negotiable)

This project is a time-boxed MVP (≈6 hours). Optimize for correctness and clarity, not completeness or scale.

Do NOT introduce:
- Node/Express backend (backend must remain Python Flask only)
- Migrations (Alembic / Flask-Migrate)
- Celery, Redis, message brokers, or background workers beyond a simple in-process interval
- Additional services beyond Flask + PostgreSQL
- Component libraries (MUI, shadcn, Chakra, etc.)
- Global state libraries (Redux, Zustand, React Query)
- Optimistic concurrency control
- Event-driven architectures or microservices

WebSocket strategy:
- Emit only one event: `stateChanged`
- Clients must refetch API endpoints
- Do not implement granular/delta synchronization

If unsure whether a feature is in scope, ask before implementing.

## Project Structure & Module Organization
KitchenSync is a small monorepo with two workspaces:
- `backend/`: Flask + Flask-SocketIO service entrypoint in `backend/run.py`, app factory in `backend/app/__init__.py`, and socket events in `backend/app/events.py`.
- `frontend/`: Vite + React + TypeScript app, with UI entrypoint in `frontend/src/main.tsx`.
- `docs/`: planning and proposal notes (`docs/proposal.md`).

Keep backend and frontend concerns isolated; shared contracts should be documented in `docs/` before cross-stack changes.

## Core Domain Rules (Highest Priority)

Reservation correctness is the most important requirement.

Availability calculation:
- ingredient_available = (is_out ? 0 : on_hand_qty - active_reserved_qty)
- Menu item unavailable if any required ingredient is insufficient
- Low stock if ingredient_available <= low_stock_threshold_qty

Reservation requirements:
- Must execute inside a single DB transaction
- Must use SELECT FOR UPDATE on ingredient rows
- Must prevent negative inventory
- Must return structured 409 errors when insufficient
- Must support states: active, committed, released, expired
- Default TTL: 10 minutes
- Expiration job runs in-process every ~30 seconds

Expiration must:
- Only affect reservations in active state
- Not decrement inventory
- Emit `stateChanged` when any reservation expires

Commit must:
- Verify reservation is active and not expired
- Decrement on_hand_qty
- Mark reservation committed
- Be idempotent-safe

## Build, Test, and Development Commands
- `cd frontend && npm install`: install frontend dependencies.
- `cd frontend && npm run dev`: run Vite dev server on localhost.
- `cd frontend && npm run build`: run TypeScript project build (`tsc -b`) and production bundle.
- `cd frontend && npm run preview`: preview the production build locally.
- `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`: backend setup.
- `cd backend && python run.py`: start Flask-SocketIO server (default `0.0.0.0:5000`).
- `cd backend && docker compose up -d`: start local Postgres services (`db` on `5432`, `db_test` on `5433`).

The backend must always be started using `python run.py` so that Flask-SocketIO runs with eventlet. Do not use `flask run`.

Database schema is created using SQLAlchemy `create_all()` and seeded with `seed.py`. Migrations are intentionally excluded for MVP.

## Coding Style & Naming Conventions
- Python: PEP 8, 4-space indentation, `snake_case` for functions/modules, explicit typing where practical.
- TypeScript/React: 2-space indentation, `PascalCase` for components, `camelCase` for variables/functions.
- Keep modules focused: route/app setup in `backend/app/__init__.py`; socket handlers in `backend/app/events.py`.
- No formatter/linter is currently configured; keep style consistent with existing files.

### MVP discipline:
- Keep files small and focused.
- Prefer explicit logic over abstraction.
- Avoid creating reusable frameworks or generic service layers.
- Avoid premature optimization.
- Avoid adding helper utilities unless directly needed.

## Testing Guidelines

Backend tests are required and prioritized over frontend tests.

Required backend tests (maximum 6):
- Reservation succeeds when sufficient inventory
- Reservation fails with 409 when insufficient
- Concurrent reservations under tight inventory result in only one success
- Commit decrements on_hand_qty exactly once
- Expired reservations no longer count toward active_reserved_qty
- Availability reason string is deterministic

Tests must use the `db_test` Postgres container and isolated database state.

Frontend tests are optional for MVP.

## Commit & Pull Request Guidelines
Recent commits use short, imperative summaries (for example, `Add Flask-SocketIO backend foundation`). Follow that style:
- Keep subject lines concise and action-first.
- Group related changes into a single commit.
- Reference issue numbers in the PR description when applicable.

PRs should include:
- What changed and why.
- How to run/verify locally.
- Screenshots or logs for UI/API behavior changes.

## Flask-SocketIO Runtime Requirements

- Must use eventlet async mode.
- Must use `socketio.run(app)`, not `app.run()`.
- Expiration job must not start twice under debug reloader.
- Only emit `stateChanged` events.
