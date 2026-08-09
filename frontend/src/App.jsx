// ============================================================
// TASK F6 — Wire it together
// ============================================================
// The single owner of application state. RuleEditor and CompileStatus
// stay dumb; all the coordination happens here.
//
// STATE:
//   source      string   — current rule text
//   result      object   — last compile response, or null
//   status      'idle' | 'compiling' | 'done'
//
// THE COMPILE LOOP:
//   - Debounce source changes ~400ms. Compiling on every keystroke is
//     both wasteful and visually noisy (errors flash while you type a
//     word that is briefly invalid).
//   - Keep an AbortController in a ref. On each new compile, abort the
//     previous one before starting. Without this, a slow response from
//     three keystrokes ago lands last and overwrites your fresh result.
//     Test it deliberately: add a time.sleep in the Flask handler,
//     type fast, and confirm the final state matches the final text.
//   - Never setState from a response whose controller was aborted.
//
// LAYOUT: split view — editor left/top, status panel right/bottom.
// Tailwind only, no extra UI library for now.
//
// SEED VALUE: start `source` with a small valid example rule so the
// app isn't an empty box on first load.
//
// DONE WHEN — THE MILESTONE IS COMPLETE:
//   Type a rule with a syntax error on line 4. Within half a second,
//   a red marker appears on line 4 and the status bar names the error.
//   Fix the error. The marker clears and the bar goes green.
//   Type fast for ten seconds. No flicker, no stale errors, no console
//   warnings. Stop the backend mid-typing: amber "can't reach compiler",
//   no crash. Restart it: recovers on the next keystroke.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import YaraEditor from './components/RuleEditor';
import CompileStatus from './components/CompileStatus';
import { compileRule } from './api/client';

// Starter template so the user doesn't face a blank page on load
const DEFAULT_RULE = `rule Suspicious_Strings {
    meta:
        description = "Detects unusual indicators inside binary streams"
    strings:
        $hex_pattern = { E2 34 ?? 56 78 }
        $string_flag = "malicious_payload_marker"
    condition:
        $string_flag or $hex_pattern
}`;

export default function App() {
  const [source, setSource] = useState(DEFAULT_RULE);
  // The result is stored together with the source it was produced from.
  // That one extra field removes the need for a separate `status` state:
  // "compiling" is just "the stored result doesn't match what's on screen".
  // It also means status can never disagree with the result it describes.
  const [result, setResult] = useState(null); // { data, forSource }

  // Track the active network request so we can cancel it on subsequent edits
  const abortControllerRef = useRef(null);
  // Handle on the editor, for jumping to a line from the error panel
  const editorRef = useRef(null);

  useEffect(() => {
    // Nothing to compile. No setState here — every display condition is
    // derived at render time, because calling setState synchronously in an
    // effect body triggers a cascading render.
    if (!source.trim()) return;

    // 1. Cancel previous in-flight requests before initializing a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Set up a fresh controller for the upcoming request lifecycle
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 2. Debounce trigger (~400ms delay) to prevent hammering the backend on every keypress
    const timeoutId = setTimeout(async () => {
      try {
        const data = await compileRule(source, { signal: controller.signal });
        
        // Safety guard: Drop state modifications if the request was superseded or cancelled
        if (controller.signal.aborted || data === null) return;

        setResult({ data, forSource: source });
      } catch {
        // client.js normalises transport failures into a result object, so
        // reaching here means something unexpected. Still record it against
        // this source, or the UI sits on "Compiling…" forever.
        if (controller.signal.aborted) return;
        setResult({
          data: {
            ok: false,
            errors: [{ message: 'Unexpected client error.', line: null, severity: 'error' }],
            warnings: [],
            ruleNames: [],
            transportError: true,
          },
          forSource: source,
        });
      }
    }, 400);

    // Teardown cleans up timers and controllers if another keystroke cuts in early
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [source]);

  // Clicking an error row moves the cursor to that line in the editor.
  const handleErrorLocationClick = (lineNum) => {
    editorRef.current?.jumpToLine(lineNum);
  };

  // Everything the UI shows is derived from source + result. No status state.
  const isEmpty = !source.trim();
  const upToDate = result?.forSource === source;
  const displayStatus = isEmpty ? 'idle' : upToDate ? 'done' : 'compiling';
  // While stale, show no result rather than one belonging to older text —
  // this is what stops errors flashing as you type through a valid word.
  const displayResult = isEmpty || !upToDate ? null : result.data;

  // Gutter markers are the exception: keep the last known ones during typing
  // so they don't strobe on every keystroke. errorLineHighlight maps them
  // through document changes, so they track the text until the next compile.
  const lastData = isEmpty ? null : result?.data;
  const editorDiagnostics = [
    ...(lastData?.errors ?? []),
    ...(lastData?.warnings ?? []),
  ];

  return (
    <main className="flex flex-col md:flex-row h-screen w-screen bg-espresso text-blush overflow-hidden font-sans">
      {/* Left Column: Code Window */}
      <section className="flex flex-col flex-1 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-cognac/25">
        {/* Both headers share min-h so the emerald bands line up across
            the split, despite one having two lines of text and one having
            one. justify-center keeps each block vertically centred. */}
        <header className="flex flex-col justify-center min-h-16 px-4 py-3 bg-emerald border-b border-cognac/25">
          <h1 className="text-lg font-semibold tracking-tight text-blush">
            YARA Rule Builder
          </h1>
          {/* P2: a cold visitor needs to know what this is and that their
              rule text is the only thing that leaves the browser. */}
          <p className="text-xs text-champagne/70 mt-0.5">
            Write a rule, see syntax errors as you type. Nothing is stored.
          </p>
        </header>

        <div className="flex-1 overflow-auto bg-surface">
          <YaraEditor
            ref={editorRef}
            value={source}
            onChange={setSource}
            diagnostics={editorDiagnostics}
          />
        </div>
      </section>

      {/* Right Column: Information Panel */}
      <section className="flex flex-col w-full md:w-96 bg-espresso h-1/2 md:h-full overflow-hidden">
        <header className="flex flex-col justify-center min-h-16 px-4 py-3 bg-emerald border-b border-cognac/25">
          <h2 className="text-sm font-semibold tracking-wide text-champagne uppercase">
            Compiler Output
          </h2>
        </header>

        <div className="flex-1 overflow-auto">
          <CompileStatus
            state={displayStatus}
            result={displayResult}
            onErrorClick={handleErrorLocationClick}
          />
        </div>
      </section>
    </main>
  );
}
