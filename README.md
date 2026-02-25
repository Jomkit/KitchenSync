# KitchenSync

KitchenSync is a monorepo MVP for real-time restaurant inventory and order reservation flows.

## Fast Start (Local Dev)

### Prerequisites
- Python 3.11+
- Node.js 20+ and npm
- Docker with Compose plugin

### 1) Start local databases
```bash
make db-up
make test-db-up
```

### 2) Configure backend environment
```bash
cp backend/.env.example backend/.env
```

### 3) Set up backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python seed.py
python run.py
```

### 4) Start frontend (new terminal)
```bash
cd frontend
npm install
npm run dev
```

### 5) Open app
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:5000/health`

### Demo accounts
- `kitchen@example.com` / `pass`
- `foh@example.com` / `pass`
- `online@example.com` / `pass`

## Daily Commands

- Backend tests: `make backend-test`
- Frontend tests: `make frontend-test`
- Frontend build: `cd frontend && npm run build`
- Stop DB: `make db-down && make test-db-down`

## Repository Layout

- `backend/` Flask + Flask-SocketIO + SQLAlchemy service
- `frontend/` Vite + React + TypeScript UI
- `backend/tests/` backend pytest suite
- `docs/` deployment and technical reference docs

## Documentation Index

Use this README for onboarding and local run steps. Use the docs below for deeper details.

- [Repository Rules And Constraints](AGENTS.md)
- [Local Development Reference](docs/local-development.md)
- [Current System Reference](docs/system-reference.md)
- [Production Deployment (GCP)](docs/deploy-gcp.md)
- [Original MVP Proposal (Historical)](docs/proposal.md)

## Non-Negotiables

- Start backend with `python run.py` (do not use `flask run`).
- Backend remains Flask only (no Node/Express backend).
- No migrations (schema is `create_all()` + `seed.py` for MVP).
