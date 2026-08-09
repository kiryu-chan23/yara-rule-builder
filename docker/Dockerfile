# ============================================================
# TASK D1 — Multi-stage production image
# ============================================================
# Build from the REPO ROOT, not from docker/:
#   docker build -f docker/Dockerfile -t yara-rule-builder .
# Both stages need paths from the root (frontend/ and backend/).
#
# Layout inside the image mirrors the repo, so config.py's
# DEFAULT_STATIC_DIR (BASE_DIR.parent / "frontend" / "dist") resolves
# with no env override. That's the payoff for making the path absolute.

# ---------- Stage 1: build the frontend ----------
FROM node:22-alpine AS web
WORKDIR /build

# Dependency files first: this layer is cached and only reinstalls when
# package*.json changes, not on every source edit.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build          # -> /build/dist


# ---------- Stage 2: the app ----------
FROM python:3.12-slim AS app

# Pinned base tags on both stages, never :latest — a reproducible build
# is the whole point of pinning requirements.txt.

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app/backend

# Same caching logic as the web stage: requirements before source.
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# The built frontend, at the path config.py already expects.
COPY --from=web /build/dist /app/frontend/dist

# Non-root. This process parses attacker-controlled input on a public
# endpoint; running it as root would be the first finding in any review.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# No curl in python:slim, so use the interpreter that's already here.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import os,urllib.request,sys; \
url='http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'); \
sys.exit(0 if urllib.request.urlopen(url, timeout=2).status == 200 else 1)"

# gunicorn, not `flask run` — the dev server is single-threaded and not
# built for public traffic. Shell form so $PORT expands (Render assigns
# it at runtime); exec so gunicorn becomes PID 1 and receives SIGTERM.
CMD ["sh", "-c", "exec gunicorn --workers 2 --timeout 30 --bind 0.0.0.0:${PORT} 'app:create_app()'"]
