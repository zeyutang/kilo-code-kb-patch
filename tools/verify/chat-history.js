// The chat-history rule reads past two stretches of Kilo's handler that it
// does not own: what the handler declares between the direction and the
// navigate() call, and what that call passes after the caret. Both were
// empty until 7.8.2 made the history carry the draft's pasted chunks, and
// a rule that spelled the call out matched nothing from that build on. So
// two generations of the handler are live, and whichever one this build
// has, the other is made out of its own bytes here and has to derive as
// well: the same edit, with what Kilo added written back untouched.
//
// What makes the capture safe to derive unreviewed is narrower than "the
// edit names nothing inside it". The edit changes what one local holds,
// the caret, so nothing captured may read that local, and the rule has to
// say so rather than derive. The last three checks are the limits on how
// far the declarations stretch may run: not past the statement, not into
// a block, and not further than a declaration list plausibly is.

const { check } = require("../lib/cli");
const {
  RULES,
  replaceLiteral,
  HISTORY_DECLARATIONS_LIMIT,
} = require("../lib/rules");

module.exports = {
  needs: [],
  run({ test, pristine }) {
    console.log(
      "\nchat history (what the rule reads past, and what it refuses)",
    );
    {
      const rule = RULES.find((r) => r.key === "chat-history");
      const js = pristine["webview.js"];
      const own = rule.derive(js);
      if (own.original === undefined) {
        check(false, "chat-history derives a site to reshape");
      } else {
        const s = own.symbols;
        const call = (extra) =>
          `${s.result}=${s.history}.navigate(${s.direction},${s.text}(),${s.caret}${extra})`;
        const tail = `${s.declarations}${call(s.extraArguments)}`;
        // This build's handler with other declarations ahead of the call and
        // other arguments after the caret, as anchor text and as a bundle.
        const reshaped = (text, declarations, extra) =>
          text.slice(0, -tail.length) + declarations + call(extra);
        const bundleWith = (declarations, extra) =>
          replaceLiteral(
            js,
            own.original,
            reshaped(own.original, declarations, extra),
          );
        const derived = (declarations, extra) =>
          rule.derive(bundleWith(declarations, extra));
        const outcome = (r) =>
          JSON.stringify(r.error ?? r.matches ?? "it derived a site");

        const carries = s.declarations !== "";
        const other = carries
          ? ["", ""]
          : ["_kbpP=_kbpC.pastes().map(_kbpX=>_kbpX.text),", ",_kbpP"];
        const flipped = derived(...other);
        check(
          own.original.endsWith(tail) &&
            flipped.original === reshaped(own.original, ...other),
          `the ${carries ? "text-only" : "chunk-carrying"} form of this handler derives too`,
          outcome(flipped),
        );
        check(
          flipped.patched === reshaped(own.patched, ...other),
          "with the same edit, and Kilo's declarations and arguments written back verbatim",
        );
        const admission = test.admissibility(rule, bundleWith(...other));
        check(
          "edit" in admission,
          "and apply would derive that form unreviewed",
          admission.refused,
        );

        const reads = derived(`_kbpP=_kbpF(${s.caret}),`, ",_kbpP");
        check(
          reads.original === undefined && /caret/.test(reads.error ?? ""),
          "a declaration that reads the caret is reported, not derived",
          outcome(reads),
        );
        const twice = derived("", `,${s.caret}`);
        check(
          twice.original === undefined && /caret/.test(twice.error ?? ""),
          "so is a call that passes the caret a second time",
          outcome(twice),
        );
        // The same letters where they are not the local: inside a longer
        // name (a `$` counts as part of one), as a member, and as a quoted
        // string. A minified name is short enough to meet all three, and
        // refusing on one would leave a sound build unpatched.
        const lookalike = derived(
          `_kbpP=_kbpF(_${s.caret},${s.caret}_,$${s.caret},${s.caret}$,_kbpO.${s.caret},"${s.caret}"),`,
          ",_kbpP",
        );
        check(
          lookalike.original !== undefined,
          "the caret's letters in a longer name, a member or a string are not a reading of it",
          outcome(lookalike),
        );

        const leaves = derived("_kbpP=1;let _kbpQ=2,", "");
        check(
          leaves.matches === 0,
          "declarations that end the statement are not read as part of it",
          outcome(leaves),
        );
        const enters = derived("_kbpP=()=>{},", ",_kbpP");
        check(
          enters.matches === 0,
          "nor are declarations that open a block",
          outcome(enters),
        );
        // One declaration of exactly `n` bytes ahead of its comma, so the two
        // sides of the bound differ by a single digit and nothing else.
        const stretch = (n) => `_kbpP=${"1".padEnd(n - 6, "0")},`;
        const atLimit = derived(stretch(HISTORY_DECLARATIONS_LIMIT), ",_kbpP");
        const pastLimit = derived(
          stretch(HISTORY_DECLARATIONS_LIMIT + 1),
          ",_kbpP",
        );
        check(
          atLimit.original !== undefined && pastLimit.matches === 0,
          `a stretch of ${HISTORY_DECLARATIONS_LIMIT} bytes is read and one of ${HISTORY_DECLARATIONS_LIMIT + 1} is not`,
          `${outcome(atLimit)} at the limit, ${outcome(pastLimit)} past it`,
        );
      }
    }
  },
};
