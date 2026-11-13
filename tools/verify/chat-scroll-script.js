// The script block is the other half of the same patch: a listener pair
// appended to the bundle, with no per-release text either. Its threshold
// is read out of the build, so what is asserted is the derivation, the
// block's shape and placement, its survival across the bundle's own bonus
// reconciles, the status rows, and the round trip. The block itself has no
// dependency on Kilo's code, only on three class names, so unlike the
// stylesheet rule it can also be run here, against a stand-in DOM.

const fs = require("fs");
const vm = require("vm");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");

module.exports = {
  needs: ["apply"],
  run({ test, pristine, sandbox, dist, scriptPath, pristineJs }) {
    console.log("\nchat scroll (core script patch)");
    if (pristineJs === undefined) {
      check(false, `${test.CHAT_SCRIPT_FILE} is present in dist/`);
    } else {
      const threshold = test.readScrollThreshold(pristineJs);
      check(
        Number.isInteger(threshold),
        "Kilo's chat templates and scroll threshold are readable",
        JSON.stringify({ threshold }),
      );
      const block = test.chatScriptBlock("chat-scroll", pristineJs);
      const scriptOn = () => fs.readFileSync(scriptPath, "utf8");
      const marker = "kilo-code-kb-patch:chat-scroll:begin";
      check(
        countOccurrences(scriptOn(), marker) === 1 &&
          countOccurrences(scriptOn(), "kilo-code-kb-patch:chat-scroll:end") ===
            1,
        "exactly one chat-scroll block",
      );
      // The core blocks sit together at the very end, in CHAT_SCRIPT_BLOCKS
      // order, so the tail of the file is their concatenation.
      const coreTail = () =>
        test.CHAT_SCRIPT_CORE.map((key) =>
          test.chatScriptBlock(key, pristineJs),
        ).join("");
      check(
        block !== "" &&
          coreTail().startsWith(block) &&
          scriptOn().endsWith(coreTail()),
        "the block is appended at the very end of the bundle, ahead of the other core block",
      );
      const body = test.chatScrollScript(threshold);
      check(
        body.includes('addEventListener("beforeinput"') &&
          body.includes('addEventListener("input"') &&
          body.includes("textarea.prompt-input") &&
          body.includes(".chat-view") &&
          body.includes(".message-list") &&
          body.includes(`< ${threshold} ?`),
        "the script names the three class names and this build's threshold",
      );
      check(
        !body.includes("preventDefault") && !body.includes("stopPropagation"),
        "the script prevents and stops nothing",
      );

      // Run it. The stand-in scroller clamps its scrollTop the way a real one
      // does, since that clamp is the whole point.
      const listeners = {};
      const list = {
        scrollHeight: 4000,
        clientHeight: 500,
        top: 3500,
        get scrollTop() {
          return this.top;
        },
        set scrollTop(v) {
          this.top = Math.max(
            0,
            Math.min(v, this.scrollHeight - this.clientHeight),
          );
        },
      };
      class HTMLTextAreaElement {
        constructor(selector, inChatView) {
          this.selector = selector;
          this.inChatView = inChatView;
        }
        matches(s) {
          return s === this.selector;
        }
        closest(s) {
          return s === ".chat-view" && this.inChatView
            ? { querySelector: (q) => (q === ".message-list" ? list : null) }
            : null;
        }
      }
      vm.runInNewContext(body, {
        window: {
          addEventListener: (type, fn, capture) => {
            listeners[type] = { fn, capture: !!capture };
          },
        },
        HTMLTextAreaElement,
      });
      check(
        listeners.beforeinput?.capture === true &&
          listeners.input?.capture === false,
        "the script listens on window: beforeinput in capture, input in bubble",
      );
      // One edit: the snapshot, then the clamp the browser would apply
      // mid-edit, then the input event. Returns the distance left.
      const edit = (target, clampBy) => {
        listeners.beforeinput.fn({ target });
        list.scrollTop -= clampBy;
        listeners.input.fn({ target });
        return list.scrollHeight - list.clientHeight - list.scrollTop;
      };
      const prompt = new HTMLTextAreaElement("textarea.prompt-input", true);
      list.scrollTop = 3500;
      check(
        edit(prompt, 21) === 0,
        "an edit that clamped the history re-pins it",
      );
      list.scrollTop = 3500 - threshold + 1;
      check(
        edit(prompt, 0) === 0,
        "a history within Kilo's threshold counts as at the bottom",
      );
      list.scrollTop = 3500 - threshold - 40;
      const away = list.scrollTop;
      check(
        edit(prompt, 0) === 3500 - away,
        "a history the user scrolled away from is left where it was",
      );
      list.scrollTop = 3500;
      check(
        edit(new HTMLTextAreaElement("textarea.other", true), 21) === 21,
        "an edit in another textarea is ignored",
      );
      list.scrollTop = 3500;
      check(
        edit(new HTMLTextAreaElement("textarea.prompt-input", false), 21) ===
          21,
        "a prompt textarea outside .chat-view is ignored",
      );
      list.scrollTop = 3500;
      check(
        edit({ tagName: "DIV" }, 21) === 21,
        "an edit in a non-textarea is ignored",
      );

      // The bundle's bonuses are splices elsewhere in the file, so switching
      // them on and off must leave the block exactly as it was.
      const jsRow = () =>
        test
          .computeStatus(dist)
          .files.find((f) => f.filename === test.CHAT_SCRIPT_FILE)
          ?.features.find((ft) => ft.label.startsWith("Chat scroll"))?.state;
      check(
        jsRow() === "patched",
        'the block reads "patched" in the bundle\'s rows',
        `got "${jsRow()}"`,
      );
      // The core blocks have to come through a bonus toggle intact. Their
      // position is not part of that: on a build where the math bonus derives,
      // its record block is appended by that write and so lands after them,
      // where an Apply puts it before them. Both orders parse, both read
      // patched, and both restore to pristine (asserted in the zero-leakage and
      // derived-bonuses sections), so the invariant here is that the block is
      // still there and still whole, not where in the tail it sits.
      const coreBlocksWhole = () =>
        test.CHAT_SCRIPT_CORE.every(
          (key) =>
            countOccurrences(
              scriptOn(),
              test.chatScriptBlock(key, pristineJs),
            ) === 1,
        );
      // Every splice the extension lists goes through the toggle, and each
      // one this build can carry has to land, so a splice whose setting is
      // missing from the list below fails here rather than sitting it out.
      const splices = test.DERIVABLE_BONUSES.map((key) => ({
        key,
        marker: test.DERIVED_BONUS_MARKERS[key],
        carried:
          test.shippedBonusVariant(pristineJs, key) !== undefined ||
          test.deriveBonus(key, pristineJs) !== undefined,
      }));
      const reconcileSplices = () => {
        for (const { key } of splices)
          test.reconcileDerivableBonus(sandbox, key);
      };
      const splicesIn = () =>
        splices.every(
          (s) => countOccurrences(scriptOn(), s.marker) === (s.carried ? 1 : 0),
        );
      shim.setConfig({
        addAttachFileButton: true,
        chatMathRendering: true,
        chatRawMarkdownButton: true,
      });
      reconcileSplices();
      check(
        splicesIn() && coreBlocksWhole() && jsRow() === "patched",
        "enabling the bundle bonuses writes each one this build carries and leaves the block in place",
      );
      shim.setConfig({});
      reconcileSplices();
      check(
        splices.every((s) => !scriptOn().includes(s.marker)) &&
          coreBlocksWhole() &&
          jsRow() === "patched",
        "disabling them takes each one out and leaves the block in place too",
      );

      const removed = test.reconcileChatScript(sandbox, false);
      check(
        removed["chat-scroll"] && !scriptOn().includes(marker),
        "restoring removes the block",
      );
      check(
        jsRow() === "unpatched",
        'an absent block reads "unpatched"',
        `got "${jsRow()}"`,
      );
      check(
        test.computeStatus(dist).verdict === "partially patched",
        "and the verdict counts it",
        `got "${test.computeStatus(dist).verdict}"`,
      );

      // A stale form (an older kb-patch's text) is reported and rewritten
      // rather than kept or duplicated.
      fs.writeFileSync(
        scriptPath,
        scriptOn() +
          "\n/* kilo-code-kb-patch:chat-scroll:begin */\n/* stale */\n/* kilo-code-kb-patch:chat-scroll:end */\n",
        "utf8",
      );
      check(
        jsRow() === "unpatched",
        'a stale block reads "unpatched"',
        `got "${jsRow()}"`,
      );
      const upgraded = test.reconcileChatScript(sandbox, true);
      check(
        upgraded["chat-scroll"] &&
          !scriptOn().includes("/* stale */") &&
          countOccurrences(scriptOn(), marker) === 1 &&
          scriptOn().endsWith(coreTail()),
        "Apply rewrites a stale block in place, exactly once",
      );
      check(
        jsRow() === "patched",
        'the fresh block reads "patched"',
        `got "${jsRow()}"`,
      );
      check(
        test.computeStatus(dist).verdict === "fully patched",
        "and the verdict is whole again",
        `got "${test.computeStatus(dist).verdict}"`,
      );
    }
  },
};
