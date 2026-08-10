// ============================================================
// TASK F7 — YARA syntax highlighting
// ============================================================
// ROUTE CHOSEN: (a) StreamLanguage + a hand-written tokeniser.
//
// Why not a Lezer grammar: Lezer gives a real syntax tree, which you
// need for folding, structural autocomplete and rule outlining. None of
// those are on the roadmap, and it costs a .grammar file plus a build
// step. A tokeniser is ~150 lines with no tooling and colours the
// document correctly, which is the entire requirement today. Revisit if
// structural features arrive.
//
// The tokeniser is character-by-character and MUST consume at least one
// character per call or CodeMirror hangs. Every branch below either
// advances the stream or falls through to stream.next().

import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const KEYWORDS = new Set([
  'rule', 'private', 'global', 'import', 'include',
  'meta', 'strings', 'condition',
]);

// Condition-language operators and built-ins.
const OPERATORS = new Set([
  'and', 'or', 'not', 'all', 'any', 'none', 'of', 'them', 'at', 'in', 'for',
  'matches', 'contains', 'icontains', 'startswith', 'istartswith',
  'endswith', 'iendswith', 'iequals', 'defined',
]);

// Built-in values available in a condition.
const BUILTINS = new Set([
  'filesize', 'entrypoint',
  'uint8', 'uint16', 'uint32', 'int8', 'int16', 'int32',
  'uint8be', 'uint16be', 'uint32be', 'int8be', 'int16be', 'int32be',
]);

// String modifiers — only meaningful in the strings: block, but colouring
// them everywhere is harmless and keeps the tokeniser stateless here.
const MODIFIERS = new Set([
  'nocase', 'wide', 'ascii', 'xor', 'base64', 'base64wide', 'fullword',
]);

const yaraTokens = {
  startState() {
    return {
      inBlockComment: false,
      inHex: false,      // inside a { 4D 5A ?? } pattern
      afterEquals: false, // last significant token was '=', so { or / starts a value
    };
  },

  token(stream, state) {
    // --- block comment, spans lines ---
    if (state.inBlockComment) {
      while (!stream.eol()) {
        if (stream.next() === '*' && stream.peek() === '/') {
          stream.next();
          state.inBlockComment = false;
          break;
        }
      }
      return 'comment';
    }

    // --- hex pattern block, spans lines ---
    // Tokenised as a unit: ?? wildcards, [4-6] jumps and (A|B) alternatives
    // all use characters that would otherwise read as operators.
    if (state.inHex) {
      if (stream.eatSpace()) return null;
      if (stream.eat('}')) {
        state.inHex = false;
        return 'string';
      }
      if (stream.match(/^[0-9a-fA-F?]{1,2}/)) return 'string';
      if (stream.match(/^\[[^\]]*\]/)) return 'number';
      if (stream.match(/^[()|~-]/)) return 'operator';
      stream.next();
      return 'string';
    }

    if (stream.eatSpace()) return null;

    // --- comments ---
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      state.inBlockComment = true;
      return 'comment';
    }

    // --- values that only start a value position ---
    if (state.afterEquals && stream.peek() === '{') {
      stream.next();
      state.inHex = true;
      state.afterEquals = false;
      return 'string';
    }
    if (state.afterEquals && stream.peek() === '/') {
      // Regex literal. Consume to the closing unescaped slash, then the
      // modifier letters that follow it.
      stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const ch = stream.next();
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '/') break;
      }
      stream.match(/^[is]*/);
      state.afterEquals = false;
      return 'regexp';
    }

    // --- string literal ---
    if (stream.peek() === '"') {
      stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const ch = stream.next();
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') break;
      }
      state.afterEquals = false;
      return 'string';
    }

    // --- pattern identifiers: $a  #a  @a  !a, and the $* wildcard ---
    if (stream.match(/^[$#@!][a-zA-Z0-9_]*\*?/)) {
      state.afterEquals = false;
      return 'variableName';
    }

    // --- numbers, including 0x and KB/MB/GB suffixes ---
    if (stream.match(/^0x[0-9a-fA-F]+/) || stream.match(/^\d+(KB|MB|GB)?\b/)) {
      state.afterEquals = false;
      return 'number';
    }

    // --- words ---
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current();
      state.afterEquals = false;
      if (word === 'true' || word === 'false') return 'bool';
      if (KEYWORDS.has(word)) return 'keyword';
      if (OPERATORS.has(word)) return 'operatorKeyword';
      // 'atom', not 'standard' — StreamLanguage maps token strings onto
      // tags by name, and t.standard is a modifier function, not a tag.
      if (BUILTINS.has(word)) return 'atom';
      if (MODIFIERS.has(word)) return 'modifier';
      // A bare word in key position inside meta: is a metadata key.
      if (stream.peek() === ' ' || stream.peek() === '=') return 'propertyName';
      // Anything else (module names, rule names) stays default foreground.
      return null;
    }

    // --- operators and punctuation ---
    if (stream.eat('=')) {
      // '==' is a comparison, a lone '=' is an assignment and opens a
      // value position (hex block or regex).
      state.afterEquals = !stream.eat('=');
      return 'operator';
    }
    if (stream.match(/^(<=|>=|!=|<<|>>|[<>+\-*\\%&^|~])/)) {
      state.afterEquals = false;
      return 'operator';
    }

    state.afterEquals = false;
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', '"', '/'] },
  },
};

export const yaraStreamLanguage = StreamLanguage.define(yaraTokens);

// Colours match @theme in index.css (One Dark Pro). CodeMirror cannot
// read Tailwind tokens, so these are literals — keep the two in sync.
const yaraHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: t.keyword, color: '#c678dd' },
  { tag: t.operatorKeyword, color: '#56b6c2' },
  { tag: t.operator, color: '#56b6c2' },
  { tag: t.string, color: '#98c379' },
  { tag: t.regexp, color: '#98c379' },
  { tag: t.number, color: '#d19a66' },
  { tag: t.bool, color: '#d19a66' },
  { tag: t.atom, color: '#e5c07b' },
  { tag: t.variableName, color: '#e06c75' },
  { tag: t.propertyName, color: '#61afef' },
  { tag: t.modifier, color: '#d19a66' },
]);

export function yara() {
  return [yaraStreamLanguage, syntaxHighlighting(yaraHighlightStyle)];
}
