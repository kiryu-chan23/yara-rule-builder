// ============================================================
// TASK F5 — Compile status bar
// ============================================================
// The text half of the feedback loop. The gutter says WHERE; this says
// WHAT.
//
// PROPS: { state, result }
//   state: 'idle' | 'compiling' | 'done'
//   result: the object from compileRule(), or null
//
// RENDER:
//   idle           -> muted "Start typing a rule"
//   compiling      -> spinner / "Compiling…"
//   ok             -> green "Compiled — 2 rules: apt_dropper, suspicious_pe"
//   errors         -> red, one row per error: "Line 4 · unexpected token }"
//                     clicking a row scrolls the editor to that line
//                     (accept an onErrorClick(line) prop)
//   transportError -> amber "Can't reach the compiler" — do NOT dress a
//                     network failure up as a rule error
//   warnings       -> amber rows, shown even when ok is true
//
// SECURITY, AND IT IS NOT THEORETICAL:
//   error.message and error.raw are derived from text the user typed.
//   Render them as text. NEVER dangerouslySetInnerHTML, never build the
//   row with innerHTML. React escapes by default — do not opt out.
//   You are writing a security tool; a stored-XSS in the error panel of
//   a YARA IDE is the kind of thing a reviewer notices immediately.
//
// ACCESSIBILITY: wrap the status region in aria-live="polite" so the
// result is announced. Cheap to add now, tedious to retrofit.
//
// DONE WHEN: all five states render correctly (force each one by hand),
// and clicking an error row moves the cursor to that line.
/**
 * CompileStatus component.
 * Displays textual compilation feedback, server transport alerts, and warnings.
 */
export default function CompileStatus({ state, result, onErrorClick }) {

  // Render an interactive row for errors or warnings that clicks through to the editor line
  const renderRow = (item, type, index) => {
    const isError = type === 'error';
    const jumpable = Boolean(item.line) && Boolean(onErrorClick);
    const jump = () => jumpable && onErrorClick(item.line);

    return (
      <div
        // Index in the key because two diagnostics can share a line and
        // message (repeated patterns), and duplicate keys drop rows.
        key={`${type}-${index}-${item.line}`}
        className={[
          'flex gap-2 px-3 py-1.5 text-sm border-l-2',
          // The palette has no red, so severity is carried by hue weight
          // (amber vs cognac) AND by the explicit label below — colour
          // alone would not be enough to tell them apart.
          isError
            ? 'border-amber bg-amber/10 text-amber-lit'
            : 'border-cognac bg-cognac/5 text-cognac-lit',
          jumpable ? 'cursor-pointer hover:bg-blush/5' : '',
        ].join(' ')}
        onClick={jump}
        // role="button" without a key handler is a keyboard trap: focusable,
        // announced as a button, does nothing on Enter.
        onKeyDown={(e) => {
          if (jumpable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            jump();
          }
        }}
        role={jumpable ? 'button' : undefined}
        tabIndex={jumpable ? 0 : undefined}
      >
        <span className="shrink-0 font-mono text-xs uppercase tracking-wide opacity-70 pt-0.5">
          {/* Severity in words, not just colour — this is the accessible
              fallback and it survives colour-blindness and greyscale. */}
          {isError ? 'Error' : 'Warn'}
          {item.line ? ` ${item.line}` : ''}
        </span>
        <div className="min-w-0">
          {/* React escapes these strings. They are derived from user input,
              so they must never go through dangerouslySetInnerHTML. */}
          <span className="break-words">{item.message}</span>
          {item.notes?.length > 0 && (
            <ul className="mt-0.5 text-xs opacity-70">
              {item.notes.map((note, i) => (
                <li key={i}>note: {note}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  // Compute layout structure based on state and results mapping
  let content = null;

  if (state === 'idle') {
    content = (
      <p className="px-3 py-2 text-sm text-champagne/50">
        Start typing a rule to check syntax.
      </p>
    );
  } else if (state === 'compiling') {
    content = (
      <p className="px-3 py-2 text-sm text-champagne/70">Compiling…</p>
    );
  } else if (result?.transportError) {
    // Deliberately distinct from a compile failure: the rule may be fine.
    content = (
      <p className="px-3 py-2 text-sm text-cognac-lit">
        Can&apos;t reach the compiler. Is the backend running?
      </p>
    );
  } else if (result) {
    const hasErrors = !result.ok && result.errors?.length > 0;
    const hasWarnings = result.warnings?.length > 0;
    const names = result.ruleNames ?? [];

    content = (
      <div className="divide-y divide-cognac/15">
        {result.ok && (
          <p className="px-3 py-2 text-sm text-mint">
            Compiled — {names.length} {names.length === 1 ? 'rule' : 'rules'}
            {names.length > 0 ? `: ${names.join(', ')}` : ''}
          </p>
        )}

        {hasErrors && (
          <div>
            {result.errors.map((err, i) => renderRow(err, 'error', i))}
          </div>
        )}

        {/* Warnings show even when ok is true — that's the point of them. */}
        {hasWarnings && (
          <div>
            {result.warnings.map((warn, i) => renderRow(warn, 'warning', i))}
          </div>
        )}
      </div>
    );
  }

  return (
    // aria-live announces compile results to screen readers as they change.
    <div
      className="h-full overflow-auto bg-espresso"
      aria-live="polite"
    >
      {content}
    </div>
  );
}
