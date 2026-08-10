import { useState } from 'react';
import { TEMPLATES } from '../editor/templates';

/**
 * Toolbar — template selector and quick actions.
 *
 * PROPS:
 *   source          string   current rule text
 *   onLoadTemplate  (src) => void
 *   onToggleCheatsheet () => void
 *   cheatsheetOpen  boolean
 */
export default function Toolbar({
  source,
  onLoadTemplate,
  onToggleCheatsheet,
  cheatsheetOpen,
}) {
  // 'idle' | 'copied' | 'failed' — transient feedback on the copy button.
  const [copyState, setCopyState] = useState('idle');

  const handleCopy = async () => {
    try {
      // navigator.clipboard requires a secure context: HTTPS or localhost.
      // Render serves HTTPS and dev runs on localhost, so both are fine —
      // but it still rejects if the user denies permission, hence the catch.
      await navigator.clipboard.writeText(source);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 1800);
  };

  const handleDownload = () => {
    // Derive the filename from the first rule name in the source so the
    // file is identifiable on disk. Falls back to a generic name.
    const match = source.match(/^\s*(?:private\s+|global\s+)*rule\s+([a-zA-Z_][a-zA-Z0-9_]*)/m);
    const name = match ? match[1] : 'rule';

    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.yar`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Without this the blob stays in memory for the life of the document.
    URL.revokeObjectURL(url);
  };

  const handleTemplate = (e) => {
    const tpl = TEMPLATES.find((t) => t.id === e.target.value);
    if (!tpl) return;
    // Replacing the buffer discards whatever the user wrote. Confirm
    // unless the editor is effectively empty.
    if (source.trim().length > 0) {
      const ok = window.confirm(
        'Load this template? Your current rule will be replaced.'
      );
      if (!ok) {
        e.target.value = '';
        return;
      }
    }
    onLoadTemplate(tpl.source);
    // Reset so picking the same template twice still fires onChange.
    e.target.value = '';
  };

  const btn =
    'inline-flex items-center gap-1.5 rounded border border-line bg-raised px-2.5 py-1.5 ' +
    'text-xs text-fg hover:bg-line focus:outline-none focus:ring-1 focus:ring-accent';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-panel border-b border-line">
      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <span className="sr-only">Load a template</span>
        <select
          onChange={handleTemplate}
          defaultValue=""
          className="rounded border border-line bg-raised px-2 py-1.5 text-xs text-fg focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="" disabled>
            Load a template…
          </option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <button type="button" onClick={handleCopy} className={btn}>
          {copyState === 'copied'
            ? 'Copied'
            : copyState === 'failed'
              ? 'Copy failed'
              : 'Copy'}
        </button>

        <button type="button" onClick={handleDownload} className={btn}>
          Download .yar
        </button>

        <button
          type="button"
          onClick={onToggleCheatsheet}
          aria-expanded={cheatsheetOpen}
          className={btn + (cheatsheetOpen ? ' text-accent' : '')}
        >
          Cheatsheet
        </button>
      </div>
    </div>
  );
}
