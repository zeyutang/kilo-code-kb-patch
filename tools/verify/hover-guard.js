// The hover guard is the bundle's second core block: listeners appended
// with no per-release text, gated on the two templates the chat-scroll
// script reaches the textarea through. What is asserted is the gate, the
// block's shape and its place after the chat-scroll block, the status rows
// and the round trip, and, since the script depends on nothing of Kilo's,
// what it does when driven with the event sequences the engine produces
// (measured in a headless Chromium; see the comment above
// HOVER_GUARD_ANCHORS in src/blocks/chat-script.ts). Pointer events keep
// fractional coordinates and mouse events truncate them, which the
// sequences below reproduce.

const fs = require("fs");
const vm = require("vm");
const { check } = require("../lib/cli");
const { countOccurrences } = require("../lib/bundle");

module.exports = {
  needs: ["apply"],
  run({ test, sandbox, dist, scriptPath, pristineJs }) {
    console.log("\nhover guard (core script patch)");
    if (pristineJs === undefined) {
      check(false, `${test.CHAT_SCRIPT_FILE} is present in dist/`);
    } else {
      check(
        test.hoverGuardAnchorsPresent(pristineJs),
        "Kilo's chat templates are present exactly once",
      );
      const block = test.chatScriptBlock("hover-guard", pristineJs);
      const scrollBlock = test.chatScriptBlock("chat-scroll", pristineJs);
      const scriptOn = () => fs.readFileSync(scriptPath, "utf8");
      const marker = "kilo-code-kb-patch:hover-guard:begin";
      check(
        countOccurrences(scriptOn(), marker) === 1 &&
          countOccurrences(scriptOn(), "kilo-code-kb-patch:hover-guard:end") ===
            1,
        "exactly one hover-guard block",
      );
      check(
        block !== "" && scriptOn().endsWith(scrollBlock + block),
        "the block follows the chat-scroll block at the very end of the bundle",
      );
      const body = test.hoverGuardScript();
      check(
        body.includes("textarea.prompt-input") && body.includes(".chat-view"),
        "the script names the two class names",
      );
      check(
        !body.includes("preventDefault") &&
          !body.includes(".stopPropagation") &&
          countOccurrences(body, "stopImmediatePropagation") === 1,
        "the script prevents nothing and stops only immediate propagation, in one place",
      );

      // Run it against the sequences the engine produces.
      const listeners = {};
      class HTMLTextAreaElement {
        constructor(selector, inChatView) {
          this.selector = selector;
          this.inChatView = inChatView;
        }
        matches(s) {
          return s === this.selector;
        }
        closest(s) {
          return s === ".chat-view" && this.inChatView ? {} : null;
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
      const kinds = [
        "keydown",
        "pointerover",
        "pointerenter",
        "mouseover",
        "mouseenter",
        "pointermove",
        "mousemove",
        "pointerout",
        "pointerleave",
        "mouseout",
        "mouseleave",
        "pointerdown",
        "mousedown",
        "pointerup",
        "mouseup",
      ];
      check(
        kinds.every((k) => listeners[k]?.capture === true) &&
          Object.keys(listeners).length === kinds.length,
        "the script listens on window in the capture phase, for the key and the mouse and pointer events only",
      );
      const prompt = new HTMLTextAreaElement("textarea.prompt-input", true);
      // Dispatch one event; true when the script stopped it.
      const fire = (type, props) => {
        let stopped = false;
        listeners[type].fn({
          type,
          isTrusted: true,
          stopImmediatePropagation: () => {
            stopped = true;
          },
          ...props,
        });
        return stopped;
      };
      const at = (x, y) => ({ screenX: x, screenY: y });
      const mouseAt = (x, y) => at(Math.trunc(x), Math.trunc(y));
      // A real move that crosses into an element: enter events first, in each
      // family, then the move events.
      const move = (x, y) => ({
        pointerover: fire("pointerover", at(x, y)),
        mouseover: fire("mouseover", mouseAt(x, y)),
        pointermove: fire("pointermove", at(x, y)),
        mousemove: fire("mousemove", mouseAt(x, y)),
      });
      // A layout change under the still pointer: what the engine synthesizes,
      // at the pointer's old coordinates and with no move event.
      const relayout = (x, y) => ({
        pointerout: fire("pointerout", at(x, y)),
        pointerover: fire("pointerover", at(x, y)),
        pointerenter: fire("pointerenter", at(x, y)),
        mouseout: fire("mouseout", mouseAt(x, y)),
        mouseover: fire("mouseover", mouseAt(x, y)),
        mouseenter: fire("mouseenter", mouseAt(x, y)),
      });
      const key = (props) =>
        fire("keydown", { key: "a", metaKey: false, target: prompt, ...props });
      const stoppedEnters = (r) =>
        r.pointerover && r.pointerenter && r.mouseover && r.mouseenter;
      const passedLeaves = (r) => !r.pointerout && !r.mouseout;
      const none = (r) => Object.values(r).every((v) => !v);

      check(
        none(move(165.5, 467.25)),
        "the pointer arrives: a real move passes",
      );
      check(
        none(relayout(165.5, 467.25)),
        "with the cursor visible, a layout change under the pointer passes",
      );
      key({});
      let r = relayout(165.5, 467.25);
      check(
        stoppedEnters(r) && passedLeaves(r),
        "after a key down in the chat textarea, the enter events are stopped and the out events pass",
      );
      check(
        stoppedEnters(relayout(165.5, 467.25)),
        "and so are the next layout change's",
      );
      check(
        none(move(200.5, 300)),
        "a real move's own enter events pass, new coordinates first",
      );
      check(
        none(relayout(200.5, 300)),
        "and the cursor counts as visible again",
      );
      key({});
      check(
        stoppedEnters(relayout(200.5, 300)),
        "the next key down hides it again",
      );
      fire("pointermove", at(201.5, 300));
      check(none(relayout(201.5, 300)), "a move event alone brings it back");
      key({});
      fire("mousemove", mouseAt(202.5, 300));
      check(none(relayout(202.5, 300)), "seen by either event family");

      key({ metaKey: true });
      check(none(relayout(202.5, 300)), "a Command chord does not hide it");
      key({ key: "Shift" });
      check(none(relayout(202.5, 300)), "nor does a bare modifier");
      key({ isTrusted: false });
      check(none(relayout(202.5, 300)), "nor a script-dispatched key event");
      key({ target: new HTMLTextAreaElement("textarea.other", true) });
      check(none(relayout(202.5, 300)), "nor a key in another textarea");
      key({ target: new HTMLTextAreaElement("textarea.prompt-input", false) });
      check(
        none(relayout(202.5, 300)),
        "nor in a prompt textarea outside .chat-view",
      );
      key({ target: { tagName: "DIV" } });
      check(none(relayout(202.5, 300)), "nor in a non-textarea");
      key({ ctrlKey: true });
      check(
        stoppedEnters(relayout(202.5, 300)),
        "a Control chord does hide it, as on the platform",
      );
      check(
        !fire("mouseover", { isTrusted: false, ...mouseAt(999, 999) }),
        "a script-dispatched enter event is never stopped",
      );
      check(
        stoppedEnters(relayout(202.5, 300)),
        "and does not count as movement",
      );
      fire("pointerdown", at(202.5, 300));
      fire("mousedown", mouseAt(202.5, 300));
      fire("pointerup", at(202.5, 300));
      fire("mouseup", mouseAt(202.5, 300));
      check(
        stoppedEnters(relayout(202.5, 300)),
        "a click without movement keeps it hidden, as on the platform",
      );
      check(none(move(202.5, 301)), "a move of one pixel brings it back");

      // The round trip, the way the chat-scroll block's is proven.
      const hgRow = () =>
        test
          .computeStatus(dist)
          .files.find((f) => f.filename === test.CHAT_SCRIPT_FILE)
          ?.features.find((ft) => ft.label.startsWith("Hover guard"))?.state;
      check(
        hgRow() === "patched",
        'the block reads "patched" in the bundle\'s rows',
        `got "${hgRow()}"`,
      );
      const removed = test.reconcileChatScript(sandbox, false);
      check(
        removed["hover-guard"] && !scriptOn().includes(marker),
        "restoring removes the block",
      );
      check(
        hgRow() === "unpatched",
        'an absent block reads "unpatched"',
        `got "${hgRow()}"`,
      );
      fs.writeFileSync(
        scriptPath,
        scriptOn() +
          "\n/* kilo-code-kb-patch:hover-guard:begin */\n/* stale */\n/* kilo-code-kb-patch:hover-guard:end */\n",
        "utf8",
      );
      check(
        hgRow() === "unpatched",
        'a stale block reads "unpatched"',
        `got "${hgRow()}"`,
      );
      const upgraded = test.reconcileChatScript(sandbox, true);
      check(
        upgraded["hover-guard"] &&
          !scriptOn().includes("/* stale */") &&
          countOccurrences(scriptOn(), marker) === 1 &&
          scriptOn().endsWith(scrollBlock + block),
        "Apply rewrites a stale block in place, exactly once, after the chat-scroll block",
      );
      check(
        hgRow() === "patched",
        'the fresh block reads "patched"',
        `got "${hgRow()}"`,
      );
      check(
        test.computeStatus(dist).verdict === "fully patched",
        "and the verdict is whole again",
        `got "${test.computeStatus(dist).verdict}"`,
      );
    }
  },
};
