// The core stylesheet block stores no per-release text: it is written when
// Kilo's own textarea rule still looks the way it assumes and skipped
// otherwise, so what is asserted is the block's shape, the contract with
// the bonus reconcile that shares the file (a core block is carried over
// exactly as found, never applied or dropped on the side), and the status
// rows that make an absent or stale block visible. What the rule does in a
// browser was established in a headless Chromium on a copy of Kilo's layout
// (see the comment above CHAT_SCROLL_RULE in src/blocks/chat-style.ts);
// nothing here can run layout.

const fs = require("fs");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");

module.exports = {
  needs: ["apply"],
  run({ test, sandbox, dist, pristineCss, cssPath, coreOn, coreOff }) {
    console.log("\nchat scroll (core stylesheet patch)");
    if (pristineCss === undefined) {
      check(false, `${test.CHAT_STYLE_FILE} is present in dist/`);
    } else {
      const sizing = test.readPromptSizing(pristineCss);
      check(
        sizing !== undefined,
        "Kilo's textarea sizing rule is readable",
        JSON.stringify(sizing),
      );
      const applied = fs.readFileSync(cssPath, "utf8");
      check(
        countOccurrences(applied, "kilo-code-kb-patch:chat-scroll:begin") ===
          1 &&
          countOccurrences(applied, "kilo-code-kb-patch:chat-scroll:end") === 1,
        "exactly one chat-scroll block",
      );
      check(
        applied.includes(test.CHAT_SCROLL_RULE),
        "the block carries the field-sizing rule",
      );
      check(
        test.CHAT_SCROLL_RULE.startsWith("@supports (field-sizing: content)") &&
          test.CHAT_SCROLL_RULE.includes(".chat-view .prompt-input {") &&
          test.CHAT_SCROLL_RULE.includes("height: auto !important"),
        "the rule is guarded by @supports, scoped to .chat-view, and overrides the inline height",
      );
      check(
        test.chatCssApplied(sandbox, "chat-scroll"),
        "the block reads as applied",
      );

      shim.setConfig({ chatHistoryFontSizeEm: 1.3 });
      const withBonus = test.reconcileChatStyle(sandbox);
      check(
        !withBonus["chat-scroll"] &&
          fs.readFileSync(cssPath, "utf8").includes(test.CHAT_SCROLL_RULE),
        "a bonus reconcile leaves the applied block in place",
      );
      // Presence is judged by the block marker: Kilo's own stylesheet contains
      // the substring "chat-scroll" (`--chat-scrollbar-width`).
      const hasBlock = () =>
        fs
          .readFileSync(cssPath, "utf8")
          .includes("kilo-code-kb-patch:chat-scroll:begin");
      const removed = test.reconcileChatStyle(sandbox, coreOff);
      check(
        removed["chat-scroll"] && !hasBlock(),
        "restoring removes the block",
      );
      shim.setConfig({ chatHistoryFontSizeEm: 1.4 });
      test.reconcileChatStyle(sandbox);
      check(
        !hasBlock(),
        "a bonus reconcile does not apply the block on its own",
      );
      const row = () =>
        test
          .computeStatus(dist)
          .files.find((f) => f.filename === test.CHAT_STYLE_FILE)?.features[0]
          ?.state;
      check(
        row() === "unpatched",
        'an absent block reads "unpatched"',
        `got "${row()}"`,
      );
      check(
        test.computeStatus(dist).verdict === "partially patched",
        "and the verdict counts it",
        `got "${test.computeStatus(dist).verdict}"`,
      );

      // A stale form (an older kb-patch's text) is reported and rewritten
      // rather than kept or duplicated.
      fs.writeFileSync(
        cssPath,
        fs.readFileSync(cssPath, "utf8") +
          "\n/* kilo-code-kb-patch:chat-scroll:begin */\n.stale {}\n/* kilo-code-kb-patch:chat-scroll:end */\n",
        "utf8",
      );
      check(
        row() === "unpatched",
        'a stale block reads "unpatched"',
        `got "${row()}"`,
      );
      const stillStale = test.reconcileChatStyle(sandbox);
      check(
        !stillStale["chat-scroll"] &&
          fs.readFileSync(cssPath, "utf8").includes(".stale {}"),
        "a bonus reconcile leaves a stale block for Apply",
      );
      shim.setConfig({});
      const upgraded = test.reconcileChatStyle(sandbox, coreOn);
      const fresh = fs.readFileSync(cssPath, "utf8");
      check(
        upgraded["chat-scroll"] &&
          !fresh.includes(".stale {}") &&
          countOccurrences(fresh, "kilo-code-kb-patch:chat-scroll:begin") === 1,
        "Apply rewrites a stale block in place, exactly once",
      );
      check(
        row() === "patched",
        'the fresh block reads "patched"',
        `got "${row()}"`,
      );
      check(
        test.computeStatus(dist).verdict === "fully patched",
        "and the verdict is whole again",
        `got "${test.computeStatus(dist).verdict}"`,
      );
    }
  },
};
