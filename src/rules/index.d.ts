// The surface src/rules/ offers the TypeScript side of the extension.
//
// src/rules/ states each patch point as a shape over identifier placeholders
// and rebuilds the edit from the symbols it captures, which is how every
// literal in src/patterns/ was produced. It is plain JS because the offline
// harness loads the same file, so its surface is declared here rather than
// inferred.
export interface DeriveResult {
  original?: string;
  patched?: string;
  symbols?: Record<string, string>;
  matches?: number;
  error?: string;
  legacy?: { original: string; patched: string };
  // What the matched form does, for a rule whose forms differ in that.
  description?: (version: string) => string;
  // The further matches a rule read a symbol from, where the edit names
  // something its own anchor does not contain. See `admissibility`.
  hops?: { index: number; text: string }[];
  // Values the edit writes that are not names in the bundle's scope.
  data?: Record<string, string>;
}

export interface ShapeRule {
  key: string;
  file: string;
  description: (version: string) => string;
  derive: (content: string) => DeriveResult;
}

// A bonus rule carries no description, since the bonus lists it feeds are
// captioned in the status view rather than in an apply log.
export type BonusRule = Omit<ShapeRule, "description">;

export const RULES: ShapeRule[];
export const MATH_RULE: BonusRule;
export const ATTACH_RULE: BonusRule;
export const RAW_MARKDOWN_RULE: BonusRule;
// `text` with `put` where `find` first occurs, both taken as plain text. Every
// edit the extension makes is written and reversed through it rather than
// through a bare String.replace, whose replacement *string* reads `$&`, `$$`,
// `` $` `` and `$'` as patterns. Patch text is minified code, where `$` and
// `$$` are ordinary names, so a site holding `$&&x` or `$$()` would be written
// wrong, and the second of those still parses (see src/rules/engine.js).
export function replaceLiteral(text: string, find: string, put: string): string;
