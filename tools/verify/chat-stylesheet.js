// The stylesheet bonuses store no per-release text: the typography block
// reads Kilo's own declarations and re-declares them multiplied, and the
// math block states an absolute em. So what is asserted here is the shape
// of what they emit, not a stored pattern. Three of the assertions are the
// promises the settings make: nothing outside the agent's reply is
// restyled, code blocks keep their own size, and the math size is void
// without the math bonus.

const fs = require("fs");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");

module.exports = {
  needs: ["apply"],
  run({ test, sandbox, pristineCss, cssPath, cssCoreNeeded }) {
    console.log("\nchat stylesheet (opt-in bonuses)");
    if (pristineCss === undefined) {
      check(false, `${test.CHAT_STYLE_FILE} is present in dist/`);
    } else {
      const values = test.readChatStyleValues(pristineCss);
      check(
        values !== undefined,
        "Kilo's own declarations are readable",
        JSON.stringify(values),
      );

      // The scope every typography rule carries, spelled out here so the
      // heading assertions can name a whole rule rather than a fragment.
      const ASSISTANT =
        '[data-component="text-part"] [data-component="markdown"]';

      const ON = {
        addAttachFileButton: true,
        chatMathRendering: true,
        chatRawMarkdownButton: true,
        chatHistoryFontSizeEm: 1.3,
        chatHistoryFontFamily: "Charter, Georgia, serif",
        chatMathFontSizeEm: 1.05,
      };
      shim.setConfig(ON);
      const changed = test.reconcileChatStyle(sandbox);
      check(
        changed.typography && changed.math,
        "enabling appends both blocks and attributes each to its bonus",
      );
      const styled = fs.readFileSync(cssPath, "utf8");
      const typography = test.chatCssRules("typography", pristineCss);
      const math = test.chatCssRules("math", pristineCss);

      check(
        [...typography, ...math].every((r) => styled.includes(r)),
        "every rule the settings ask for is in the file",
      );
      check(
        values !== undefined &&
          styled.includes(`font-size: calc(${values.size} * 1.3)`) &&
          styled.includes(`font-size: calc(${values.table} * 1.3)`),
        "container and tables are each scaled by the multiplier",
      );
      // Headings carry the multiplier through `em` instead of a second calc(),
      // which is the only reason the ladder and the multiplier compose. A
      // heading rule stated in absolute units would freeze the ratio at one
      // multiplier, which is the bug this replaced.
      check(
        test
          .headingRules()
          .every(
            (r) => styled.includes(r) && /font-size: [\d.]+em; }$/.test(r),
          ),
        "the ladder is emitted in em, so it multiplies on top of the text size",
      );
      check(
        styled.includes(
          `${ASSISTANT} h1 { font-size: ${test.HEADING_LADDER.h1}em; }`,
        ) &&
          styled.includes(
            `${ASSISTANT} :is(h2, h3) { font-size: ${test.HEADING_LADDER.h2}em; }`,
          ),
        "levels that share a ratio are grouped, in document order",
      );
      // Every level needs a rule, including the ones left at 1: Kilo pins its
      // headings to its own unscaled base size, so a level with no rule of ours
      // stays behind scaled body text.
      check(
        Object.keys(test.HEADING_LADDER).every((level) =>
          test.headingRules().some((r) => r.includes(level)),
        ),
        "every heading level is covered by a rule",
      );
      check(
        values !== undefined &&
          styled.includes(`${ASSISTANT} pre { font-size: ${values.code}; }`) &&
          !typography.some((r) => r.includes(" pre ") && r.includes("calc(")),
        "code blocks are pinned to Kilo's own size, not scaled",
      );
      // Kilo declares its code-block size twice as well, and as with headings
      // only the unlayered declaration renders. Reading the layered literal
      // held code blocks at 13px whatever the reader's Display setting, so what
      // is read here has to be a token that still follows that setting. A
      // literal here means the anchor is back on the losing declaration, or
      // that Kilo really did hardcode it and the pin needs rethinking.
      check(
        values !== undefined && values.code.includes("var(--"),
        "the code size read follows Kilo's Display setting",
        JSON.stringify(values),
      );
      // Kilo gives inline code and file-path links a monospace family and no
      // size, so they follow the container unless pinned. Without these two
      // rules the setting would scale the `code` spans inside a sentence.
      check(
        values !== undefined &&
          styled.includes(`:not(pre) > code { font-size: ${values.size}; }`) &&
          styled.includes(`a.file-path-link { font-size: ${values.size}; }`),
        "inline code and file-path links are pinned to Kilo's own size",
      );
      check(
        styled.includes("font-family: Charter, Georgia, serif"),
        "the font-family value is emitted verbatim",
      );
      check(
        math.length === 1 && math[0].includes(".katex { font-size: 1.05em; }"),
        "the math size is emitted in em, in the math bonus's own block",
      );
      // The scoping promise: everything the typography block emits must be
      // under the assistant's text-part, which is what keeps the reasoning
      // block, tool output and the user's own messages out of it. And no rule
      // may name .shiki, which is how code blocks keep Kilo's own size.
      check(
        typography.length > 0 &&
          typography.every((r) =>
            r.startsWith('[data-component="text-part"] '),
          ),
        "typography rules are scoped to the agent's reply",
      );
      check(
        [...typography, ...math].every((r) => !r.includes(".shiki")),
        "no rule touches code blocks",
      );
      for (const key of test.CHAT_CSS_BLOCKS) {
        const expected = cssCoreNeeded(key) ? 1 : 0;
        check(
          countOccurrences(styled, `kilo-code-kb-patch:${key}:begin`) ===
            expected &&
            countOccurrences(styled, `kilo-code-kb-patch:${key}:end`) ===
              expected,
          expected === 1
            ? `exactly one ${key} block`
            : `no ${key} block, since this build does without it`,
        );
        check(
          test.chatCssApplied(sandbox, key),
          expected === 1
            ? `${key} block reads as applied`
            : `and ${key} reads as in step, with nothing to write`,
        );
      }
      const reapplied = test.reconcileChatStyle(sandbox);
      check(
        !reapplied.typography && !reapplied.math,
        "re-applying the same settings is a no-op",
      );

      // The math size belongs to the math bonus, so turning that bonus off has
      // to take the size rule with it while leaving typography alone.
      shim.setConfig({ ...ON, chatMathRendering: false });
      const offMath = test.reconcileChatStyle(sandbox);
      const withoutMath = fs.readFileSync(cssPath, "utf8");
      check(
        offMath.math && !offMath.typography,
        "turning math rendering off is attributed to the math bonus alone",
      );
      check(
        !withoutMath.includes(".katex { font-size:") &&
          typography.every((r) => withoutMath.includes(r)),
        "the math size is void without math rendering, typography is untouched",
      );

      // The ladder rides along with either knob, so a reply that is only
      // re-fonted is laddered too, and that path reads Kilo's declarations even
      // though the family itself needs nothing read.
      shim.setConfig({ chatHistoryFontFamily: "Charter" });
      const familyOnly = test.chatCssRules("typography", pristineCss);
      check(
        test.headingRules().every((r) => familyOnly.includes(r)) &&
          !familyOnly.some((r) => r.includes("calc(")),
        "a family-only reply is laddered, with no multiplier anywhere",
      );
      check(
        values !== undefined &&
          familyOnly.includes(
            `${ASSISTANT} :not(pre) > code { font-size: ${values.size}; }`,
          ),
        "and inline code is pinned, which a heading would otherwise enlarge",
      );

      shim.setConfig({});
      check(
        test.chatCssRules("typography", pristineCss).length === 0,
        "both knobs neutral asks for no rules at all",
      );

      // A value that could end the declaration or open a new rule would corrupt
      // the whole stylesheet, so it is dropped rather than written.
      shim.setConfig({
        addAttachFileButton: true,
        chatMathRendering: true,
        chatHistoryFontFamily: "serif; } body { display: none",
      });
      test.reconcileChatStyle(sandbox);
      check(
        !fs.readFileSync(cssPath, "utf8").includes("display: none"),
        "a font-family value with CSS syntax in it is ignored",
      );

      // Rewriting the blocks in place must converge on exactly what a fresh
      // apply produces, so a settings change can never stack two copies.
      shim.setConfig(ON);
      test.reconcileChatStyle(sandbox);
      check(
        fs.readFileSync(cssPath, "utf8") === styled,
        "re-editing the settings converges on a fresh apply",
      );
    }
  },
};
