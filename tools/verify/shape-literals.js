// The extractor that decides which literal nominates candidate sites. The
// retarget equivalence proof covers it for the shapes that exist today, on
// the builds it is run against. These pin what it has to get right for a
// shape nobody has written yet, on a build nobody has reviewed: a literal
// counted as certain when it is not sends the scan to places some matches
// never are, and the rule then reports "no match" where it fits.
//
// The first seven are the ways it went wrong while being written. The rest
// are what an earlier version got wrong without it showing, because the
// runs it misread (the text of an optional group, the `?:` that opens a
// group, the second digit of `\11`) were never the longest in a shape.

const { check } = require("../lib/cli");
const {
  longestLiteral,
  findAll,
  withoutPrefilter,
  ID,
} = require("../lib/rules");

// The contract of the literal a shape is prefiltered by, tried on shapes nobody
// wrote: every match of a source contains the literal drawn from it. Sources
// come from a small grammar over a four-letter alphabet (runs, classes,
// quantified atoms, groups of every kind with and without a repeat,
// alternation, lookarounds, backreferences, escapes), so random text over the
// same letters matches them often, and each match is checked.
//
// The cases beside this pin constructs one at a time. This is for what they
// cannot list: one construct inside another, where the extractor has to carry
// what a group guarantees out through the groups around it.
//
// The generator is seeded, so a run is the same sources and the same text
// every time. A group is never repeated without bound: an unbounded repeat
// around an unbounded repeat backtracks exponentially, which would test the
// regex engine's patience rather than the extractor.
function randomShapeViolations(count, seed) {
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const LETTERS = ["a", "b", "c", "d"];
  const ATOM_REPEATS = ["", "", "", "?", "*", "+", "{0,2}", "{1,2}", "{2}"];
  const ATOM_REPEATS_MORE = ["{2,}", "{0,}", "??", "*?", "+?"];
  const GROUP_REPEATS = ["", "", "", "?", "{0,2}", "{1,2}", "{2}", "??"];
  const CLASSES = ["[ab]", "[^a]", ".", "[a-c]", "\\w", "[cd]", "\\S", "\\D"];
  const CLASSES_MORE = ["[\\]a)(|]", "[a\\-c]"];
  const ESCAPES = ["\\.", "\\n", "\\x61", "\\u0062", "\\b", "\\B", "^", "$"];
  const ESCAPES_MORE = ["\\0", "\\cJ", "\\t", "\\/", "\\-"];

  const generate = () => {
    let groups = 0;
    const named = [];
    const run = () => {
      let out = "";
      const length = 1 + Math.floor(random() * 4);
      for (let i = 0; i < length; i++) out += pick(LETTERS);
      return out;
    };
    const repeat = () => pick([...ATOM_REPEATS, ...ATOM_REPEATS_MORE]);
    let alternation;
    const atom = (depth) => {
      const r = random();
      if (r < 0.42) return run();
      if (r < 0.5) return pick(LETTERS) + repeat();
      if (r < 0.56) return pick([...CLASSES, ...CLASSES_MORE]) + repeat();
      if (r < 0.6 && groups > 0) {
        return `\\${1 + Math.floor(random() * groups)}`;
      }
      if (r < 0.63) return pick([...ESCAPES, ...ESCAPES_MORE]);
      if (r < 0.65 && named.length > 0) return `\\k<${pick(named)}>`;
      if (depth >= 3) return run();
      const kind = random();
      if (kind < 0.3) {
        groups++;
        return `(${alternation(depth + 1)})${pick(GROUP_REPEATS)}`;
      }
      if (kind < 0.6) {
        return `(?:${alternation(depth + 1)})${pick(GROUP_REPEATS)}`;
      }
      if (kind < 0.68) {
        groups++;
        const name = `g${groups}`;
        const body = alternation(depth + 1);
        named.push(name);
        return `(?<${name}>${body})${pick(GROUP_REPEATS)}`;
      }
      if (kind < 0.76) return `(?=${alternation(depth + 1)})`;
      if (kind < 0.84) return `(?!${alternation(depth + 1)})`;
      if (kind < 0.92) return `(?<=${alternation(depth + 1)})`;
      return `(?<!${alternation(depth + 1)})`;
    };
    const sequence = (depth) => {
      let out = "";
      const length = 1 + Math.floor(random() * 4);
      for (let i = 0; i < length; i++) out += atom(depth);
      return out;
    };
    alternation = (depth) => {
      let out = sequence(depth);
      while (random() < 0.18) out += `|${sequence(depth)}`;
      return out;
    };
    return alternation(0);
  };
  const text = () => {
    let out = "";
    const length = 30 + Math.floor(random() * 60);
    for (let i = 0; i < length; i++) {
      out += random() < 0.03 ? pick([".", "\n", " "]) : pick(LETTERS);
    }
    return out;
  };

  const result = { shapes: 0, literals: 0, matches: 0, violations: [] };
  for (let n = 0; n < count; n++) {
    const source = generate();
    let shape;
    try {
      shape = new RegExp(source, "g");
    } catch {
      continue;
    }
    result.shapes++;
    const literal = longestLiteral(source);
    if (literal) result.literals++;
    for (let t = 0; t < 12; t++) {
      for (const m of text().matchAll(shape)) {
        result.matches++;
        if (!m[0].includes(literal)) {
          result.violations.push({ source, literal, match: m[0] });
          break;
        }
      }
    }
  }
  return result;
}

module.exports = {
  needs: [],
  run() {
    console.log("\nshape literal extraction (what prefilters a scan)");
    {
      const cases = [
        [`(${ID})\\.key==="Escape"`, '.key==="Escape"', "a plain run"],
        [
          `(${ID})=!!(${ID})\\?\\.closest\\("textarea\\.prompt-input"\\)`,
          '?.closest("textarea.prompt-input")',
          "escaped punctuation is literal (\\? is a ?), a class body is not",
        ],
        [`ab?cdef`, "cdef", "a quantified character is dropped from its run"],
        [`abcd\\d+efghi`, "efghi", "a character class escape ends the run"],
        [`(${ID})x\\1yzwv`, "yzwv", "a backreference ends the run"],
        [`ab{2,3}cdefg`, "cdefg", "a counted quantifier ends the run"],
        [`(${ID})`, "", "an all-placeholder shape yields nothing"],
        [
          `prefix(?:optional)?suffix`,
          "prefix",
          "a run inside an optional group is not certain",
        ],
        [
          `abcd(?:efghij)*klmno`,
          "klmno",
          "nor inside a group that may repeat zero times",
        ],
        [
          `abcd(?:efghij){0,3}klmno`,
          "klmno",
          "nor inside one counted from zero",
        ],
        [
          `abc(?:defghi)+jk`,
          "defghi",
          "a group that must match once keeps its runs",
        ],
        [
          `ab(?:cdefgh|ij)klmn`,
          "klmn",
          "either side of an alternation may be the one that matched",
        ],
        [
          `abcdef|ghijkl`,
          "",
          "an alternation at the top level leaves nothing certain",
        ],
        [
          `abcd(?!efghijk)`,
          "abcd",
          "a negative lookahead names text that must be absent",
        ],
        [`(?<!abcdefg)hijk`, "hijk", "and so does a negative lookbehind"],
        [
          `abcd(?=efghijk)`,
          "abcd",
          "a lookahead names text beside the match, not in it",
        ],
        [
          `(?:abcd)e`,
          "abcd",
          "the characters that spell a group's kind are not text",
        ],
        [`(?<name>abcd)e`, "abcd", "nor is a group's name"],
        [
          `a(?:bcdef(?:ghijklm)?no)+p`,
          "bcdef",
          "what is certain is settled group by group",
        ],
        [
          `abcd\\11efgh`,
          "abcd",
          "a backreference is read whole, however many digits",
        ],
        [
          `ab\\ncdef`,
          "ab\ncdef",
          "an escape for one fixed character is that character",
        ],
        [
          `abcd\\x41efgh`,
          "abcd",
          "a character written by its code leaves no digits behind",
        ],
        [`abcd)efgh`, "", "a source it cannot follow yields nothing"],
      ];
      for (const [source, want, why] of cases) {
        const got = longestLiteral(source);
        check(
          got === want,
          `${why}`,
          `wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
        );
      }

      // What a wrong literal costs, run rather than argued. Each text holds
      // one match that does not contain the run the earlier extractor chose
      // (the optional group is absent, the other alternative was taken, the
      // forbidden text is not there), far enough from either end for the scan
      // to be prefiltered. The prefiltered scan has to find what the full one
      // finds.
      const far = "_".repeat(20000);
      const hidden = [
        [
          `prefix(?:optional)?suffix`,
          "prefixsuffix",
          "a match without its optional group is still found",
        ],
        [
          `ab(?:cdefgh|ij)klmn`,
          "abijklmn",
          "so is one that took the other alternative",
        ],
        [
          `abcd(?!wxyzwxyz)`,
          "abcd.",
          "and one that a negative lookahead allows",
        ],
      ];
      for (const [source, text, why] of hidden) {
        const hay = far + text + far;
        const found = (matches) =>
          JSON.stringify(matches.map((m) => [m.index, m[0]]));
        const quick = found(findAll(hay, source));
        const full = found(withoutPrefilter(() => findAll(hay, source)));
        check(
          quick === full && JSON.parse(full).length === 1,
          why,
          `prefiltered ${quick}, full scan ${full}`,
        );
      }

      const sample = randomShapeViolations(2000, 20261001);
      check(
        sample.violations.length === 0 &&
          sample.literals > 1000 &&
          sample.matches > 100000,
        `${sample.shapes} random shapes: every one of ${sample.matches} matches contains the literal drawn from its source`,
        sample.violations.length > 0
          ? `${sample.violations.length} do not, first ${JSON.stringify(sample.violations[0])}`
          : `only ${sample.literals} shapes gave a literal and ${sample.matches} matches were seen`,
      );
    }
  },
};
