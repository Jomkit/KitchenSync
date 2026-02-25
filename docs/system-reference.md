# Current System Reference

This document captures the current implementation shape and runtime behavior.

## Stack And Runtime

- Backend: Flask + Flask-SocketIO + SQLAlchemy + PostgreSQL
- Frontend: Vite + React + TypeScript
- Realtime event model:
  - broadcast `stateChanged`
  - socket request/response `ping -> pong`
- Backend runtime entrypoint: `python run.py` (eventlet mode)

## Implemented API Surface

- Health:
  - `GET /health`
  - `GET /healthz`
- Auth:
  - `POST /auth/login`
  - `GET /auth/me`
  - protected examples: `GET /kitchen/overview`, `GET /foh/overview`
- Menu/Inventory:
  - `GET /menu`
  - `GET /ingredients`
  - `PATCH /ingredients/:id` (kitchen role)
- Reservations:
  - `POST /reservations`
  - `GET /reservations/:id`
  - `PATCH /reservations/:id`
  - `POST /reservations/:id/commit`
  - `POST /reservations/:id/release`
- Admin runtime TTL controls:
  - `GET /admin/reservation-ttl` (`online`, `foh`)
  - `PATCH /admin/reservation-ttl` (`foh` only)
- Internal:
  - `POST /internal/expire_once` (requires `X-Internal-Secret`)

## Frontend Routes

- `/kitchen`
- `/foh`
- `/online`
- `/menu`
- `/online/confirmed`
- `*` (custom Not Found page)

## Reservation + TTL Behavior

- Active reservation timer pill (`TTL`) is shown when `activeReservationId` exists.
- For ordering roles (`online`, `foh`):
  - warning threshold is configurable by FOH (`5..120s`, default `30s`)
  - pill turns red and auto-opens at/below threshold
- When timer elapses in `/online`:
  - UI enters a temporary blocking cleanup overlay
  - interactions are blocked until reservation reconciliation completes

## Pricing, Totals, And Receipt (Current)

- `price_cents` is displayed on menu cards and cart line items.
- Totals are cent-based:
  - subtotal from line totals
  - tax fixed at `8%`
  - optional tip (`15%`, `20%`, `25%`, or custom amount)
  - final total = subtotal + tax + tip
- `/online/confirmed` shows receipt lines plus subtotal/tax/tip/total.
- Receipt is frontend-session scoped (`route state` + `sessionStorage`), not durable/server-authoritative.

## Error Handling (Current)

- Backend:
  - assigns `request_id` per request
  - returns `X-Request-Id` response header
  - standardized API error payload includes:
    - `error`
    - `code`
    - `request_id`
  - global API error handlers cover unknown API routes (`404`) and unhandled exceptions (`500`)
- Frontend:
  - custom Not Found page for unmatched routes
  - app-level React error boundary with crash fallback page
  - improved async error handling in critical pages
  - session/auth failure in `/online` shows inline banner, performs safe cleanup, then redirects

## Current MVP Database Schema

Source of truth: `backend/app/models.py`

- `users`:
  - `email` unique, non-null
  - `password` non-null
  - `role` non-null (`kitchen|foh|online`)
  - `display_name` nullable, non-unique
- `ingredients`:
  - `name` unique, non-null
  - `on_hand_qty` integer
  - `low_stock_threshold_qty` integer, default `5`
  - `is_out` boolean
- `menu_items`:
  - `name` unique, non-null
  - `price_cents` integer, non-null
  - `category` nullable
  - `allergens` nullable CSV string
- `recipes`:
  - `menu_item_id`, `ingredient_id`, `qty_required`
  - unique `(menu_item_id, ingredient_id)`
- `reservations`:
  - `user_id`, `status`, `created_at`, `updated_at`, `expires_at`
  - status values: `active|committed|released|expired`
- `reservation_items`:
  - `reservation_id`, `menu_item_id`, `qty`, `notes`
  - unique `(reservation_id, menu_item_id)`
- `reservation_ingredients`:
  - `reservation_id`, `ingredient_id`, `qty_reserved`
  - unique `(reservation_id, ingredient_id)`

## Production Configuration Snapshot

Primary source for deployment execution is `docs/deploy-gcp.md`.

Current deployed shape:
- Cloud Run single service (API + Socket.IO + static frontend)
- Cloud SQL PostgreSQL
- Artifact Registry image storage
- Secret Manager for runtime secrets
- Cloud Scheduler calling `POST /internal/expire_once`
- GitHub Actions OIDC Workload Identity Federation

Production runtime defaults:
- `APP_ENV=production`
- `ENABLE_INPROCESS_EXPIRATION_JOB=0`
- `PORT=8080`
- production frontend build uses same-origin:
  - `VITE_API_BASE_URL=""`
  - `VITE_SOCKET_URL=""`
