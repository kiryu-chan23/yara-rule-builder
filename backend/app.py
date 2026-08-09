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
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
from config import CONFIG
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

    for error_code in (400, 404, 405, 413, 500):
        app.register_error_handler(error_code, make_json_error)

    return app


if __name__ == "__main__":
    # Local dev only. debug is tied to config: the Werkzeug debugger is
    # remote code execution if it ever runs on a public host.
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=CONFIG.DEBUG)

    
    