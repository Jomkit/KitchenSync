# MVP Project Blueprint

**Prototype: Real-Time Inventory Sync & Reservation System (Single Restaurant)**

---

# 1. Executive Summary (≤150 words)

This prototype is a real-time inventory and menu synchronization system for a single restaurant. It ensures that when ingredient quantities change, menu availability updates instantly for kitchen and FOH staff, preventing overselling and operational conflicts.

The core outcome: **no item can be sold or reserved if required ingredients are unavailable or insufficient.**

This MVP validates:

* Correct modeling of ingredient → recipe → item relationships
* Atomic reservation logic to prevent race conditions
* Live synchronization between kitchen updates and menu visibility
* Clear failure handling at checkout confirmation

The system is intentionally scoped for a single restaurant, single server, and ~10 concurrent users. It prioritizes correctness, clarity, and reasoning over scale or polish.

This is sufficient to validate the key assumption: that real-time derived availability and transactional reservations eliminate overselling and manual coordination failures.

---

# 2. Scope Definition

## In-Scope (MVP Only)

* Ingredient inventory with quantity tracking
* Per-ingredient configurable low-stock threshold
* Recipe modeling (all ingredients required)
* Derived menu item availability
* Kitchen UI to update inventory
* FOH UI to view menu with:

  * Unavailable reason (“No tomatoes”)
  * Low-stock indicator
* Online cart confirmation flow:

  * Revalidation at confirm step
  * Atomic reservation with TTL
* Reservation expiration job
* JWT-based role authentication
* WebSocket-based live sync
* Basic automated tests for reservation atomicity

Each feature directly supports preventing overselling and keeping views in sync.

---

## Explicitly Out-of-Scope

* Multi-restaurant support
* Payment processing integration
* Substitution engine
* Optional ingredients
* Advanced allergen compliance
* Historical reporting
* Multi-node scaling
* Offline mode
* Admin dashboards
* Fine-grained permission systems

---

# 3. Core User Flow

## Primary Flow: Preventing Oversell

### Kitchen Flow

1. Kitchen logs in (role: kitchen)
2. Updates ingredient quantity or marks ingredient out-of-stock
3. System broadcasts update
4. FOH/Online views update instantly

### Online Flow

1. User builds cart
2. User reaches Confirm screen
3. System revalidates inventory
4. If insufficient:

   * Display precise reason per item
   * Force removal or adjustment
5. If sufficient:

   * Create reservation (atomic)
   * Reduce available inventory
   * Proceed to payment stub

---

### Activation Moment

Kitchen updates inventory and sees FOH view reflect changes instantly.

### Value Delivery Moment

Online reservation either:

* Succeeds atomically
* Or fails with precise, actionable feedback

No shouting. No overselling.

---

# 4. Domain Model (Lightweight)

## Ingredient

* id
* name
* on_hand_qty
* is_out
* low_stock_threshold_qty

## MenuItem

* id
* name
* category
* price

## Recipe

* menu_item_id
* ingredient_id
* qty_required

## Reservation

* id
* status (active, expired, committed)
* expires_at

## ReservationIngredient

* reservation_id
* ingredient_id
* qty_reserved

Relationships:

* MenuItem has many Ingredients via Recipe
* Reservation allocates Ingredients
* Availability is computed, not stored

No premature abstraction.

---

# 5. Technical Architecture (MVP-Level)

**Frontend:** React + Vite
**Backend:** Node.js + Express (modular monolith)
**Database:** SQLite (WAL mode enabled)
**Auth:** JWT with role claim
**Real-time:** Socket.IO
**Background job:** In-process interval for reservation expiration
**Hosting:** Local-first; optional deploy to Render or Railway
**Testing:** Jest or Vitest for backend transactional logic

Architecture:

Single Express app exposing REST endpoints and WebSocket server.
Availability logic lives in service layer.
Reservation logic wrapped in database transactions.
Clients refetch menu on `stateChanged` event.

This minimizes infra complexity while demonstrating real concurrency safety.

---

# 6. Data & Persistence Strategy

**Source of Truth:** SQLite database file.

**Migrations:** Prisma or Drizzle migrations; minimal schema versioning.

**Backup:** Not required for prototype.

**Deletes:** Soft delete not needed; hard delete acceptable.

**Multi-tenancy:** Not implemented (single restaurant assumption).

Reservation expiration reduces “reserved inventory” via status change, not data deletion.

---

# 7. Security Baseline (MVP Appropriate)

**Authentication:**

* JWT signed with local secret
* Login endpoint returns token

**Authorization:**

* Role-based middleware
* Explicit route guards (kitchen vs foh vs online)

**Threat considerations:**

* Prevent unauthorized inventory edits
* Validate input quantities server-side
* Prevent negative inventory

**Secrets management:**

* `.env` file (not committed)

No enterprise compliance required.

---

# 8. Reliability & Operations (Prototype Level)

**Logging:**

* Console logging for inventory updates and reservations
* Structured log for reservation failures

**Error handling:**

* Central Express error middleware

**Deployment flow:**

* Local run via `npm run dev`
* Optional Dockerfile if time permits

**Rollback strategy:**

* Git revert

**Observability:**

* Manual console observation sufficient

---

# 9. Cost Model (Rough)

Local prototype → $0.

If deployed:

* Hosting (Render/Railway): ~$7–15/month
* No external APIs
* SQLite negligible cost

Cost scales linearly with:

* Concurrent users (memory)
* Reservation frequency

Major cost increase would come from:

* Multi-node scaling
* Moving to managed Postgres

---

# 10. Risk Assessment

## Top Technical Risks

1. Reservation race condition
   → Mitigation: transaction + test

2. SQLite locking under concurrent writes
   → Mitigation: WAL mode + small scale assumption

3. Reservation expiration correctness
   → Mitigation: TTL job + unit test

---

## Top Product Risks

1. Low-stock buffer insufficient → still surprises users
2. UI clarity under failure
3. Kitchen forgetting to update inventory

---

## De-Risk Experiments

* Write failing tests for concurrent reservations
* Simulate two reservation calls simultaneously
* Manual test rapid inventory toggling

---

# 11. Future Evolution Path (≤150 words)

After traction:

* Move to PostgreSQL for stronger concurrency guarantees
* Separate reservation and inventory services if scaling
* Introduce substitution modeling
* Add multi-restaurant tenancy
* Add event sourcing for inventory audit
* Replace interval expiration with job queue (BullMQ)

Refactor availability computation into a domain module with test coverage.

Scale WebSocket layer via Redis pub/sub if multi-instance needed.

