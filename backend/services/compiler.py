# ============================================================
# TASK B2 — Compile YARA source, return a structured result
# ============================================================
# REWRITTEN after B1 recon. Use yara_x.Compiler(), NOT yara_x.compile().
# Confirmed in a REPL on yara-x 1.19.0:
#   - yara_x.compile() is fail-fast: it reports only the FIRST error.
#   - Compiler.add_source() raises CompileError, but .errors() then
#     returns ALL diagnostics as structured dicts. Two broken rules
#     gave two entries (lines 2 and 5).
# Showing every error at once is the entire reason to build this tool
# instead of using the CLI. Use the Compiler.
#
# This is the only file that imports yara_x. Keep it that way.
#
# WRITE:
#   @dataclass
#   class CompileResult:
#       ok: bool
#       errors: list[RuleError]      # empty when ok
#       warnings: list[RuleError]    # populated even when ok is True
#       rule_names: list[str]        # [] on failure
#
#   def compile_rule(source: str) -> CompileResult
#
# THE SHAPE OF THE FUNCTION:
#   1. Guard first, before yara_x sees anything: source is a str, not
#      empty/whitespace-only, not over MAX_SOURCE_BYTES (config.py).
#      Return a clean CompileResult, don't raise.
#   2. FRESH Compiler() PER CALL. errors() accumulates across
#      add_source() calls on the same instance — reusing one across
#      requests would leak one user's diagnostics into another's
#      response. Construct it inside the function, never module-level.
#   3. try: compiler.add_source(source) / except yara_x.CompileError:
#      pass. Do NOT let the exception escape, and do NOT read the
#      exception's string — the diagnostics you want are on the
#      compiler, not the exception.
#   4. Read compiler.errors() and compiler.warnings() in BOTH the
#      success and failure paths. A rule can compile fine and still
#      warn, and those warnings are the interesting part of a YARA
#      linter. Both are callables, not properties.
#   5. ok = (errors list is empty). Derive it from the diagnostics,
#      not from whether an exception fired — trust one source of truth.
#   6. On success call compiler.build() to get the Rules object and
#      pull the rule names off it. Check what build() actually returns
#      and how to iterate rule identifiers before you write this —
#      same five-minute REPL habit that just saved you a regex.
#   7. Convert everything through services.errors. No raw yara-x dicts
#      leave this module.
#
# NO FLASK IMPORTS. Takes a string, returns a dataclass.
#
# DONE WHEN (REPL, no Flask involved):
#   r = compile_rule('rule a { condition: true }')
#   r.ok is True and r.rule_names == ['a']
#
#   src = "rule a {\n  Condition:\n    nope\n}\nrule b {"
#   r = compile_rule(src)
#   r.ok is False
#   [e.line for e in r.errors] == [2, 5]      # BOTH errors, not one
#
#   compile_rule('') -> ok False, no exception
#   compile_rule('   \n  ') -> ok False, no exception
#   compile_rule('x' * (MAX_SOURCE_BYTES + 1)) -> ok False, no parse
#   compile_rule(None) -> ok False, no exception (someone will do it)
#
#   Then: call compile_rule twice in a row with two different broken
#   sources and confirm the second result contains ONLY the second
#   source's errors. That test is what proves step 2.

from dataclasses import dataclass, field
import yara_x

from config import CONFIG
from services.errors import RuleError, from_diagnostics


@dataclass
class CompileResult:
    ok: bool
    errors: list  # RuleError objects, empty when ok
    warnings: list  # RuleError objects, populated even when ok is True
    rule_names: list[str] = field(default_factory=list)  # Empty on failure


def _reject(reason: str) -> CompileResult:
    """
    A rejection the user can actually see. Guards must never return
    ok=False with an empty errors list — the UI would show a failure
    with nothing to explain it. line stays None: these errors are about
    the request, not about a position in the source.
    """
    return CompileResult(
        ok=False,
        errors=[RuleError(message=reason, title="invalid input", code="INPUT",
                          line=None, column=None, span=None,
                          severity="error", raw=reason)],
        warnings=[],
        rule_names=[])


def compile_rule(source: str) -> CompileResult:
    """
    Compiles a raw YARA source code string using a freshly isolated yara_x.Compiler instance.
    Guaranteed not to raise an exception or leak diagnostics cross-request.
    """
    # 1. Guards. Cheapest checks first, and the size cap before any parsing —
    # this endpoint takes untrusted input.
    if not isinstance(source, str):
        return _reject("Rule text must be a string.")

    if not source.strip():
        return _reject("Rule text is empty.")

    if len(source.encode('utf-8')) > CONFIG.MAX_SOURCE_BYTES:
        return _reject(
            f"Rule text exceeds the {CONFIG.MAX_SOURCE_BYTES} byte limit.")

    # Fresh compiler per call: errors() accumulates, so reusing one would leak diagnostics between requests.
    compiler = yara_x.Compiler()

    # add_source raises on bad input; the diagnostics live on the compiler, not the exception.
    try:
        compiler.add_source(source)
    except yara_x.CompileError:
        # Expected on invalid input. The diagnostics we want are on the
        # compiler, not on the exception, so there is nothing to read here.
        pass

    # 2. Both are callables, and both matter: a rule can compile and still warn.
    raw_errors = compiler.errors()
    raw_warnings = compiler.warnings()

    translated_errors = from_diagnostics(raw_errors, severity="error")
    translated_warnings = from_diagnostics(raw_warnings, severity="warning")

    # 3. Derive ok from the diagnostics, not from whether an exception fired.
    # One source of truth.
    is_ok = len(raw_errors) == 0
    if not is_ok:
        return CompileResult(ok=False, errors=translated_errors,
                             warnings=translated_warnings, rule_names=[])

    # 4. Clean compile: build the Rules object and read the rule identifiers.
    try:
        rules_object = compiler.build()
        rule_names = [rule.identifier for rule in rules_object]
    except Exception as exc:
        # build() can fail even with no diagnostics. Report it rather than
        # returning ok=False with nothing to show.
        return _reject(f"Rules could not be built: {exc}")

    return CompileResult(
        ok=True,
        errors=translated_errors,
        warnings=translated_warnings,
        rule_names=rule_names
    )
