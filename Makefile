.PHONY: db-up db-down seed backend-dev frontend-dev test

db-up:
	docker compose up -d db

db-down:
	docker compose down

seed:
	npm --prefix backend run seed

backend-dev:
	npm --prefix backend run dev

frontend-dev:
	npm --prefix frontend run dev

test:
	npm --prefix backend test
