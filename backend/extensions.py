# ============================================================
# Shared Flask extensions
# ============================================================
# The limiter lives here rather than in app.py so api/rules.py can
# decorate individual routes with it without importing app.py — which
# would be a circular import, since app.py imports the blueprint.

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# NOTE ON STORAGE: this defaults to in-memory. With gunicorn running two
# workers, each worker keeps its own counter, so the effective limit is
# roughly double what's configured. Acceptable for now — the goal is to
# stop trivial hammering, not to be exact. A shared Redis backend is the
# real fix and the point at which the limit becomes accurate.
#
# key_func=get_remote_address reads request.remote_addr, which is only
# the true client IP when ProxyFix is active (see app.py). Behind a proxy
# without ProxyFix, every request shares one key and the first heavy user
# locks out everyone.
limiter = Limiter(key_func=get_remote_address)
