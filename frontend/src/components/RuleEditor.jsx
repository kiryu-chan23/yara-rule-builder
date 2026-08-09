// ============================================================
// TASK F3 — CodeMirror 6 editor component
// ============================================================
// PROPS:
//   value          string
//   onChange       (nextValue: string) => void
//   diagnostics    RuleError[]   // from the compile response
//
// BUILD:
//   Mount a CodeMirror 6 EditorView into a ref'd <div>. Packages you'll
//   want: @codemirror/state, @codemirror/view, @codemirror/commands,
//   and @codemirror/lint if you go the lint-source route (see below).
//
// THE THREE THINGS PEOPLE GET WRONG HERE — read before coding:
//
//   1. DO NOT recreate the EditorView on every render. Create it once
//      in useEffect(..., []), destroy it in the cleanup. Re-rendering
//      React must not blow away the editor state (cursor, undo history,
//      scroll position).
//
//   2. CONTROLLED-COMPONENT LOOP. If `value` changes from outside, you
//      dispatch a transaction to sync it — but your own onChange also
//      sets `value`, so you'll loop. Guard it: before dispatching,
//      compare view.state.doc.toString() === value and bail if equal.
//
//   3. DIAGNOSTICS MUST NOT REBUILD THE EDITOR. When `diagnostics`
//      changes, dispatch an effect (or setDiagnostics from
//      @codemirror/lint) into the existing view. New diagnostics are a
//      state update, not a remount.
//
// DECIDE AND COMMENT: @codemirror/lint gives you squiggles, hover
// tooltips and a panel for free, but expects a linter function it calls
// on doc change. Your errors come from an async server round-trip. You
// can either (a) use a lint source that awaits compileRule, or (b) keep
// compiling in App.jsx and push results down as a custom StateField +
// gutter (TASK F4). (b) is more code but keeps one source of truth.
// Write down which you chose and why — a reviewer will ask.
//
// DONE WHEN: typing feels native (no lag, no cursor jumps), the editor
// survives 50 keystrokes without remounting (check with a console.log
// in the creation effect — it must fire exactly once).

import { useEffect, useRef, useImperativeHandle } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { errorLineHighlight, setErrorLines } from '../editor/errorGutter';

// CodeMirror renders into its own stylesheet and ignores Tailwind classes,
// so the palette is repeated here as literals. Keep in sync with @theme
// in index.css.
const PALETTE = {
  blush: '#f9edf0',
  champagne: '#e6c8b7',
  cognac: '#c3955b',
  amber: '#ba6a36',
  emerald: '#1c3934',
  surface: '#1c0e0c',
};

const yaraTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: PALETTE.surface,
      color: PALETTE.blush,
      height: '100%',
    },
    '.cm-content': {
      caretColor: PALETTE.cognac,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: PALETTE.cognac },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection':
      { backgroundColor: 'rgba(195, 149, 91, 0.25)' },
    '.cm-gutters': {
      backgroundColor: PALETTE.surface,
      color: 'rgba(230, 200, 183, 0.45)',
      border: 'none',
      borderRight: '1px solid rgba(195, 149, 91, 0.20)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(28, 57, 52, 0.35)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(28, 57, 52, 0.35)',
      color: PALETTE.champagne,
    },
    // The lint gutter marker keeps @codemirror/lint's default red dot.
    // It's the one place a non-palette colour earns its keep: red is the
    // universal "error here" signal and the marker is 8px across.
  },
  { dark: true }
);

/**
 * CodeMirror 6 Editor Component.
 * Manages raw YARA text input and handles asynchronous diagnostic updates.
 * 
 * DESIGN CHOICE ON DIAGNOSTICS:
 * I chose to keep the compiler engine execution logic up in App.jsx and pass the
 * results down here as a prop, rather than using CodeMirror's internal async lint sources.
 * Why? Keeping compilation logic centralized means we have one clean source of truth. 
 * App.jsx runs the debounce logic, handles network transport states, and feeds other 
 * panels (like rule name listings) from the exact same payload. Passing down the diagnostics array 
 * and using CodeMirror's `setDiagnostics` keeps this component simple and decoupled.
 */
export default function YaraEditor({ value, onChange, diagnostics = [], ref }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);

  // Imperative API for the parent: clicking an error row in CompileStatus
  // needs to move the cursor here. A prop can't express "do it again" for
  // the same line, so this is the case a ref is actually for.
  useImperativeHandle(ref, () => ({
    jumpToLine(lineNumber) {
      const view = viewRef.current;
      if (!view || !lineNumber) return;
      const clamped = Math.min(Math.max(lineNumber, 1), view.state.doc.lines);
      const line = view.state.doc.line(clamped);
      view.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
      });
      view.focus();
    },
  }), []);

  // The mount effect runs once, so it would capture the FIRST onChange
  // forever. Keeping the latest one in a ref lets the listener call the
  // current version without rebuilding the editor.
  const onChangeRef = useRef(onChange);
  // Assigned in an effect, not during render — React 19 forbids mutating a
  // ref while rendering. No dep array, so it runs after every render and the
  // ref always holds the latest onChange by the time a keystroke fires.
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Effect 1: Initialize the editor view instance exactly once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Listen for editor updates and bubble text mutations back up to React
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const startState = EditorState.create({
      doc: value || '',
      extensions: [
        yaraTheme,
        lineNumbers(),
        highlightActiveLine(),
        // lintGutter draws the markers in the gutter. setDiagnostics alone
        // enables the lint extension and gives you inline underlines, but
        // no gutter icon — which is the whole point of the milestone.
        lintGutter(),
        // Ours: the coloured line background. lint does the marker.
        errorLineHighlight(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        updateListener,
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Clean up instance context when unmounting
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Empty deps on purpose: the editor is created once and updated by
    // dispatch. `value` is read here only as the initial document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2: Synchronize external value modifications back into the document state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    // Guard clause prevents infinite loops when React state updates match the editor's text
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value || '' },
      });
    }
  }, [value]);

  // Effect 3: Inject compilation error and warning markers without breaking state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // Format our backend schema to meet the CodeMirror Diagnostic payload contract.
    const cmDiagnostics = diagnostics
      // line === null means the error has no position in the source (empty
      // input, oversize payload, transport failure). Those belong in the
      // status bar only — marking line 1 would point at innocent code.
      .filter((err) => typeof err.line === 'number' && err.line > 0)
      .map((err) => {
        // Both yara-x and CodeMirror's doc.line() are 1-based, so the line
        // number passes through unchanged. Columns are 1-based on both
        // sides too, hence the -1 when converting to a document offset.
        const lineNum = Math.min(err.line, view.state.doc.lines);
        const line = view.state.doc.line(lineNum);
        const columnNum = err.column || 1;

        const from = Math.min(line.from + (columnNum - 1), line.to);
        // A zero-width range renders as a barely visible marker. Underline
        // to the end of the line so the error is actually findable.
        const to = line.to > from ? line.to : from;

        return {
          from,
          to,
          severity: err.severity === 'warning' ? 'warning' : 'error',
          message: err.message,
        };
      });

    // Two consumers, one source: lint draws the gutter marker and tooltip,
    // errorLineHighlight paints the line background.
    view.dispatch(setDiagnostics(view.state, cmDiagnostics));
    view.dispatch({ effects: setErrorLines.of(diagnostics) });
  }, [diagnostics]);

  return (
    <div
      ref={containerRef}
      className="yara-editor-container h-full overflow-auto text-sm"
    />
  );
}
