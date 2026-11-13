// The raw-markdown toggle has the same contract as the other two splices:
// a reviewed entry where one answers, the build's own bytes where none
// does, and a silent no-op where neither can. What is particular to it is
// that the patched text *begins* with the original (the splice appends
// after Kilo's copy button), so a patched bundle shows both texts and only
// variantEdit's already-patched-before-pristine ordering keeps enabling
// from stacking a second button. That is what the re-enable check below is
// for, and the count assertions are what would catch it if the ordering
// ever changed.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");
const { RAW_MARKDOWN_RULE } = require("../lib/rules");

// A stand-in for the few DOM operations the raw-markdown toggle performs, in
// the spirit of the chat-scroll script section's scroller: enough of an
// element to run the shipped handler against, and no more. Selectors are
// supported in the one form the toggle uses, an optional tag name followed by
// `[attr]` or `[attr=value]`, so a variant that selected some other way would
// fail here rather than pass on a stub that accepts anything.
class StubElement {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = undefined;
    this.textContent = "";
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
  getAttribute(name) {
    return name in this.attrs ? this.attrs[name] : null;
  }
  removeAttribute(name) {
    delete this.attrs[name];
  }
  hasAttribute(name) {
    return name in this.attrs;
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = undefined;
  }
  matches(selector) {
    const m = /^([a-z]*)\[([a-z-]+)(?:=([^\]]+))?\]$/.exec(selector);
    if (!m) throw new Error(`stub DOM cannot match ${selector}`);
    if (m[1] && m[1] !== this.tag) return false;
    if (!(m[2] in this.attrs)) return false;
    return m[3] === undefined || this.attrs[m[2]] === m[3];
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  closest(selector) {
    for (let node = this; node; node = node.parent) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
}

module.exports = {
  needs: ["apply"],
  run({ test, sandbox, dist, pristineCss }) {
    console.log("\nraw-markdown toggle (opt-in bonus)");
    shim.setConfig({ chatRawMarkdownButton: true });
    const beforeRaw = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
    const rawVariant =
      test.matchingRawMarkdownToggle(beforeRaw) ??
      test.deriveBonus("raw-markdown", beforeRaw);
    const rawReviewed = test.matchingRawMarkdownToggle(beforeRaw) !== undefined;
    const rawRow = () =>
      test
        .computeBonusStatus(sandbox)
        .find((b) => b.label.includes("markdown source"))?.state;
    if (rawVariant) {
      check(
        countOccurrences(beforeRaw, rawVariant.original) === 1,
        "the matched copy-button insert occurs exactly once",
      );
      check(
        test.reconcileRawMarkdownToggle(sandbox),
        rawReviewed
          ? "enabling adds the toggle"
          : "no reviewed entry: enabling applies the derived toggle",
      );
      const afterRaw = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
      check(
        countOccurrences(afterRaw, '"data-slot":"kbp-raw-markdown-toggle"') ===
          1,
        "exactly one toggle button",
      );
      // Kilo's own copy button is the anchor, so the splice would be visible as
      // a lost or duplicated copy button before anything else.
      check(
        countOccurrences(afterRaw, 'r.t("ui.message.copyResponse")') ===
          countOccurrences(beforeRaw, 'r.t("ui.message.copyResponse")'),
        "Kilo's own copy button survives the splice unchanged",
      );
      // The one symbol this rule takes from outside its matched span. A splice
      // that lost it would still parse and still show a button, and the button
      // would show an empty block.
      check(
        /_pre\.textContent=[A-Za-z_$][A-Za-z0-9_$]*\(\)/.test(
          rawVariant.patched,
        ),
        "the toggle reads the part's raw text through the accessor it derived",
      );
      // The stylesheet half has to arrive with it, or the raw block renders
      // under the reply instead of replacing it.
      const rawCss = test.chatCssRules("raw-markdown", pristineCss ?? "");
      check(
        rawCss.length === test.RAW_MARKDOWN_RULES.length &&
          rawCss.some((r) => r.includes("display: none")),
        "the stylesheet block hides the rendered reply",
      );
      check(
        rawCss.every(
          (r) =>
            r.startsWith('[data-component="text-part"]') ||
            r.startsWith('[data-slot="text-part-body"]'),
        ),
        "every raw-markdown rule is scoped to a text part",
      );
      check(
        rawCss.every((r) => !r.includes(".shiki")),
        "no raw-markdown rule touches Kilo's code blocks",
      );
      // Run the shipped toggle. Evaluating the patched text itself (rather
      // than a copy of the handler written out here) is what makes this a
      // statement about what ships: the stubs are lazy, so Kilo's own copy
      // button goes unevaluated, and the second insert yields the real
      // onClick. The symbols come from the rule, which is also what proves
      // the shipped bytes and the rule agree on what they name.
      const rawDerived = RAW_MARKDOWN_RULE.derive(beforeRaw);
      const symbols = rawDerived.symbols;
      if (!check(symbols !== undefined, "the toggle's symbols are derivable")) {
        // nothing to run against
      } else {
        const inserted = [];
        const part = new StubElement("div", { "data-component": "text-part" });
        const body = part.appendChild(
          new StubElement("div", { "data-slot": "text-part-body" }),
        );
        const rendered = body.appendChild(
          new StubElement("div", { "data-component": "markdown" }),
        );
        const source = "## Heading\n\nprose with `code`\n";
        const context = {
          [symbols.insert]: (parent, node) => inserted.push(node),
          [symbols.create]: (component, props) => ({ component, props }),
          [symbols.tooltip]: "tooltip",
          [symbols.button]: "icon-button",
          [symbols.container]: "footer",
          [symbols.copy]: () => {},
          [symbols.raw]: () => source,
          document: {
            createElement: (tag) => new StubElement(tag),
          },
        };
        vm.runInNewContext(rawDerived.patched, context);
        check(
          inserted.length === 2,
          "the patched text inserts Kilo's copy button and one more",
          `inserted ${inserted.length}`,
        );
        const props = inserted[1]?.props?.children?.props;
        check(
          typeof props?.onClick === "function" &&
            props["data-slot"] === "kbp-raw-markdown-toggle",
          "the added insert is the slotted toggle button",
        );
        const btn = new StubElement("button", {
          "data-slot": "kbp-raw-markdown-toggle",
          "aria-pressed": "false",
        });
        // The button sits in the footer under the same text part, which is how
        // the handler finds its way from the click to the body.
        part
          .appendChild(
            new StubElement("div", { "data-slot": "assistant-copy-wrapper" }),
          )
          .appendChild(btn);
        props.onClick({ currentTarget: btn });
        const raw = () => body.querySelector("pre[data-slot=kbp-raw-markdown]");
        check(
          raw()?.textContent === source,
          "one click appends the part's raw text in a pre",
          JSON.stringify(raw()?.textContent),
        );
        check(
          part.hasAttribute("data-kbp-raw-markdown") &&
            btn.getAttribute("aria-pressed") === "true",
          "and marks the part and the button, which is what the stylesheet reads",
        );
        check(
          body.children.includes(rendered),
          "the rendered markdown is left in the tree for the stylesheet to hide",
        );
        props.onClick({ currentTarget: btn });
        check(
          raw() === null &&
            !part.hasAttribute("data-kbp-raw-markdown") &&
            btn.getAttribute("aria-pressed") === "false" &&
            body.children.length === 1,
          "a second click removes all of it, leaving the body as it was",
        );

        check(
          test.reconcileRawMarkdownToggle(sandbox) === false,
          "re-enabling is a no-op",
        );
        check(
          countOccurrences(
            fs.readFileSync(path.join(dist, "webview.js"), "utf8"),
            '"data-slot":"kbp-raw-markdown-toggle"',
          ) === 1,
          "and adds no second button",
        );
        shim.setConfig({ chatRawMarkdownButton: false });
        check(
          test.reconcileRawMarkdownToggle(sandbox) &&
            fs.readFileSync(path.join(dist, "webview.js"), "utf8") ===
              beforeRaw,
          "turning it off restores the bundle byte-for-byte",
        );
        // Left on for the rest of the run, as the other two splices are, so the
        // validity section's parse check sees a bundle carrying all three.
        shim.setConfig({ chatRawMarkdownButton: true });
        check(
          test.reconcileRawMarkdownToggle(sandbox),
          "and switching it back on splices again",
        );
      }
    } else {
      check(
        test.reconcileRawMarkdownToggle(sandbox) === false,
        "no reviewed entry and nothing to derive: enabling changes nothing",
      );
      check(
        rawRow() === "unavailable",
        'bonus reports "unavailable"',
        `got "${rawRow()}"`,
      );
    }
  },
};
