# ============================================================
# TASK B6 — Tests for the compile path
# ============================================================
# pytest. Two groups: pure compiler tests, and endpoint tests using
# Flask's test client (app.test_client()) — no live server needed.
#
# COMPILER TESTS (services/compiler.py):
#   - valid single rule            -> ok, rule_names == ["a"]
#   - valid multi-rule source      -> ok, both names present
#   - missing closing brace        -> not ok, errors[0].line == <hand-counted>
#   - error on line 4 of a 6-line  -> errors[0].line == 4   (THE key test:
#     source                          this is what proves the gutter works)
#   - unknown identifier           -> not ok, sensible message
#   - empty string                 -> not ok, no exception
#   - whitespace-only string       -> not ok, no exception
#   - source over MAX_SOURCE_BYTES -> not ok, no exception, no parse attempt
#
# ENDPOINT TESTS (api/rules.py):
#   - POST valid source            -> 200, ok true
#   - POST invalid source          -> 200, ok false, errors[0].line present
#   - POST body missing "source"   -> 400
#   - POST non-JSON body           -> 400, no traceback in the response
#   - GET /api/health              -> 200
#
# WRITE THE LINE-NUMBER TESTS AS A PARAMETRISED CASE with the source
# inline in the test file, so the expected line number is visible right
# next to the source it refers to. Do not load fixtures from disk for
# these — the whole point is that a reader can count the lines.
#
# DONE WHEN: `pytest` from backend/ is green, and you have deliberately
# broken one line number to confirm the test actually fails.

import pytest
from dataclasses import replace
import config as config_module
from config import Config
from services.compiler import compile_rule

# Small limit so the oversize tests don't allocate 64 KB of junk.
MOCK_MAX_BYTES = 100


@pytest.fixture
def patch_max_bytes(monkeypatch):
    """
    Shrink MAX_SOURCE_BYTES for limit testing.

    Config is a frozen dataclass, so we can't mutate it — dataclasses.replace
    builds a modified copy. Both modules import CONFIG by value at import
    time, so each module's own reference has to be rebound.

    NOT autouse: a 100-byte cap would reject the multi-line fixtures used by
    the line-number tests. Only the size tests request it.
    """
    small = replace(config_module.CONFIG, MAX_SOURCE_BYTES=MOCK_MAX_BYTES)
    monkeypatch.setattr("services.compiler.CONFIG", small)
    monkeypatch.setattr("api.rules.CONFIG", small)


# ============================================================
# 1. PURE COMPILER TESTS
# ============================================================

def test_compiler_valid_single_rule():
    src = "rule a { condition: true }"
    res = compile_rule(src)
    assert res.ok is True
    assert res.rule_names == ["a"]


def test_compiler_valid_multi_rule():
    src = "rule a { condition: true }\nrule b { condition: true }"
    res = compile_rule(src)
    assert res.ok is True
    assert sorted(res.rule_names) == ["a", "b"]


def test_compiler_unknown_identifier():
    src = "rule a { condition: missing_variable }"
    res = compile_rule(src)
    assert res.ok is False
    assert len(res.errors) > 0
    # yara-x reports E009 "this identifier has not been declared" — the
    # offending name is carried by the span, not repeated in the message.
    assert res.errors[0].code == "E009"
    assert res.errors[0].line == 1


@pytest.mark.parametrize("bad_input", ["", "   ", "\n\n  \t "])
def test_compiler_empty_and_whitespace(bad_input):
    res = compile_rule(bad_input)
    assert res.ok is False
    assert res.rule_names == []


def test_compiler_oversized_payload(patch_max_bytes):
    src = "rule a { condition: true }" + (" " * MOCK_MAX_BYTES)
    res = compile_rule(src)
    assert res.ok is False
    # Rejected before parsing, but with a message the UI can display —
    # ok=False with an empty errors list would leave the user with nothing.
    assert len(res.errors) == 1
    assert "byte limit" in res.errors[0].message
    assert res.errors[0].line is None


# Inline source definitions for tracking accurate engine line offsets
ERROR_LINE_CASES = [
    # Case 1: Missing closing brace on a single line rule
    (
        "rule broken_brace { condition: true",
        1
    ),
    # Case 2: Intentional typo placed precisely on line 4 of a 6-line file
    (
        "rule fine_1 { condition: true }\n"  # Line 1
        "rule fine_2 { condition: true }\n"  # Line 2
        "rule target_error {\n"  # Line 3
        "  Condition:\n"  # Line 4 (Capital 'C' breaks syntax)
        "    true\n"  # Line 5
        "}",  # Line 6
        4
    )
]


@pytest.mark.parametrize("source, expected_line", ERROR_LINE_CASES)
def test_compiler_exact_error_line_numbers(source, expected_line):
    res = compile_rule(source)
    assert res.ok is False
    assert len(res.errors) > 0
    # Verified: Changing expected_line manually breaks the test suite
    assert res.errors[0].line == expected_line


# ============================================================
# 2. FLASK ENDPOINT TESTS
# ============================================================

@pytest.fixture
def client():
    """Initialises a clean local Flask test client application instance."""
    from app import create_app
    test_config = Config(
        MAX_SOURCE_BYTES=MOCK_MAX_BYTES,
        COMPILE_TIMEOUT_S=1,
        STATIC_DIR="../frontend/dist",
        DEBUG=True,
        CORS_ORIGINS=""
    )
    app = create_app(test_config=test_config)
    with app.test_client() as client:
        yield client


def test_endpoint_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.get_json() == {"status": "ok"}


def test_endpoint_compile_success(client):
    payload = {"source": "rule valid_api_test { condition: true }"}
    resp = client.post("/api/compile", json=payload)
    assert resp.status_code == 200

    data = resp.get_json()
    assert data["ok"] is True
    assert data["ruleNames"] == ["valid_api_test"]


def test_endpoint_compile_syntax_error(client):
    payload = {"source": "rule syntax_fail {\n condition:\n   bad_syntax }"}
    resp = client.post("/api/compile", json=payload)
    assert resp.status_code == 200  # Pipeline ran completely, so status remains 200

    data = resp.get_json()
    assert data["ok"] is False
    assert len(data["errors"]) > 0
    assert data["errors"][0]["line"] == 3


def test_endpoint_missing_source_key(client):
    payload = {"wrong_key": "rule a { condition: true }"}
    resp = client.post("/api/compile", json=payload)
    assert resp.status_code == 400
    assert "error" in resp.get_json()


def test_endpoint_raw_non_json_payload(client):
    resp = client.post("/api/compile", data="raw rule text without json formatting")
    assert resp.status_code == 400

    data = resp.get_json()
    assert data is not None
    assert "error" in data  # Handled gracefully via silent=True, avoiding HTML tracebacks
