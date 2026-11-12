# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-build

WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 --fetch-timeout=900000 --maxsockets=5
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

COPY backend/requirements.txt /tmp/requirements.txt
RUN uv pip install --system --no-cache -r /tmp/requirements.txt \
    && useradd --system --uid 10001 --create-home app \
    && mkdir -p /data \
    && chown app:app /data

COPY --chown=app:app backend/app /app/backend/app
COPY --from=frontend-build --chown=app:app /src/frontend/out /app/frontend

ENV DATABASE_PATH=/data/kanban.sqlite3 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/frontend

EXPOSE 8000
USER app

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "asyncio"]
