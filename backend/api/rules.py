# ============================================================
# TASK B4 — The compile endpoint
# ============================================================
# A Flask Blueprint named `rules_bp`, url_prefix="/api".
#
# ENDPOINT:
#   POST /api/compile
#   Request  JSON: { "source": "<rule text>" }
#   Response JSON: {
#     "ok": true|false,
#     "errors":   [ {message, line, column, severity, raw}, ... ],
#     "warnings": [ ... same shape ... ],
#     "ruleNames": ["a", "b"]
#   }
#
# STATUS CODES — decide and be consistent:
#   200 — request understood, compile ran (ok may be true OR false).
#         A rule that fails to compile is a SUCCESSFUL API call.
#   400 — malformed request: body isn't JSON, "source" key missing,
#         "source" isn't a string, source exceeds the size cap.
#   Do not return 500 for a bad rule. Write a one-line comment here
#   stating your choice so future-you doesn't second-guess it.
#
# ALSO:
#   - Add GET /api/health returning {"status": "ok"} — Docker and any
#     future deploy target will want it.
#   - Validate before you trust: request.get_json(silent=True) can
#     return None. Handle it.
#   - Return camelCase to the frontend (ruleNames), snake_case inside
#     Python. Do the conversion in RuleError.to_dict(), not here.
#
# DONE WHEN:
#   curl -X POST localhost:5000/api/compile -H "Content-Type: application/json" ^
#     -d "{\"source\":\"rule a { condition: true }\"}"
#     -> 200, {"ok":true,"ruleNames":["a"],...}
#   Same call with "rule a {" -> 200, {"ok":false,"errors":[{"line":1,...}]}
#   curl -X POST localhost:5000/api/compile -d "not json" -> 400, no traceback

from flask import Blueprint, request, jsonify, current_app
from config import CONFIG
from extensions import limiter
from services.compiler import compile_rule

# Status code rule: 200 means the compile pipeline ran completely (even if the rule is invalid).
# 400 means the client sent an unparseable or oversized request.

rules_bp = Blueprint("rules_bp", __name__, url_prefix="/api")

@rules_bp.route("/health", methods=["GET"])
@limiter.exempt
def health():
    """
    Health check for Docker and Render.

    Exempt from rate limiting on purpose: Render polls this every few
    seconds from its own infrastructure, and a 429 here would be read as
    the service being unhealthy and trigger a restart loop.
    """
    return jsonify({"status": "ok"}), 200

@rules_bp.route("/compile", methods=["POST"])
# H2 — the only expensive endpoint, so the only one that needs a cap.
# Limit is read from config at request time via a lambda, so tests and
# deployments can change it without editing this decorator.
@limiter.limit(lambda: current_app.config.get("RATE_LIMIT", "30/minute"))
def compile_endpoint():
    """Validates input payload size/type and passes YARA rule strings to the compiler."""
    # Handle non-JSON, empty, or malformed request payloads safely
    payload = request.get_json(silent=True)
    if not payload or not isinstance(payload, dict) or "source" not in payload:
        return jsonify({"error": "Invalid request body. JSON payload with a 'source' key is required."}), 400

    source = payload["source"]

    # Reject non-string values or payloads exceeding our safety threshold before they hit the compiler
    if not isinstance(source, str):
        return jsonify({"error": "'source' must be a string."}), 400

    if len(source.encode("utf-8")) > CONFIG.MAX_SOURCE_BYTES:
        return jsonify({"error": f"Rule source exceeds maximum allowed size of {CONFIG.MAX_SOURCE_BYTES} bytes."}), 400

    # Run compilation and convert results to camelCase dicts for the frontend API
    result = compile_rule(source)

    response_data = {
        "ok": result.ok,
        "errors": [err.to_dict() for err in result.errors],
        "warnings": [warn.to_dict() for warn in result.warnings],
        "ruleNames": result.rule_names
    }

    return jsonify(response_data), 200
    