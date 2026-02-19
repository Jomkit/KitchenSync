.DEFAULT_GOAL := help

.PHONY: help db-up db-down db-logs db-reset db-cli test-db-up test-db-down test-db-logs test-db-reset test-db-cli seed test-seed backend-dev frontend-dev test clean

help:
	@echo "Usage: make <target>"
	@echo "  help           Show this help"
	@echo "  db-up          Start dev Postgres service (db)"
	@echo "  db-down        Stop dev Postgres service (db)"
	@echo "  db-logs        Tail logs for dev Postgres service (db)"
	@echo "  db-cli         Open psql shell for dev Postgres service (db)"
	@echo "  db-reset       DESTRUCTIVE: recreate dev Postgres volume/service"
	@echo "  test-db-up     Start test Postgres service (db_test)"
	@echo "  test-db-down   Stop test Postgres service (db_test)"
	@echo "  test-db-logs   Tail logs for test Postgres service (db_test)"
	@echo "  test-db-cli    Open psql shell for test Postgres service (db_test)"
	@echo "  test-db-reset  DESTRUCTIVE: recreate test Postgres volume/service"
	@echo "  seed           Seed development database (APP_ENV=development)"
	@echo "  test-seed      Seed test database (APP_ENV=test)"
	@echo "  backend-dev    Run backend dev server"
	@echo "  frontend-dev   Run frontend dev server"
	@echo "  test           Run backend tests (assumes db_test is up)"
	@echo "  clean          Remove Python/Frontend build cache artifacts"

db-up:
	docker compose -f backend/docker-compose.yml up -d db

db-down:
	docker compose -f backend/docker-compose.yml stop db

db-logs:
	docker compose -f backend/docker-compose.yml logs -f db

db-cli:
	docker compose -f backend/docker-compose.yml exec db psql -U postgres -d kitchensync

db-reset:
	@echo "WARNING: DESTRUCTIVE: removing dev database volume/service"
	docker compose -f backend/docker-compose.yml stop db
	docker compose -f backend/docker-compose.yml rm -f -s -v db
	docker compose -f backend/docker-compose.yml up -d db

test-db-up:
	docker compose -f backend/docker-compose.yml up -d db_test

test-db-down:
	docker compose -f backend/docker-compose.yml stop db_test

test-db-logs:
	docker compose -f backend/docker-compose.yml logs -f db_test

test-db-cli:
	docker compose -f backend/docker-compose.yml exec db_test psql -U postgres -d kitchensync_test

test-db-reset:
	@echo "WARNING: DESTRUCTIVE: removing test database volume/service"
	docker compose -f backend/docker-compose.yml stop db_test
	docker compose -f backend/docker-compose.yml rm -f -s -v db_test
	docker compose -f backend/docker-compose.yml up -d db_test

seed:
	cd backend && python seed.py

test-seed:
	cd backend && APP_ENV=test python seed.py

backend-dev:
	cd backend && python run.py

frontend-dev:
	cd frontend && npm run dev

test:
	cd backend && pytest -q

clean:
	find backend -type d -name '__pycache__' -prune -exec rm -rf {} +
	find backend -type f -name '*.pyc' -delete
	rm -rf frontend/dist frontend/.vite frontend/node_modules/.vite
