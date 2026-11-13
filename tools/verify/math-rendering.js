// Math rendering has the same "no variant for this build is a silent no-op"
// contract as the attach button, and one property of its own worth pinning:
// the splice must not disturb the two katex extensions Kilo already ships,
// so both are asserted still present afterwards. What the added extensions
// actually render is proved separately, in tools/behavior.js, against this
// build's own bundled marked.

const fs = require("fs");
const path = require("path");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");

module.exports = {
  needs: ["apply"],
  run({ test, sandbox, dist }) {
    console.log("\nmath rendering (opt-in bonus)");
    shim.setConfig({ addAttachFileButton: true, chatMathRendering: true });
    const beforeMath = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
    const mathVariant = test.matchingMathExtension(beforeMath);
    const mathRow = () =>
      test.computeBonusStatus(sandbox).find((b) => b.label.includes("math"))
        ?.state;
    if (mathVariant) {
      check(
        countOccurrences(beforeMath, mathVariant.original) === 1,
        "the matched pack tail occurs exactly once",
      );
      check(
        test.reconcileMathRendering(sandbox),
        "enabling adds the extensions",
      );
      const afterMath = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
      check(
        countOccurrences(afterMath, 'name:"kbpKatexInlineDollar"') === 1 &&
          countOccurrences(afterMath, 'name:"kbpKatexBlockBracket"') === 1 &&
          countOccurrences(afterMath, 'name:"kbpKatexInlineBracket"') === 1,
        "exactly one copy of each added extension",
      );
      check(
        afterMath.includes('{name:"doubleKatexBlock",level:"block"') &&
          afterMath.includes('{name:"doubleKatexInline",level:"inline"') &&
          afterMath.includes('{name:"inlineKatex",level:"inline"'),
        "Kilo's own $$ and \\( extensions survive the splice",
      );
      check(mathRow() === "on", "bonus reports on", `got "${mathRow()}"`);
      check(
        test.reconcileMathRendering(sandbox) === false,
        "re-enabling is a no-op",
      );
    } else {
      // Since 2.1.3 "no shipped entry" is the derived path rather than a dead
      // end, so what enabling does here depends on whether this build's own
      // bytes can supply the splice. What that path writes is asserted in the
      // derived-bonuses section; this one only has to agree with the row.
      const derivable =
        test.deriveBonus("math-rendering", beforeMath) !== undefined;
      check(
        test.reconcileMathRendering(sandbox) === derivable,
        derivable
          ? "no shipped entry: enabling applies the derived splice"
          : "no shipped entry and nothing to derive: enabling changes nothing",
      );
      const wanted = derivable ? "on" : "unavailable";
      check(
        mathRow() === wanted,
        `bonus reports "${wanted}"`,
        `got "${mathRow()}"`,
      );
    }
  },
};
