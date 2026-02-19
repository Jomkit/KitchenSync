# KitchenSync Monorepo Skeleton

This repository is organized as a lightweight monorepo with two apps:

- `backend/` – minimal Node.js API server
- `frontend/` – minimal Node.js frontend dev server

## Project structure

```text
.
├── backend/
│   ├── package.json
│   └── src/
├── frontend/
│   ├── package.json
│   └── src/
├── docker-compose.yml
├── Makefile
└── README.md
```

## 1) Start the database (Docker Compose)

```bash
docker compose up -d db
```

Stop it with:

```bash
docker compose down
```

## 2) Run backend

```bash
cd backend
npm install
npm run dev
```

Backend default URL: `http://localhost:4000`

## 3) Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## 4) Run tests

Run backend tests:

```bash
cd backend
npm test
```

Run all tests from repo root:

```bash
make test
```

## Makefile shortcuts

From repo root:

```bash
make db-up
make db-down
make seed
make backend-dev
make frontend-dev
make test
```
