// ============================================================
// TASK F7 — YARA syntax highlighting  (do this LAST)
// ============================================================
// Optional polish. Do not touch this file until the whole F6 milestone
// is green — it is the single easiest place to lose a day.
//
// TWO ROUTES, pick deliberately:
//
//   (a) StreamLanguage + a simple tokeniser
//       @codemirror/language exports StreamLanguage.define(). You write
//       a token(stream, state) function that recognises: keywords
//       (rule, meta, strings, condition, and, or, not, all, any, of,
//       them, at, in, filesize, entrypoint), string identifiers ($a,
//       #a, @a, !a), hex strings { 4D 5A ?? }, regexes /.../ with
//       modifiers, string modifiers (nocase, wide, ascii, xor, base64,
//       fullword, private), comments (// and /* */), and numbers with
//       KB/MB suffixes.
//       ~150 lines, no build tooling, good enough. START HERE.
//
//   (b) A real Lezer grammar (@lezer/generator, a .grammar file, a
//       build step). Gives you a proper syntax tree — needed if you
//       later want folding, structural autocomplete, or rule outlining.
//       Much more work. Only worth it if the roadmap actually needs it.
//
// Whichever you pick, write one comment at the top saying which and
// why. Then export:
//   export const yara = () => LanguageSupport | Extension
//
// KNOWN TRAP: hex strings and regexes both use characters that look
// like operators. Tokenise the hex-string block { ... } as a unit
// rather than trying to handle ?? and [4-6] with generic rules.
//
// DONE WHEN: a realistic multi-rule file colours correctly, and — the
// real test — an UNTERMINATED string or comment does not cause the
// rest of the document to render as one colour.
