// ============================================================
// Autocomplete for YARA
// ============================================================
// A static completion source. It does NOT understand context — it will
// offer `nocase` in a condition block where it is meaningless. Making it
// context-aware needs a syntax tree, which the StreamLanguage tokeniser
// in yaraLanguage.js does not produce (see the route note in that file).
//
// Static is the honest 80%: it saves typing and spelling, which is what
// people actually want from completion in a small language. The `info`
// text carries the meaning the ordering can't.

import { snippetCompletion } from '@codemirror/autocomplete';

const SECTIONS = [
  snippetCompletion(
    'rule ${name}\n{\n    meta:\n        author = "${author}"\n    strings:\n        $${a} = "${text}"\n    condition:\n        ${$a}\n}',
    { label: 'rule', detail: 'skeleton', type: 'class',
      info: 'A complete rule with meta, strings and condition blocks.' }
  ),
  snippetCompletion('meta:\n        ${key} = "${value}"', {
    label: 'meta', detail: 'block', type: 'keyword',
    info: 'Metadata. Descriptive only — never evaluated during scanning.',
  }),
  snippetCompletion('strings:\n        $${name} = "${value}"', {
    label: 'strings', detail: 'block', type: 'keyword',
    info: 'Patterns to search for: text, hex or regex.',
  }),
  snippetCompletion('condition:\n        ${expression}', {
    label: 'condition', detail: 'block', type: 'keyword',
    info: 'The boolean expression that decides whether the rule matches. Required.',
  }),
];

const word = (label, type, detail, info) => ({ label, type, detail, info });

const MODIFIERS = [
  word('nocase', 'keyword', 'modifier', 'Case-insensitive match. Cannot be combined with xor or base64.'),
  word('wide', 'keyword', 'modifier', 'Match UTF-16LE, two bytes per character. Common in Windows binaries.'),
  word('ascii', 'keyword', 'modifier', 'Match single-byte characters. The default, so usually written only alongside wide.'),
  word('fullword', 'keyword', 'modifier', 'Match only when not surrounded by alphanumeric characters.'),
  word('xor', 'keyword', 'modifier', 'Match the pattern XOR-ed with every single-byte key, or a given range.'),
  word('base64', 'keyword', 'modifier', 'Match the three base64 encodings of the pattern.'),
  word('base64wide', 'keyword', 'modifier', 'base64, then interleaved with null bytes.'),
  word('private', 'keyword', 'modifier', 'Pattern or rule is not reported in match output.'),
];

const CONDITION = [
  word('filesize', 'variable', 'built-in', 'Size of the scanned file in bytes. Undefined when scanning a running process.'),
  word('entrypoint', 'variable', 'built-in', 'Entry point offset of a PE or ELF. Deprecated — prefer the pe module.'),
  word('them', 'keyword', 'built-in', 'Refers to every pattern in the rule. Used as `all of them`.'),
  word('all', 'keyword', 'quantifier', 'Every pattern in the set must match.'),
  word('any', 'keyword', 'quantifier', 'At least one pattern in the set must match.'),
  word('none', 'keyword', 'quantifier', 'No pattern in the set may match.'),
  word('of', 'keyword', 'operator', 'Combines a quantifier with a pattern set: `2 of ($a, $b, $c)`.'),
  word('at', 'keyword', 'operator', 'Pattern must occur at an exact offset: `$mz at 0`.'),
  word('in', 'keyword', 'operator', 'Pattern must occur within a range: `$a in (0..1024)`.'),
  word('and', 'keyword', 'operator', 'Boolean AND.'),
  word('or', 'keyword', 'operator', 'Boolean OR.'),
  word('not', 'keyword', 'operator', 'Boolean NOT.'),
  word('matches', 'keyword', 'operator', 'Tests a string against a regular expression.'),
  word('contains', 'keyword', 'operator', 'Tests whether a string contains a substring.'),
  word('startswith', 'keyword', 'operator', 'Tests a string prefix.'),
  word('endswith', 'keyword', 'operator', 'Tests a string suffix.'),
  word('uint16', 'function', 'built-in', 'Reads 2 bytes little-endian at an offset: `uint16(0) == 0x5A4D`.'),
  word('uint32', 'function', 'built-in', 'Reads 4 bytes little-endian at an offset.'),
  word('uint8', 'function', 'built-in', 'Reads 1 byte at an offset.'),
];

const OPTIONS = [...SECTIONS, ...MODIFIERS, ...CONDITION];

export function yaraCompletions(context) {
  const before = context.matchBefore(/\w*/);
  // explicit = the user pressed Ctrl-Space. Without this check an empty
  // match would pop the full list on every keystroke.
  if (!before || (before.from === before.to && !context.explicit)) return null;

  return {
    from: before.from,
    options: OPTIONS,
    // The token is a plain word, so CodeMirror can filter as the user
    // types without re-querying this source.
    validFor: /^\w*$/,
  };
}
