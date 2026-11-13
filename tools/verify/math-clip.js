// The second core stylesheet block: one declaration that makes each rendered
// formula clip its own out-of-flow MathML twin, so the twins stop extending the
// chat scroller past its content (the measurement is in the comment above
// MATH_CLIP_RULE in src/blocks/chat-style.ts; nothing here can run layout). It
// stores no per-release text either, so what is asserted is the shape of the
// rule, that it leaves the MathML in the tree, and the same carry-over contract
// and status rows as the chat-scroll stylesheet block (chat-scroll-style.js).
// From Kilo 7.8.7 KaTeX declares the same position itself, and there the block
// is not written and its row reads "not needed", so both readings of the gate
// are also run on this build's own stylesheet with KaTeX's declaration put in
// and taken out, whichever of the two the build ships.

const fs = require("fs");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");
const { replaceLiteral } = require("../lib/rules");
const { PROBES } = require("../lib/probes");

module.exports = {
  needs: ["apply"],
  run({ test, sandbox, dist, pristineCss, cssPath, coreOn, coreOff }) {
    console.log("\nmath clip (core stylesheet patch)");
    if (pristineCss === undefined) {
      check(false, `${test.CHAT_STYLE_FILE} is present in dist/`);
    } else {
      check(
        test.MATH_CLIP_RULE.includes(".katex {") &&
          test.MATH_CLIP_RULE.includes("position: relative"),
        "the rule makes each formula the containing block for its own twin",
      );
      check(
        !test.MATH_CLIP_RULE.includes("katex-mathml") &&
          !test.MATH_CLIP_RULE.includes("display: none"),
        "and leaves the MathML in the tree for screen readers and copying",
      );

      const probe = PROBES.find((p) => p.key === "math-clip");
      const rowOf = (css) =>
        test
          .chatCssCoreStatus(css)
          .find((f) => f.label === test.FEATURE_LABELS["math-clip"])?.state;
      const root = test.MATH_CLIP_ANCHORS["katex root"].exec(pristineCss)?.[0];
      if (check(root !== undefined, "KaTeX's root rule is readable")) {
        const fixed = /[{;]position:relative[;}]/.test(root);
        const withFix = fixed
          ? pristineCss
          : replaceLiteral(
              pristineCss,
              root,
              root.replace(/\}$/, ";position:relative}"),
            );
        const withoutFix = fixed
          ? replaceLiteral(
              pristineCss,
              root,
              root.replace(/position:relative;?/, ""),
            )
          : pristineCss;
        check(
          test.FEATURE_GATES["math-clip"](withoutFix) &&
            test.readMathClip(withoutFix) !== undefined &&
            rowOf(withoutFix) === "unpatched",
          'without KaTeX\'s declaration the block is wanted, and absent reads "unpatched"',
          `got "${rowOf(withoutFix)}"`,
        );
        check(
          !test.FEATURE_GATES["math-clip"](withFix) &&
            test.chatCssBlock("math-clip", withFix) === "" &&
            rowOf(withFix) === "unneeded",
          'with it the block is not written, and the row reads "not needed"',
          `got "${rowOf(withFix)}"`,
        );
        check(
          probe.read(withFix, test).na !== undefined,
          "and the probe reads n/a rather than ERROR",
          JSON.stringify(probe.read(withFix, test)),
        );

        // KaTeX's rule sits in `@layer base`, so a rule of Kilo's that leaves a
        // formula's root unpositioned outranks it and brings the blank space
        // back. The extension looks for one on `.katex` itself and then reads
        // "missing" rather than "not needed"; the probe looks through every
        // selector that can reach the root, and stops only at a declaration
        // that unpositions it.
        const plus = (rule) => `${withFix}\n${rule}`;
        const overridden = plus(
          "[data-component=markdown] .katex{position:static}",
        );
        check(
          test.FEATURE_GATES["math-clip"](overridden) &&
            rowOf(overridden) === "missing",
          'a rule on .katex that unpositions it reads "missing", not "not needed"',
          `got "${rowOf(overridden)}"`,
        );
        const undoing = [
          "[data-component=markdown] .katex{position:static}",
          "[data-component=markdown] span{all:unset}",
          "[data-component=markdown]{.katex{&:hover{position:initial}}}",
          ".katex-display>.katex,.x{position:revert-layer}",
        ];
        const passed = (rule) =>
          probe.read(plus(rule), test).error === undefined;
        check(
          undoing.every((rule) => !passed(rule)),
          "the probe refuses each rule that can unposition a formula's root",
          undoing.filter(passed).join(" | "),
        );
        const harmless = [
          "[data-component=markdown] .katex{position:relative}",
          "[data-component=markdown] .katex::before{position:static}",
          "[data-component=markdown] .katex .katex-html{position:static}",
          "[data-component=markdown] .katex-display{all:unset}",
          "@keyframes kbp-probe{0%{position:static}}",
        ];
        check(
          harmless.every(
            (rule) => probe.read(plus(rule), test).na !== undefined,
          ),
          "and passes each that cannot reach it or keeps it positioned",
          harmless
            .filter((rule) => !probe.read(plus(rule), test).na)
            .join(" | "),
        );
      }

      const hasClip = () =>
        fs
          .readFileSync(cssPath, "utf8")
          .includes("kilo-code-kb-patch:math-clip:begin");
      const clipRow = () =>
        test
          .computeStatus(dist)
          .files.find((f) => f.filename === test.CHAT_STYLE_FILE)
          ?.features.find((f) => f.label === test.FEATURE_LABELS["math-clip"])
          ?.state;
      const read = probe.read(pristineCss, test);
      if (test.FEATURE_GATES["math-clip"](pristineCss)) {
        const clip = test.readMathClip(pristineCss);
        check(
          clip !== undefined && read.values !== undefined,
          "KaTeX's out-of-flow MathML twin and the reasoning peek are readable",
          JSON.stringify(clip ?? read),
        );
        check(
          countOccurrences(
            fs.readFileSync(cssPath, "utf8"),
            "kilo-code-kb-patch:math-clip:begin",
          ) === 1 && test.chatCssApplied(sandbox, "math-clip"),
          "exactly one math-clip block, and it reads as applied",
        );
        shim.setConfig({ chatHistoryFontSizeEm: 1.3 });
        const clipWithBonus = test.reconcileChatStyle(sandbox);
        check(
          !clipWithBonus["math-clip"] && hasClip(),
          "a bonus reconcile leaves the applied block in place",
        );
        shim.setConfig({});
        const clipOff = test.reconcileChatStyle(sandbox, coreOff);
        check(
          clipOff["math-clip"] && !hasClip() && clipRow() === "unpatched",
          'restoring removes the block, which then reads "unpatched"',
          `got "${clipRow()}"`,
        );
        const clipOn = test.reconcileChatStyle(sandbox, coreOn);
        check(
          clipOn["math-clip"] && hasClip() && clipRow() === "patched",
          'Apply writes it again, which reads "patched"',
          `got "${clipRow()}"`,
        );
      } else {
        check(
          read.na !== undefined,
          "this build's KaTeX contains its own twins, and the probe reads n/a",
          JSON.stringify(read),
        );
        check(
          !hasClip() && clipRow() === "unneeded",
          'Apply wrote no math-clip block, and the row reads "not needed"',
          `got "${clipRow()}"`,
        );
        shim.setConfig({ chatHistoryFontSizeEm: 1.3 });
        const clipWithBonus = test.reconcileChatStyle(sandbox);
        check(
          !clipWithBonus["math-clip"] && !hasClip(),
          "a bonus reconcile writes none either",
        );
        shim.setConfig({});
        const clipOff = test.reconcileChatStyle(sandbox, coreOff);
        check(
          !clipOff["math-clip"] && !hasClip() && clipRow() === "unneeded",
          'restoring has nothing to remove, and the row still reads "not needed"',
          `got "${clipRow()}"`,
        );
        const clipOn = test.reconcileChatStyle(sandbox, coreOn);
        check(
          !clipOn["math-clip"] && !hasClip() && clipRow() === "unneeded",
          "and Apply again writes nothing",
          `got "${clipRow()}"`,
        );
      }
    }
  },
};
