// The engine every shape rule is built on: identifier placeholders, literal
// replacement, the candidate prefilter, the helpers rules share, and what a
// rule reports.

// What a rule reports: the edit it derived, or why it could not (see the
// outcomes in index.ts).
export interface DeriveResult {
  original?: string;
  patched?: string;
  symbols?: Record<string, string>;
  matches?: number;
  error?: string;
  // The edit for entries shipped before a rule widened its anchor, which
  // still read as covered.
  legacy?: { original: string; patched: string };
  // What the matched form does, for a rule whose forms differ in that.
  description?: (version: string) => string;
  // Which of its forms a rule with several matched.
  form?: string;
  // The further matches a rule read a symbol from, where the edit names
  // something its own anchor does not contain. See `admissibility`.
  hops?: Hop[];
  // Values the edit writes that are not names in the bundle's scope.
  data?: Record<string, string>;
}

// A span a rule matched: where it sits in the bundle and its text.
export interface Hop {
  index: number;
  text: string;
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

// A regex source for one identifier, the placeholder every shape is written
// with.
export const ID = "[A-Za-z_$][A-Za-z0-9_$]*";

// A literal made safe to embed in a regex source.
export function esc(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `text` with `put` where `find` first occurs, both taken as plain text.
//
// String.replace reads four sequences in a replacement *string* as patterns:
// `$&` (the match), `$$` (a dollar), and `` $` `` and `$'` (the text either
// side of it). Minified code is made of exactly those. `$` and `$$` are
// ordinary names to the minifier (7.8.3 calls a local of the chat scope `$`),
// so `$&&x` is a local on the left of an `&&` and `$$()` is a call. Passed as
// a replacement string, the first becomes the matched text followed by `&x`
// and the second a call to a different function, and the second still parses.
// A replacement function's result is not read that way, so everything that
// moves patch text goes through here: the rules that build an edit by
// replacing inside the text they matched, Apply, Restore, the bonus
// reconcilers, and the harness when it reverses or stages one.
export function replaceLiteral(
  text: string,
  find: string,
  put: string,
): string {
  return text.replace(find, () => put);
}

// --- Candidate prefiltering --------------------------------------------------
//
// Most shapes open on an identifier placeholder, so the engine has to retry
// every offset of a 21 MB bundle: about 1.25 s per rule, 13.7 s for the set,
// which is affordable offline but not on an apply path. Every shape also
// contains literal text the minifier cannot touch, and by construction that
// text sits inside every match of the shape, so it can nominate candidate
// offsets and the shape then runs only in a window around each. Measured on
// pristine 7.6.2: 1250 ms to 5 ms per rule, byte-identical results.
//
// The literal is extracted from the shape rather than written next to it. A
// hand-written one would be exactly the latent hardcode the 7.4.21 lesson
// warns about, free to drift from the shape it is meant to summarize and
// silently narrow the search; an extracted one cannot disagree with its shape.
const CANDIDATE_WINDOW = 8192;

// The escapes that stand for one fixed character, which a literal run can
// carry as that character.
const CHARACTER_ESCAPE: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  f: "\f",
  v: "\v",
};

// The longest run of literal characters that every match of a regex source is
// certain to contain, or "" when nothing is certain. It nominates the offsets
// a shape is run at, so the two ways of getting it wrong are not alike. A run
// judged shorter than it is costs a little speed. A run judged certain when it
// is not narrows the search to places some matches never are, and a rule then
// reports "no match" on a build it fits, at apply, with nothing to say so.
// Every construct is therefore read for what it guarantees rather than for
// whether it looks like text, and anything not understood guarantees nothing.
//
// What is certain is settled per group, once the group has closed and what
// follows it is known. A run inside a group counts only if the group must
// match at least once (no `?`, `*` or `{0,` after it), holds no alternation
// (either side of a `|` may be the one that matched), and is not a lookaround
// (a negative one names text that must be absent, and a positive one names
// text beside the match rather than in it). The characters that spell a
// group's kind (`?:`, `?<name>`) are syntax, not text. An alternation at the
// top level leaves nothing certain at all.
export function longestLiteral(source: string): string {
  let i = 0;

  // The quantifier that starts at `i`, if one does: the fewest repeats it
  // allows. Moves past it and past the `?` that makes it lazy.
  const quantifier = (): number | undefined => {
    const c = source[i];
    let fewest: number;
    if (c === "?" || c === "*") fewest = 0;
    else if (c === "+") fewest = 1;
    else if (c === "{") {
      const close = source.indexOf("}", i);
      const count = /^\d+/.exec(source.slice(i + 1));
      fewest = count ? Number(count[0]) : 0;
      i = close === -1 ? source.length : close;
    } else return undefined;
    i++;
    if (source[i] === "?") i++;
    return fewest;
  };

  // One list of alternatives, up to the `)` that closes it or the end of the
  // source: the runs each match is certain to contain if this list is, in the
  // order they appear, and whether it held a `|`.
  const alternatives = (): { runs: string[]; alternated: boolean } => {
    const runs: string[] = [];
    let run = "";
    let alternated = false;
    const end = () => {
      if (run) runs.push(run);
      run = "";
    };
    while (i < source.length && source[i] !== ")") {
      const c = source[i];
      if (c === "|") {
        alternated = true;
        end();
        i++;
        continue;
      }
      if (c === "(") {
        end();
        i++;
        let lookaround = false;
        if (source[i] === "?") {
          i++;
          const named =
            source[i] === "<" && source[i + 1] !== "=" && source[i + 1] !== "!";
          if (source[i] === ":") i++;
          else if (named) {
            const close = source.indexOf(">", i);
            i = close === -1 ? source.length : close + 1;
          } else {
            lookaround = true;
            i += source[i] === "<" ? 2 : 1;
          }
        }
        const inner = alternatives();
        i++;
        const fewest = quantifier() ?? 1;
        if (!lookaround && !inner.alternated && fewest >= 1) {
          runs.push(...inner.runs);
        }
        continue;
      }
      // A character class stands for one of a set, so neither the class nor
      // the characters spelling it out belong to a run. ID is written as two
      // classes, so missing this reads the class body "A-Za-z_$" as text.
      if (c === "[") {
        end();
        i++;
        while (i < source.length && source[i] !== "]") {
          i += source[i] === "\\" ? 2 : 1;
        }
        i++;
        continue;
      }
      if (c === "\\") {
        const next = source[i + 1];
        i += 2;
        if (next === undefined) break;
        const past = (closer: string) => {
          const close = source.indexOf(closer, i);
          i = close === -1 ? source.length : close + 1;
        };
        if (/[1-9]/.test(next)) {
          // A backreference, however many digits it runs to: \11 is one, and
          // reading it as \1 leaves a stray "1" at the head of the next run.
          while (/[0-9]/.test(source[i] ?? "")) i++;
          end();
        } else if (next in CHARACTER_ESCAPE) {
          run += CHARACTER_ESCAPE[next];
        } else if (/[A-Za-z0-9]/.test(next)) {
          // A set (\d, \w, \s), an assertion (\b), a named backreference, or a
          // character written by its code. None is a plain character, and the
          // ones that take an argument must not leave it behind as text.
          if (next === "k" && source[i] === "<") past(">");
          else if ((next === "p" || next === "P") && source[i] === "{") {
            past("}");
          } else if (next === "u" && source[i] === "{") past("}");
          else if (next === "u") i += 4;
          else if (next === "x") i += 2;
          else if (next === "c") i += 1;
          end();
        } else {
          // An escaped punctuation character is that character.
          run += next;
        }
        continue;
      }
      if (c === "." || c === "^" || c === "$") {
        end();
        i++;
        continue;
      }
      // A quantifier here applies to the single character before it, which
      // makes that character optional or repeatable: it cannot be counted on,
      // and what follows it is not adjacent to what came before.
      if (quantifier() !== undefined) {
        run = run.slice(0, -1);
        end();
        continue;
      }
      run += c;
      i++;
    }
    end();
    return { runs, alternated };
  };

  const top = alternatives();
  // A `)` with nothing open is a source this does not understand.
  if (i < source.length || top.alternated) return "";
  let best = "";
  for (const run of top.runs) if (run.length > best.length) best = run;
  return best;
}

const literalCache = new Map<string, string>();
function shapeLiteral(source: string): string {
  let lit = literalCache.get(source);
  if (lit === undefined) {
    lit = longestLiteral(source);
    literalCache.set(source, lit);
  }
  return lit;
}

// Every match of `source` in `content`, with absolute `.index` values: rules
// read that offset to slice the bundle and to measure the gap between two
// hops, so a window-relative one would corrupt both.
// Prefiltering is a shortcut, so the harness has to be able to take the long
// way and compare: `retarget` re-derives every rule with this off and requires
// byte-identical output, which is what keeps the extraction honest per build
// rather than per review.
let prefilterEnabled = true;
export function withoutPrefilter<T>(fn: () => T): T {
  prefilterEnabled = false;
  try {
    return fn();
  } finally {
    prefilterEnabled = true;
  }
}

export function findAll(content: string, source: string): RegExpExecArray[] {
  const literal = prefilterEnabled ? shapeLiteral(source) : "";
  // Short of two windows there is nothing to save, and slices this size are
  // where the two-hop rules do their local scans.
  if (literal.length < 4 || content.length <= CANDIDATE_WINDOW * 2) {
    return [...content.matchAll(new RegExp(source, "g"))];
  }

  const found = new Map<number, RegExpExecArray>();
  let at = 0;
  while ((at = content.indexOf(literal, at)) !== -1) {
    // Widen on the rare chance that a match reaches a window edge, so the
    // window can never truncate one into a miss or a short match.
    let span = CANDIDATE_WINDOW;
    for (;;) {
      const from = Math.max(0, at - span);
      const to = Math.min(content.length, at + literal.length + span);
      const slice = content.slice(from, to);
      const hits = [...slice.matchAll(new RegExp(source, "g"))];
      const abuts = hits.some(
        (m) =>
          (from > 0 && m.index === 0) ||
          (to < content.length && m.index + m[0].length === slice.length),
      );
      if (abuts) {
        span *= 2;
        continue;
      }
      for (const m of hits) {
        m.index += from;
        m.input = content;
        if (!found.has(m.index)) found.set(m.index, m);
      }
      break;
    }
    at += literal.length;
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

// Occurrences of a literal in a text, not overlapping: for a rule that has to
// know where its edit lands within the bytes it anchored, and for admission,
// which needs an edit to occur exactly once. An empty needle occurs nowhere,
// where the search would otherwise find it at the same offset forever.
export function countIn(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

// Whether a span of the bundle enters another function body. Two of the bonus
// rules bind a symbol from a second match (a hop) near their anchor, and a hop
// is only sound while it reads the same component the edit lands in. Arrows
// are everywhere in minified code and are fine to cross, since they close over
// the scope they sit in, while the `function` keyword is how this bundle opens
// a component or a helper with a scope of its own. A quote beside the word is
// Solid's `typeof ref=="function"` check rather than a declaration.
export function crossesFunction(text: string): boolean {
  return /(?<![\w$."'`])function(?![\w$"'`])/.test(text);
}

// Whether a span reads the local `name`, for a rule that has to know a
// captured span leaves that local alone. Three things spell the same letters
// without being it, and a minified name is short enough to meet all of them (a
// local the minifier called `id` beside an unrelated `.id`): a longer
// identifier that contains it, a member of that name, and a quoted string.
// Counting any of them would refuse a build the edit is sound on, which leaves
// its users on stock Kilo for nothing. The boundary is not `\b`, which reads
// `$` as one and would let `$e` answer for `e`.
export function namesToken(text: string, name: string): boolean {
  return new RegExp(`(?<![\\w$."'\`])${esc(name)}(?![\\w$"'\`])`).test(text);
}

// A matched span as a rule reports it to apply-time admission: where it sits
// in the bundle and the text it matched, so the extension can check that the
// symbols read from it lie near the edit (see `hops` in DeriveResult).
export function hop(match: RegExpExecArray): Hop {
  return { index: match.index, text: match[0] };
}

// The identifier a capture group holds, for the emitted symbol map.
function symbolMap(
  names: string[],
  match: RegExpExecArray,
): Record<string, string> {
  const out: Record<string, string> = {};
  names.forEach((name, i) => {
    out[name] = match[i + 1];
  });
  return out;
}

// One shape and how to rebuild its edit from a match: the captures are the
// symbols, named in capture order.
interface Shape {
  shape: string;
  names: string[];
  build: (match: RegExpExecArray) => string;
}

// Most rules are a single shape plus a rebuild function.
export function shapeRule({
  key,
  file,
  shape,
  names,
  build,
  description,
}: Shape & Omit<ShapeRule, "derive">): ShapeRule {
  return {
    key,
    file,
    description,
    derive(content) {
      const matches = findAll(content, shape);
      if (matches.length !== 1) return { matches: matches.length };
      const m = matches[0];
      return {
        original: m[0],
        patched: build(m),
        symbols: symbolMap(names, m),
      };
    },
  };
}

// Some patch points change *shape*, not just symbols. 7.6.0 folded the chat
// Escape handling into one ternary-chain helper where 7.5.16 and older ran two
// consecutive `if` statements, and both forms are live across the supported
// range. Such a rule carries one template per form and takes the form that
// matches exactly once. Two forms matching at once is an aliasing hazard, so it
// is reported as ambiguous rather than resolved by list order, the same
// contract shapeRule holds for two matches of one shape.
export function formsRule({
  key,
  file,
  forms,
  description,
}: { forms: Shape[] } & Omit<ShapeRule, "derive">): ShapeRule {
  return {
    key,
    file,
    description,
    derive(content) {
      const live = forms
        .map((form) => ({ form, matches: findAll(content, form.shape) }))
        .filter((hit) => hit.matches.length > 0);
      const total = live.reduce((n, hit) => n + hit.matches.length, 0);
      if (total !== 1) return { matches: total };
      const { form, matches } = live[0];
      const m = matches[0];
      return {
        original: m[0],
        patched: form.build(m),
        symbols: symbolMap(form.names, m),
      };
    },
  };
}
