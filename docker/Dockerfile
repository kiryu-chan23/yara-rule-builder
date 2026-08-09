# ============================================================
# TASK D1 — Multi-stage image  (do this after F6 is green)
# ============================================================
# STAGE 1 "web": node:20-alpine
#   copy frontend/package*.json, npm ci, copy frontend/, npm run build
#   -> /app/frontend/dist
#
# STAGE 2 "app": python:3.12-slim
#   copy backend/requirements.txt, pip install --no-cache-dir -r
#   copy backend/
#   COPY --from=web /app/frontend/dist ./frontend/dist
#   run gunicorn, NOT flask run:
#     CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:8000", "app:create_app()"]
#   (add gunicorn to requirements.txt when you get here)
#
# CHECKLIST — a reviewer will look for every one of these:
#   [ ] Non-root user. Create one and USER it before CMD. Running a
#       parser on untrusted input as root in a container is exactly the
#       finding you don't want on a security portfolio project.
#   [ ] No secrets, no .env, no .git in the image (see .dockerignore).
#   [ ] Pinned base image tags — python:3.12-slim, not python:latest.
#   [ ] Layer order: dependency files copied and installed BEFORE
#       application source, so code edits don't reinstall everything.
#   [ ] HEALTHCHECK hitting GET /api/health.
#   [ ] Do not EXPOSE or bind anything other than the app port.
#
# Also write docker-compose.yml at the repo root if you want a one-line
# dev command — optional, but nice in a README.
#
# DONE WHEN:
#   docker build -f docker/Dockerfile -t yara-rule-builder .
#   docker run -p 8000:8000 yara-rule-builder
#   localhost:8000 serves the app, compile works end to end,
#   and `docker exec <id> whoami` does NOT print root.
