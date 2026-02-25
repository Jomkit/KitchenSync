# KitchenSync GCP Deployment Plan (Cloud Run + Cloud SQL + Scheduler + GitHub Actions)

This document is the implementation-ready plan for deploying KitchenSync as a stable demo on GCP using a single Cloud Run service, Cloud SQL (PostgreSQL), Secret Manager, Cloud Scheduler, Artifact Registry, and GitHub Actions Pattern A (build in GitHub, push image, deploy).

## 1) Repo Findings (from current code)

- Backend production start command (Socket.IO/eventlet): `cd backend && python run.py`
- Server bind to `$PORT`: yes (`backend/config.py` reads `PORT`, `backend/run.py` uses `socketio.run(app, host, port)`).
- Required env vars currently used:
  - `DATABASE_URL` (preferred) or `DB_*` / `TEST_DB_*`
  - `APP_ENV`, `HOST`, `PORT`, `FLASK_DEBUG`, `LOG_LEVEL`
  - `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_TTL_MINUTES`
  - Added for deployment: `INTERNAL_EXPIRE_SECRET`, `ENABLE_INPROCESS_EXPIRATION_JOB`, `RESERVATION_TTL_SECONDS`, `RESERVATION_WARNING_THRESHOLD_SECONDS`, `EXPIRATION_INTERVAL_SECONDS`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_DIST_DIR`
- DB config model: full SQLAlchemy URL from `DATABASE_URL` preferred, otherwise built from split vars in `backend/config.py`. Expected format is SQLAlchemy URL (example: `postgresql+psycopg2://user:pass@host:5432/dbname`).
- Socket.IO initialization/serving:
  - Global `socketio = SocketIO(...)` in `backend/app/__init__.py`
  - `socketio.init_app(app, async_mode="eventlet")`
  - Runtime started with `socketio.run(...)` in `backend/run.py`
  - No manual monkey patching present.
- Frontend build command/output:
  - `cd frontend && npm run build`
  - Vite output: `frontend/dist`
- Flask static serving before changes: no.
- Flask static serving now: yes (serves `FRONTEND_DIST_DIR`, default `../frontend/dist`, with SPA fallback).
- Frontend API/socket URL before changes: hardcoded `http://localhost:5000`.
- Frontend API/socket URL defaults are same-origin in deployed builds.
- `seed.py` location/behavior:
  - Location: `backend/seed.py`
  - It runs `Base.metadata.drop_all(bind=engine)` then `create_all()`.
  - It is deterministic reset-style, not additive idempotent.
- Expire callable:
  - Already implemented in `backend/app/reservation_expiration.py` as `expire_reservations_once_and_emit()`.
  - New HTTP trigger now exists at `POST /internal/expire_once`.

## 2) Single-Container Runtime

- Uses root `Dockerfile` runtime stage for backend deps and Flask-SocketIO app.
- Frontend build is produced in GitHub Actions and copied into image at `/app/frontend/dist`.
- Container command: `python run.py`
- Cloud Run compatibility:
  - Binds to `PORT=8080`.
  - Same-origin API + WebSocket on one service.
  - Demo scaling enforced via deploy config (`--max-instances=1`).

## 3) Cloud SQL (Postgres) Integration

- App uses `DATABASE_URL` from Secret Manager.
- Cloud Run attaches Cloud SQL connector with `--set-cloudsql-instances`.
- Use Unix socket connection URL in `DATABASE_URL`:
  - `postgresql+psycopg2://DB_USER:DB_PASSWORD@/DB_NAME?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME`

## 4) Deterministic Schema + Seed (No Alembic)

- Seed command: `python seed.py`
- Current seed is reset-based deterministic (drops and recreates schema and data).
- Preferred production-safe demo method: run as Cloud Run Job against Cloud SQL.

## 5) TTL Expiration via Scheduler

- Endpoint implemented: `POST /internal/expire_once`
- Auth header: `X-Internal-Secret: <INTERNAL_EXPIRE_SECRET>`
- Returns JSON including `expired_count`.
- Scheduler triggers every 60 seconds.

## 6) GCP Setup Commands

Set variables first:

```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export SERVICE="kitchensync"
export REPO="kitchensync"
export DB_INSTANCE="kitchensync-pg"
export DB_NAME="kitchensync"
export DB_USER="kitchensync_app"
export CLOUD_SQL_CONNECTION="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
```

Enable APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  --project "${PROJECT_ID}"
```

Artifact Registry:

```bash
gcloud artifacts repositories create "${REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="KitchenSync images" \
  --project="${PROJECT_ID}"
```

Cloud SQL instance/database/user:

```bash
gcloud sql instances create "${DB_INSTANCE}" \
  --database-version=POSTGRES_16 \
  --cpu=1 \
  --memory=3840MiB \
  --region="${REGION}" \
  --project="${PROJECT_ID}"

gcloud sql databases create "${DB_NAME}" \
  --instance="${DB_INSTANCE}" \
  --project="${PROJECT_ID}"

export DB_PASSWORD="$(openssl rand -base64 24)"
gcloud sql users create "${DB_USER}" \
  --instance="${DB_INSTANCE}" \
  --password="${DB_PASSWORD}" \
  --project="${PROJECT_ID}"
```

Secrets:

```bash
printf '%s' "postgresql+psycopg2://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION}" \
  | gcloud secrets create DATABASE_URL --data-file=- --project "${PROJECT_ID}"

openssl rand -base64 32 | gcloud secrets create JWT_SECRET_KEY --data-file=- --project "${PROJECT_ID}"
openssl rand -base64 32 | gcloud secrets create INTERNAL_EXPIRE_SECRET --data-file=- --project "${PROJECT_ID}"
```

Runtime service account:

```bash
export RUNTIME_SA="kitchensync-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create kitchensync-runtime --project "${PROJECT_ID}"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

Initial manual deploy (same shape CI uses):

```bash
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:manual"
gcloud builds submit --tag "${IMAGE}" --project "${PROJECT_ID}"

gcloud run deploy "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --platform=managed \
  --image="${IMAGE}" \
  --allow-unauthenticated \
  --service-account="${RUNTIME_SA}" \
  --max-instances=1 \
  --memory=1Gi \
  --timeout=900 \
  --set-cloudsql-instances="${CLOUD_SQL_CONNECTION}" \
  --set-env-vars="APP_ENV=production,ENABLE_INPROCESS_EXPIRATION_JOB=0" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,JWT_SECRET_KEY=JWT_SECRET_KEY:latest,INTERNAL_EXPIRE_SECRET=INTERNAL_EXPIRE_SECRET:latest"
```

## 7) Seed Job (Preferred)

Create job:

```bash
gcloud run jobs create kitchensync-seed \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${RUNTIME_SA}" \
  --set-cloudsql-instances="${CLOUD_SQL_CONNECTION}" \
  --set-env-vars="APP_ENV=production" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,INTERNAL_EXPIRE_SECRET=INTERNAL_EXPIRE_SECRET:latest" \
  --command="python" \
  --args="seed.py"
```

Run job:

```bash
gcloud run jobs execute kitchensync-seed \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --wait
```

## 8) Scheduler Job (every 60s)

```bash
export SERVICE_URL="$(gcloud run services describe ${SERVICE} --region=${REGION} --project=${PROJECT_ID} --format='value(status.url)')"
export EXPIRE_SECRET="$(gcloud secrets versions access latest --secret=INTERNAL_EXPIRE_SECRET --project=${PROJECT_ID})"

gcloud scheduler jobs create http kitchensync-expire-once \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --schedule="* * * * *" \
  --uri="${SERVICE_URL}/internal/expire_once" \
  --http-method=POST \
  --headers="X-Internal-Secret=${EXPIRE_SECRET}" \
  --attempt-deadline=30s
```

## 9) GitHub Actions Pattern A (OIDC/WIF)

### 9.1 Create deployer service account

```bash
export GH_SA_NAME="github-deployer"
export GH_SA_EMAIL="${GH_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create "${GH_SA_NAME}" --project "${PROJECT_ID}"
```

Grant minimum roles to deployer SA:

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${GH_SA_EMAIL}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${GH_SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${GH_SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"
```

### 9.2 Create WIF pool/provider for GitHub

```bash
export GH_OWNER="your-github-org-or-user"
export GH_REPO="KitchenSync"
export WIF_POOL_ID="github-pool"
export WIF_PROVIDER_ID="github-provider"

gcloud iam workload-identity-pools create "${WIF_POOL_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${WIF_POOL_ID}" \
  --display-name="GitHub Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GH_OWNER}/${GH_REPO}'"

gcloud iam service-accounts add-iam-policy-binding "${GH_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')/locations/global/workloadIdentityPools/${WIF_POOL_ID}/attribute.repository/${GH_OWNER}/${GH_REPO}"

export WORKLOAD_IDENTITY_PROVIDER="projects/$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')/locations/global/workloadIdentityPools/${WIF_POOL_ID}/providers/${WIF_PROVIDER_ID}"
echo "${WORKLOAD_IDENTITY_PROVIDER}"
```

### 9.3 GitHub repo variables/secrets

Set as GitHub repository variables (`Settings -> Secrets and variables -> Actions -> Variables`):

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `CLOUD_RUN_SERVICE`
- `ARTIFACT_REGISTRY_REPO`
- `WORKLOAD_IDENTITY_PROVIDER`
- `SERVICE_ACCOUNT_EMAIL`
- `CLOUD_SQL_CONNECTION`

No GitHub secrets are required for GCP auth in this pattern (OIDC keyless).

## 10) Verification Checklist

Health:

```bash
curl -i "${SERVICE_URL}/healthz"
```

Login:

```bash
curl -i -X POST "${SERVICE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"online@example.com","password":"pass"}'
```

Manual expire_once:

```bash
curl -i -X POST "${SERVICE_URL}/internal/expire_once" \
  -H "X-Internal-Secret: ${EXPIRE_SECRET}"
```

WebSocket/stateChanged:

- Open frontend on Cloud Run URL.
- Create/update/commit/release a reservation and confirm clients refetch after `stateChanged`.

TTL expiry:

- Create reservation, wait slightly over 60 seconds, confirm reservation no longer counted as active hold.
- Check Cloud Run logs for `expire_reservations_once completed expired_count=...`.

FOH runtime TTL + timer UX:

- As FOH, verify `PATCH /admin/reservation-ttl` works with TTL values 1-15 minutes.
- As FOH, verify warning threshold can be updated via `PATCH /admin/reservation-ttl` with `warning_threshold_seconds` values 5-120.
- As FOH and online users, verify `GET /admin/reservation-ttl` returns current runtime TTL and warning threshold.
- Confirm floating `TTL` pill appears on authenticated pages when an active reservation exists.
- Confirm hover opens transparent timer panel and click pins it open with solid styling.
- Confirm ordering-role warning behavior (`online` + `foh`): pill turns red and auto-opens when remaining time is at/below warning threshold.
- Confirm timer-elapsed UX on `/online`: blocking overlay appears while reservation status is reconciled and ordering controls are not interactive until cleanup resolves.

CI deploy:

- Push to `main`.
- Confirm workflow `test-build-deploy` passes.
- Confirm Cloud Run revision updates to image tagged with commit SHA.
