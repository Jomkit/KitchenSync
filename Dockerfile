FROM python:3.11-slim AS runtime
WORKDIR /app/backend

ENV PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    ENABLE_INPROCESS_EXPIRATION_JOB=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY frontend/dist /app/frontend/dist

EXPOSE 8080

CMD ["python", "run.py"]
