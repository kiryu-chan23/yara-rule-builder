// ============================================================
// TASK F4 — Error line highlighting
// ============================================================
// SCOPE DECISION (made during review):
//   @codemirror/lint owns the gutter marker and its hover tooltip.
//   RuleEditor.jsx calls lint's setDiagnostics() and includes
//   lintGutter(); that machinery is well tested, keyboard accessible,
//   and gives a diagnostics panel for free.
//
//   This file owns the one thing lint does NOT do: a coloured background
//   on the offending line, so the error is visible when the gutter is
//   scrolled out of view or the editor is glanced at rather than read.
//
//   Earlier drafts of this file duplicated lint — its own setDiagnostics
//   effect and its own gutter(). That was two implementations of one
//   feature. Removed.
//
// USAGE (in RuleEditor.jsx):
//   import { errorLineHighlight, setErrorLines } from '../editor/errorGutter';
//   ...extensions: [ lintGutter(), errorLineHighlight(), ... ]
//   ...view.dispatch({ effects: setErrorLines.of(diagnostics) })

import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';

// Carries the diagnostics array into a transaction.
export const setErrorLines = StateEffect.define();

const errorLineDecoration = Decoration.line({
  attributes: { class: 'cm-yara-error-line' },
});
const warningLineDecoration = Decoration.line({
  attributes: { class: 'cm-yara-warning-line' },
});

/**
 * Builds line decorations from a diagnostics array.
 *
 * OFF-BY-ONE: yara-x reports 1-based line numbers and CodeMirror's
 * doc.line(n) is also 1-based, so the number passes through unchanged.
 * This is the only place the two conventions meet.
 */
function buildDecorations(doc, diagnostics) {
  const builder = new RangeSetBuilder();

  const usable = (diagnostics || [])
    // line === null means the diagnostic has no source position (empty
    // input, oversize payload, transport failure). Nothing to highlight.
    .filter((d) => typeof d.line === 'number' && d.line > 0)
    // Clamp: the user can delete lines faster than a response arrives.
    .map((d) => ({ ...d, line: Math.min(d.line, doc.lines) }))
    // RangeSetBuilder requires strictly ascending positions.
    .sort((a, b) => a.line - b.line);

  let lastLine = -1;
  for (const d of usable) {
    if (d.line === lastLine) continue; // one decoration per line
    lastLine = d.line;

    const line = doc.line(d.line);
    const deco =
      d.severity === 'warning' ? warningLineDecoration : errorLineDecoration;
    // Line decorations are zero-length and anchored at the line start.
    builder.add(line.from, line.from, deco);
  }

  return builder.finish();
}

const errorLineField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    // Map existing decorations through edits so highlights track the text
    // while the user types, before the next compile lands.
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setErrorLines)) {
        next = buildDecorations(tr.state.doc, effect.value);
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Palette: amber #ba6a36 for errors, cognac #c3955b for warnings.
// Kept as literals rather than CSS vars because CodeMirror injects these
// into its own stylesheet, outside Tailwind's @theme scope.
const highlightTheme = EditorView.theme({
  '.cm-yara-error-line': { backgroundColor: 'rgba(186, 106, 54, 0.16)' },
  '.cm-yara-warning-line': { backgroundColor: 'rgba(195, 149, 91, 0.10)' },
});

export function errorLineHighlight() {
  return [errorLineField, highlightTheme];
}
