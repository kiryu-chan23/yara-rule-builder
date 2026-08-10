import { useEffect, useRef } from 'react';

const SECTIONS = [
  {
    title: 'Structure',
    rows: [
      ['rule name { … }', 'A rule. condition is the only required block.'],
      ['meta:', 'Descriptive key/value pairs. Never evaluated.'],
      ['strings:', 'Patterns to search for.'],
      ['condition:', 'Boolean expression deciding a match.'],
      ['private rule', 'Matches are not reported, only usable by other rules.'],
    ],
  },
  {
    title: 'Pattern types',
    rows: [
      ['$a = "text"', 'Text pattern.'],
      ['$a = { 4D 5A ?? }', 'Hex. ?? is a wildcard nibble pair.'],
      ['$a = { 4D [4-6] 5A }', 'Jump: 4 to 6 arbitrary bytes.'],
      ['$a = { (61|62) 63 }', 'Alternatives.'],
      ['$a = /ab+c/i', 'Regular expression. i = case-insensitive.'],
    ],
  },
  {
    title: 'Modifiers',
    rows: [
      ['nocase', 'Case-insensitive. Not with xor or base64.'],
      ['wide', 'UTF-16LE, two bytes per character.'],
      ['ascii', 'Single-byte. Default, so usually paired with wide.'],
      ['fullword', 'Not surrounded by alphanumerics.'],
      ['xor', 'Every single-byte XOR key, or xor(0x01-0xff).'],
      ['base64', 'The three base64 encodings of the pattern.'],
    ],
  },
  {
    title: 'Conditions',
    rows: [
      ['$a and $b', 'Both patterns present.'],
      ['any of them', 'At least one pattern in the rule.'],
      ['all of ($a*)', 'Every pattern whose name starts with a.'],
      ['2 of ($a, $b, $c)', 'At least two of this set.'],
      ['$a at 0', 'At an exact offset.'],
      ['$a in (0..1024)', 'Within a byte range.'],
      ['#a > 3', 'Occurrence count.'],
      ['@a[1]', 'Offset of the first occurrence.'],
      ['!a[1]', 'Length of the first occurrence.'],
    ],
  },
  {
    title: 'Built-ins',
    rows: [
      ['filesize', 'File size in bytes. Accepts KB, MB, GB.'],
      ['uint16(0) == 0x5A4D', 'Little-endian read. This one tests for MZ.'],
      ['uint32(uint32(0x3C))', 'Follow the PE header offset.'],
      ['entrypoint', 'Deprecated. Prefer the pe module.'],
    ],
  },
];

/**
 * CheatsheetDrawer — slide-out YARA reference.
 *
 * Rendered in the DOM at all times and translated off-screen rather than
 * unmounted, so opening it doesn't cost a re-render of a long list. It is
 * aria-hidden and inert to focus when closed.
 */
export default function CheatsheetDrawer({ open, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Move focus into the drawer so a keyboard user isn't left behind on
    // the toggle button with the panel open but unreachable.
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-hidden={!open}
      aria-label="YARA reference"
      className={[
        'absolute inset-y-0 right-0 z-20 w-full max-w-sm overflow-y-auto',
        'bg-panel border-l border-line shadow-xl transition-transform duration-200',
        open ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
      // Keep it out of the tab order entirely when closed — off-screen but
      // still focusable is a classic keyboard trap.
      style={{ visibility: open ? 'visible' : 'hidden' }}
    >
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 bg-panel border-b border-line">
        <h2 className="text-xs font-medium uppercase tracking-widest text-fg-muted">
          YARA reference
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-line bg-raised px-2 py-1 text-xs text-fg hover:bg-line focus:outline-none focus:ring-1 focus:ring-accent"
        >
          Close
        </button>
      </div>

      <div className="px-4 py-3 space-y-5">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-accent">
              {section.title}
            </h3>
            <dl className="space-y-1.5">
              {section.rows.map(([code, desc]) => (
                <div key={code}>
                  <dt className="font-mono text-xs text-fg-bright">{code}</dt>
                  <dd className="text-xs text-fg-muted leading-snug">{desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </aside>
  );
}
