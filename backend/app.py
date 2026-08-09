# ============================================================
# TASK B5 — Flask app factory + static frontend serving
# ============================================================
# WRITE:
#   def create_app(config=None) -> Flask
#   if __name__ == "__main__": create_app().run(...)   # dev only
#
# THE FACTORY MUST:
#   1. Load config.py.
#   2. Register rules_bp from api/rules.py.
#   3. Enable CORS for CORS_ORIGINS ONLY when DEBUG is on. In prod the
#      frontend is served from this same origin, so CORS is not just
#      unnecessary — leaving it wide open is a real finding.
#   4. Serve the built frontend:
#        GET /            -> STATIC_DIR/index.html
#        GET /assets/...  -> the hashed Vite bundles
#        GET /<anything>  -> index.html   (SPA fallback)
#      but NEVER let the SPA fallback swallow /api/* — an unknown API
#      path must 404 as JSON, not return an HTML page. Frontend fetch
#      code that gets HTML where it expected JSON produces a baffling
#      error; save yourself the hour.
#   5. Register JSON error handlers for 400/404/405/500 so the API
#      never returns Flask's HTML error pages.
#
# PATH TRAVERSAL: if you write your own static route, do not pass the
# URL path to open() or send_file() unsanitised. Use send_from_directory,
# which resolves and confines to the base dir. Never string-concatenate
# STATIC_DIR + user-supplied path.
#
# DONE WHEN:
#   flask --app app run --debug   starts clean
#   GET /api/health               -> 200 JSON
#   GET /api/nonexistent          -> 404 JSON (not HTML)
#   GET /some/spa/route           -> index.html (once frontend is built)

import os
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from config import CONFIG
from extensions import limiter
from api.rules import rules_bp

def create_app(test_config=None) -> Flask:
    """Flask application factory that configures API routing and frontend serving."""
    app = Flask(__name__)

    # One config object shared with the services layer (compiler.py, rules.py).
    config = test_config or CONFIG
    app.config.from_object(config)

    # H1 — transport-level body cap. compile_rule's own 64 KB guard runs only
    # after Flask has read and parsed the whole body, so without this a huge
    # POST is absorbed into memory before anything checks it. Headroom covers
    # JSON quoting/escaping so a legitimate max-size rule still gets through.
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_SOURCE_BYTES + 4096

    # H2 — trust X-Forwarded-For, but ONLY when we know a proxy sets it.
    # Render terminates TLS and forwards, so remote_addr is Render's proxy
    # and every visitor would share one rate-limit bucket. ProxyFix reads
    # the real client IP from the header instead.
    #
    # Off by default and gated on config: if this app is ever run directly
    # on a public port with ProxyFix enabled, a client can forge
    # X-Forwarded-For and get a fresh rate-limit bucket per request. That
    # is worse than no limiter, because it looks like protection.
    if config.TRUST_PROXY:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    # H2 — the limiter itself. Individual routes opt in; see api/rules.py.
    limiter.init_app(app)

    # 2. Register API endpoints
    app.register_blueprint(rules_bp)

    # 3. Enable CORS for development environments only
    if app.config.get("DEBUG") and app.config.get("CORS_ORIGINS"):
        CORS(app, resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS")}})

    # Ensure static directory absolute resolution
    static_dir = os.path.abspath(app.config.get("STATIC_DIR", "../frontend/dist"))

    # 4. Serve the static frontend assets & handle Single Page Application (SPA) routing
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        # Never let the SPA fallback answer an /api/* path. Frontend fetch code
        # that receives index.html where it expected JSON fails confusingly.
        if path == "api" or path.startswith("api/"):
            return jsonify({"error": "Not Found"}), 404

        # Serve existing physical assets directly (e.g., assets/index-B123.js)
        if path and os.path.exists(os.path.join(static_dir, path)):
            return send_from_directory(static_dir, path)

        # Fallback to index.html for virtual frontend SPA routes (e.g., /rules/edit)
        return send_from_directory(static_dir, "index.html")

    # 5. JSON error responses. Without these, Flask returns HTML error pages
    # and the frontend's response.json() blows up on a stray 404 or 405.
    def make_json_error(e):
        code = getattr(e, "code", 500)
        message = getattr(e, "description", "Internal Server Error")
        return jsonify({"error": message, "status": code}), code

    # 429 included so a rate-limited client gets JSON, not an HTML page.
    for error_code in (400, 404, 405, 413, 429, 500):
        app.register_error_handler(error_code, make_json_error)

    # ============================================================
    # H3 — security headers
    # ============================================================
    @app.after_request
    def set_security_headers(response):
        # Stop the browser guessing content types. Without it, a response
        # the browser decides "looks like HTML" can be rendered as HTML.
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Don't leak full URLs to third parties on outbound navigation.
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # No framing. Revisit when A1 (ads in a cross-origin iframe) lands:
        # that iframes THEM into US, which this does not block. This stops
        # someone framing us for clickjacking.
        response.headers["X-Frame-Options"] = "DENY"

        # Features this app has no reason to touch.
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        )

        # CSP.
        #
        # style-src NEEDS 'unsafe-inline' and here is why: CodeMirror 6
        # injects its theme as <style> elements at runtime (EditorView.theme
        # generates them), and the lint gutter does the same. With a strict
        # style-src the editor renders unstyled — no dark theme, no gutter
        # colours, no error highlighting. The alternatives are a per-request
        # nonce threaded through the SPA bootstrap, or hashing every
        # generated style. Neither is worth it while the app has no
        # user-generated HTML anywhere: error text goes into the DOM as
        # text via React, never as markup.
        #
        # script-src stays strict. That is the directive that matters for
        # XSS, and nothing here needs inline script.
        response.headers["Content-Security-Policy"] = "; ".join([
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ])

        # HSTS only when the request arrived over HTTPS — setting it on a
        # plain-HTTP dev response would pin localhost to HTTPS in your
        # browser and be a nuisance to undo.
        if request.is_secure:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        return response

    return app


if __name__ == "__main__":
    # Local dev only. debug is tied to config: the Werkzeug debugger is
    # remote code execution if it ever runs on a public host.
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=CONFIG.DEBUG)

    
    