// ============================================================
// TASK F2 — API client
// ============================================================
// The only file in the frontend that knows a network exists. Components
// import from here; they never call fetch() directly.
//
// EXPORT:
//   export async function compileRule(source, { signal } = {})
//     -> { ok, errors, warnings, ruleNames }
//
// REQUIREMENTS:
//   - Base URL from import.meta.env.VITE_API_BASE, defaulting to ''
//     (same-origin, which is how it runs in Docker). In dev, set up a
//     Vite proxy for /api instead of hardcoding localhost:5000 — that
//     keeps prod and dev on the same code path.
//   - Accept an AbortSignal and pass it to fetch. TASK F6 debounces
//     keystrokes and will cancel in-flight requests; without this you
//     get out-of-order responses and a gutter that flickers between
//     stale and fresh errors.
//   - A 4xx/5xx is NOT ok:false — it's a client/transport failure.
//     Normalise it into the same shape so callers have one code path:
//       { ok: false, errors: [{ message, line: null, severity: 'error' }],
//         warnings: [], ruleNames: [], transportError: true }
//     Set transportError so the UI can say "couldn't reach the server"
//     rather than "your rule is invalid" — very different messages.
//   - Never throw for an aborted request. Return null or rethrow the
//     AbortError and handle it in one place. Pick one, comment which.
//
// DONE WHEN: with the backend running, calling compileRule from the
// browser console returns the parsed object for both a good and a bad
// rule, and stopping the backend gives you transportError: true rather
// than an unhandled promise rejection.

/**
 * API client for interacting with the backend compilation endpoints.
 * This is the single module responsible for managing network lifecycle tasks.
 */

// Base URL defaults to empty string for same-origin routing in Docker/Production.
const BASE_URL = import.meta.env.VITE_API_BASE || '';

/**
 * Sends a YARA rule string to the backend to check for syntax errors and warnings.
 * 
 * DESIGN CHOICE ON ABORT: Returns null if the request is aborted. This allows UI 
 * callers to ignore cancelled typing cycles without catching exceptions everywhere.
 * 
 * @param {string} source - The raw YARA rule text.
 * @param {Object} [options] - Optional parameters.
 * @param {AbortSignal} [options.signal] - Signal used to cancel in-flight requests.
 * @returns {Promise<Object|null>} Resolution payload or null if aborted.
 */
export async function compileRule(source, { signal } = {}) {
  try {
    const response = await fetch(`${BASE_URL}/api/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source }),
      signal,
    });

    // Handle standard network-level errors (4xx/5xx status codes)
    if (!response.ok) {
      return {
        ok: false,
        errors: [{ message: `Server error: ${response.statusText}`, line: null, severity: 'error' }],
        warnings: [],
        ruleNames: [],
        transportError: true,
      };
    }

    // Success path: backend processed the rule completely
    return await response.json();
  } catch (error) {
    // Intercept cancellation events cleanly to protect component state
    if (error.name === 'AbortError') {
      return null;
    }

    // Network connection dropouts or total server downtime fallback
    return {
      ok: false,
      errors: [{ message: 'Could not connect to the compilation server.', line: null, severity: 'error' }],
      warnings: [],
      ruleNames: [],
      transportError: true,
    };
  }
}
