# ============================================================
# TASK B5a — Configuration
# ============================================================
# A small config object (plain class or dataclass) read from env vars
# with sensible defaults. No secrets in this file — defaults only.
#
# AT MINIMUM:
#   MAX_SOURCE_BYTES   default 64 * 1024   — cap on submitted rule text
#   COMPILE_TIMEOUT_S  default 5           — see note below
#   STATIC_DIR         default "../frontend/dist"
#   DEBUG              default False, True only when FLASK_ENV=development
#   CORS_ORIGINS       default "" (none); in dev, "http://localhost:5173"
#
# WHY THE CAP MATTERS: /api/compile parses attacker-controlled input.
# Without a size limit, one large POST ties up a worker. The cap is the
# cheap 90% fix; note in a comment that a real deployment also wants a
# rate limit and a worker timeout in front of it.
#
# On COMPILE_TIMEOUT_S: yara-x is fast and you probably cannot cancel a
# compile mid-flight from Python. Define the constant now, and write a
# comment here recording whether you actually enforce it or not. An
# honest "not enforced yet, here's why" beats a config value that lies.

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_STATIC_DIR = str(BASE_DIR.parent / "frontend" / "dist")


def _env_int(name: str, default: int) -> int:
    """Env vars are strings; fall back to the default rather than crashing."""
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    """
    bool("false") is True in Python — any non-empty string is truthy — so
    compare against known values instead of casting.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    # 64KB cap to stop oversized uploads tying up web workers.
    # Production also needs a rate limiter and gunicorn worker timeouts.
    MAX_SOURCE_BYTES: int = 64 * 1024

    # Not enforced: yara-x runs synchronously in Rust, so Python can't
    # safely cancel a compile mid-flight. Declared for a future
    # worker-level timeout.
    COMPILE_TIMEOUT_S: int = 5

    STATIC_DIR: str = DEFAULT_STATIC_DIR
    DEBUG: bool = False
    CORS_ORIGINS: list = ()

    # H2 — per-IP cap on /api/compile. Generous for a human typing,
    # useless for a script.
    RATE_LIMIT: str = "30/minute"

    # H2 — only enable behind a proxy that sets X-Forwarded-For itself
    # (Render does). If the app is ever exposed directly, this must stay
    # False: a client can forge X-Forwarded-For and sidestep the limiter
    # entirely, which is worse than having no limiter, because it looks
    # like protection.
    TRUST_PROXY: bool = False


def load_config() -> Config:
    is_dev = os.environ.get("FLASK_ENV", "production") == "development"
    origins = os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173" if is_dev else ""
    )
    return Config(
        MAX_SOURCE_BYTES=_env_int("MAX_SOURCE_BYTES", 64 * 1024),
        COMPILE_TIMEOUT_S=_env_int("COMPILE_TIMEOUT_S", 5),
        STATIC_DIR=os.environ.get("STATIC_DIR", DEFAULT_STATIC_DIR),
        DEBUG=is_dev,
        CORS_ORIGINS=[o.strip() for o in origins.split(",") if o.strip()],
        RATE_LIMIT=os.environ.get("RATE_LIMIT", "30/minute"),
        TRUST_PROXY=_env_bool("TRUST_PROXY", False),
    )


CONFIG = load_config()