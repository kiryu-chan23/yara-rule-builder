# ============================================================
# TASK B3 — Turn a yara-x diagnostic into a RuleError
# ============================================================
# REWRITTEN after B1 recon. yara-x 1.19.0's Compiler.errors() returns
# STRUCTURED dicts, not just formatted text. No regex needed. Real
# shape, confirmed in a REPL:
#
#   {
#     "type": "SyntaxError", "code": "E001", "title": "syntax error",
#     "line": 2, "column": 3,
#     "labels": [ { "level": "error", "line": 2, "column": 3,
#                   "span": {"start": 11, "end": 20},
#                   "text": "expecting `meta`, `strings` or
#                            `condition`, found `Condition`" } ],
#     "footers": [],
#     "text": "error[E001]: syntax error\n --> line:2:3\n  | ..."
#   }
#
# WRITE:
#   @dataclass
#   class RuleError:
#       message: str        # labels[0]["text"] — the useful one
#       title: str          # "syntax error" — the category
#       code: str           # "E001"
#       line: int | None    # 1-based
#       column: int | None  # 1-based
#       span: tuple | None  # (start, end) byte offsets — see WARNING
#       severity: str       # "error" | "warning"
#       raw: str            # the "text" field, for the details panel
#
#       def to_dict(self) -> dict     # camelCase keys for the API
#
#   def from_diagnostic(d: dict, severity: str) -> RuleError
#   def from_diagnostics(ds: list, severity: str) -> list[RuleError]
#
# MESSAGE PRECEDENCE: prefer labels[0]["text"] — "expecting `meta`,
# `strings` or `condition`, found `Condition`" actually diagnoses the
# problem. "syntax error" (title) does not. Fall back to title when
# labels is empty. Keep both; the UI shows message, the panel shows raw.
#
# LINE PRECEDENCE: the top-level "line"/"column" and labels[0]'s
# line/column agreed in every sample. Prefer labels[0], fall back to
# top-level, fall back to None. Never assume either key exists — this
# is an unversioned dict from a Rust binding, and dicts change between
# releases. .get() everything.
#
# WARNING — SPAN OFFSETS ARE BYTES, NOT CHARACTERS:
#   span.start/end come from Rust, which counts UTF-8 bytes.
#   CodeMirror counts UTF-16 code units. For a pure-ASCII rule they're
#   identical, which is exactly why this bug survives testing and then
#   fires the first time someone pastes a rule containing a non-ASCII
#   string literal — and YARA rules for malware families very often do.
#   Either (a) convert: take source.encode()[:start].decode() and use
#   its len(), or (b) don't ship span to the frontend at all and let
#   F4 use line/column only. (b) is fine for Milestone 1. Whichever you
#   pick, leave a comment here saying so.
#
# MULTIPLE ERRORS ARE REAL: add_source on a source with two broken
# rules returned two diagnostics (lines 2 and 5). from_diagnostics
# must handle a list of any length, including empty.
#
# NEVER RAISES: a malformed or unexpected diagnostic dict must still
# produce a RuleError — worst case line=None, message=str(d). This
# function sits between untrusted input and the API response; it is
# not allowed to be the thing that 500s.
#
# DONE WHEN:
#   - The two-error source from B1 yields two RuleErrors with lines
#     2 and 5, correct messages, severity "error".
#   - from_diagnostics([]) == []
#   - from_diagnostic({}, "error") returns a RuleError, does not raise.
#   - to_dict() output is JSON-serialisable (json.dumps it in a test —
#     a stray tuple or dataclass will bite you at the API boundary).
from dataclasses import dataclass, asdict, field


@dataclass
class RuleError:
    message: str
    title: str
    code: str
    line: int | None
    column: int | None
    span: list | None
    severity: str
    raw: str
    # yara-x "footers": explanatory notes attached to a diagnostic, e.g.
    # "non-zero integers are considered `true`, while zero is `false`".
    # The label says what is wrong; the footer says why.
    notes: list = field(default_factory=list)

    def to_dict(self) -> dict:
        """
        converts the dataclass instance to a dict with camelCase keys.
        Ensures fields like span are JSON-serialisable.
        """

        # Helper to convert snake_case to camelCase
        def to_camel_case(snake_str: str) -> str:
            components = snake_str.split('_')
            return components[0] + ''.join(x.title() for x in components[1:])
        return {to_camel_case(k): v for k, v in asdict(self).items()}

def from_diagnostic(d: dict, severity: str) -> RuleError:
    """
    Parses a single structured yara-x diagnostic dictionary into a RuleError.
    Guaranteed never to raise an exception.
    """
    original = d
    if not isinstance(d, dict):
        # Defend against non-dict payloads passed unexpectedly
        d = {}

    labels = d.get("labels", [])
    first_label = labels[0] if (isinstance(labels, list) and len(labels) > 0) else {}
    if not isinstance(first_label, dict):
        first_label = {}

    # 1. MESSAGE PRECEDENCE
    # Prefer Labels[0]["text"], fall back to top-level title, fall back to stringified dict
    message = first_label.get("text")
    if not message:
        message = d.get("title")
    if not message:
        message = f"Unknown compiler error: {original!r}"

    # Top-level fallback items
    title = d.get("title", "unknown error")
    code = d.get("code", "UNKNOWN")
    raw = d.get("text", "")

    # 2. LINE/COLUMN PRECEDENCE
    # Prefer labels[0], fall back to top-level, fall back to None
    line = first_label.get("line")
    if line is None:
        line = d.get("line")

    column = first_label.get("column")
    if column is None:
        column = d.get("column")

    # Enforce safe typing for line/column integer values
    try:
        line = int(line) if line is not None else None
    except (ValueError, TypeError):
        line = None

    try:
        column = int(column) if column is not None else None
    except (ValueError, TypeError):
        column = None

    # 3. WARNING — SPAN OFFSETS ARE BYTES, NOT CHARACTERS:
    # Option chosen: (b) Do not ship raw Rust UTF-8 byte spans to the frontend to
    # avoid CodeMirror UTF-16 positioning bugs in Milestone 1. F4 navigates via
    # line/column fields instead. We keep it as None here.
    span = None

    # 4. FOOTERS -> notes. Defensive: footers may be absent, not a list,
    # or contain non-dict entries.
    footers = d.get("footers", [])
    notes = []
    if isinstance(footers, list):
        for f in footers:
            if isinstance(f, dict) and f.get("text"):
                notes.append(str(f["text"]))

    return RuleError(
        message=message,
        title=title,
        code=code,
        line=line,
        column=column,
        span=span,
        severity=severity,
        raw=raw,
        notes=notes
    )

def from_diagnostics(ds: list, severity: str) -> list[RuleError]:
    """
    Parses a list of structured yara-x diagnostics. Handles empty lists
    and guarantees no crashes.
    """
    if not isinstance(ds, list):
        return []
    return [from_diagnostic(d, severity) for d in ds]