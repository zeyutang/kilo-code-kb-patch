// A reviewed entry answers where one matches (and the rule agrees with
// it), the build's own bytes supply the button where none does, and a
// build the rule cannot read either is a silent no-op reported as
// "unavailable". Each half of that is asserted, since the last one is what
// keeps an unsupported release from being half-patched.

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");
const { ATTACH_RULE, replaceLiteral } = require("../lib/rules");

// Runs the attach button a patched bundle carries, the same way the
// raw-markdown section runs the toggle's handler: the inserted text itself is
// evaluated against lazy stubs, bound by the names the rule read off this
// build, so what is asserted is the button that ships rather than a copy of
// it. The edit is the button followed by the anchor it was inserted before,
// and the anchor is cut mid-expression, so only the button half is evaluated.
//
// On a toolbar that folds (7.8.9 on) the button is Kilo's action wrapper with
// the tooltip inserted into it, and the wrapper goes in before the node the
// indexing button's insert names, so both inserts are checked, and so is the
// node: one that is not the toolbar's would throw at render.
//
// Returns what one click did for each draft, or an error string.
function clickAttachButton(edit, symbols) {
  if (!edit.patched.endsWith(edit.original))
    return "the edit is not an insertion";
  const button = edit.patched.slice(0, -edit.original.length).replace(/,$/, "");
  const calls = [];
  const textarea = {
    value: "",
    selectionStart: 0,
    focus: () => calls.push("focus"),
  };
  const controller = {
    selectMention: (...args) => calls.push({ selectMention: args }),
  };
  const setter = () => {};
  const sync = () => {};
  const inserted = [];
  const wrappers = [];
  const context = {
    [symbols.insert]: (parent, node, marker) =>
      inserted.push({ parent, node, marker }),
    [symbols.create]: (component, props) => ({ component, props }),
    [symbols.tooltip]: "tooltip",
    [symbols.ghost]: "icon-button",
    [symbols.container]: "toolbar",
    [symbols.controller]: controller,
    [symbols.textarea]: textarea,
    [symbols.setter]: setter,
    [symbols.sync]: sync,
    document: {
      execCommand: (command, ui, text) => calls.push({ command, text }),
    },
  };
  const wrapped = symbols.wrapper !== undefined;
  if (wrapped) {
    context[symbols.wrapper] = () => {
      const node = { wrapper: wrappers.length };
      wrappers.push(node);
      return node;
    };
    context[symbols.marker] = "the indexing button's node";
  }
  try {
    vm.runInNewContext(button, context);
  } catch (e) {
    return `the button text does not run: ${e.message}`;
  }
  const top = inserted.filter((i) => i.parent === "toolbar");
  if (top.length !== 1 || inserted.length !== (wrapped ? 2 : 1)) {
    return `expected one insert into the toolbar, got ${top.length} of ${inserted.length}`;
  }
  // A toolbar that appends reads `null` there, a keyword the stub cannot bind.
  const marker =
    wrapped && symbols.marker !== "null" ? context[symbols.marker] : null;
  if (top[0].marker !== marker) {
    return `inserted before ${String(top[0].marker)}, not ${String(marker)}`;
  }
  let tip = top[0].node;
  if (wrapped) {
    if (wrappers.length !== 1 || tip !== wrappers[0]) {
      return "the toolbar is not given Kilo's action wrapper";
    }
    const inner = inserted.filter((i) => i.parent === wrappers[0]);
    if (inner.length !== 1) return "the wrapper does not hold the tooltip";
    tip = inner[0].node;
  }
  const iconButton = tip?.props?.children;
  if (tip?.component !== "tooltip" || iconButton?.component !== "icon-button") {
    return "the button is not the toolbar's tooltip-wrapped icon-button";
  }
  const results = [];
  for (const draft of ["", "hello", "hello "]) {
    calls.length = 0;
    textarea.value = draft;
    textarea.selectionStart = draft.length;
    iconButton.props.onClick();
    results.push({ draft, calls: [...calls] });
  }
  return {
    label: tip.props.value,
    ariaLabel: iconButton.props["aria-label"],
    icon: iconButton.props.icon,
    results,
    controller,
    textarea,
    setter,
    sync,
  };
}

module.exports = {
  needs: ["apply"],
  run({ test, pristine, sandbox, dist }) {
    console.log("\nattach-file button (opt-in bonus)");
    shim.setConfig({ addAttachFileButton: true });
    const webview = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
    const attachRow = () => test.computeBonusStatus(sandbox)[0]?.state;
    const shippedAttach = test.matchingAttachFileButton(webview);
    const derivedAttach = test.deriveBonus("attach-button", webview);
    const attachEdit = shippedAttach ?? derivedAttach;
    if (shippedAttach) {
      check(
        test.reconcileAttachFileButton(sandbox),
        "enabling adds the button",
      );
    } else {
      check(
        test.reconcileAttachFileButton(sandbox) === (attachEdit !== undefined),
        attachEdit
          ? "no reviewed entry: enabling applies the derived button"
          : "no reviewed entry and nothing to derive: enabling changes nothing",
      );
    }
    const attachWanted = attachEdit ? "on" : "unavailable";
    check(
      attachRow() === attachWanted,
      `bonus reports "${attachWanted}"`,
      `got "${attachRow()}"`,
    );
    if (attachEdit) {
      check(
        countOccurrences(
          fs.readFileSync(path.join(dist, "webview.js"), "utf8"),
          'selectMention({type:"file-picker"}',
        ) === 1,
        "exactly one button",
      );
      // Click the button that landed. The names come from the rule, which is
      // also how the derived path binds them, so a reviewed entry naming
      // anything else fails here as well as in retarget.
      const symbols = ATTACH_RULE.derive(webview).symbols;
      const click =
        symbols && !symbols.icon
          ? clickAttachButton(attachEdit, symbols)
          : undefined;
      if (click === undefined) {
        // The pre-7.6.0 text button takes its glyph from a sprite component
        // passed as a child; its click is the same code, and that form ships
        // only as reviewed entries.
        check(
          symbols !== undefined,
          "the button's symbols are derivable (text-button form, not run)",
        );
      } else if (typeof click === "string") {
        check(false, "the button runs", click);
      } else {
        check(
          click.label === "Attach file" && click.ariaLabel === "Attach file",
          'its tooltip and aria-label read "Attach file"',
          `${JSON.stringify(click.label)} / ${JSON.stringify(click.ariaLabel)}`,
        );
        const [empty, word, spaced] = click.results;
        const inserts = (r) =>
          r.calls.filter((c) => c.command === "insertText").map((c) => c.text);
        check(
          inserts(empty).join() === "@" &&
            inserts(word).join() === " @" &&
            inserts(spaced).join() === "@",
          'a click types "@", with a space first only after a word',
          JSON.stringify(click.results.map(inserts)),
        );
        const opened = click.results.every((r) => {
          const call = r.calls.find((c) => c.selectMention)?.selectMention;
          return (
            r.calls[0] === "focus" &&
            call?.[0]?.type === "file-picker" &&
            call[1] === click.textarea &&
            call[2] === click.setter &&
            call[3] === click.sync
          );
        });
        check(
          opened,
          "then opens the file picker through Kilo's own mention controller, with its textarea, setter and sync",
        );
      }
    }

    // Upgrading kb-patch can change a variant's patched text while the user's
    // bundle still carries the previous form. Since every patched string ends
    // with its own original, a naive apply would leave the old button in place
    // and inject a second one, so the old form has to be rewritten instead.
    const attachVariant = test.matchingAttachFileButton(webview);
    if (attachVariant?.previous?.length) {
      console.log(
        "\nattach-file button upgrade (older form already installed)",
      );
      const migrate = fs.mkdtempSync(
        path.join(os.tmpdir(), "kb-patch-migrate-"),
      );
      try {
        fs.mkdirSync(path.join(migrate, "dist"));
        const target = path.join(migrate, "dist", "webview.js");
        const clean = pristine["webview.js"];
        const fresh = replaceLiteral(
          clean,
          attachVariant.original,
          attachVariant.patched,
        );
        for (const old of attachVariant.previous) {
          fs.writeFileSync(
            target,
            replaceLiteral(clean, attachVariant.original, old),
            "utf8",
          );
          shim.setConfig({ addAttachFileButton: true });
          test.reconcileAttachFileButton(migrate);
          const after = fs.readFileSync(target, "utf8");
          // Count buttons by the injected onClick's selectMention call, which
          // every variant contains exactly once regardless of how it captions
          // itself (7.5.4+ variants no longer call t("prompt.action.attachFile")).
          const buttons = countOccurrences(
            after,
            'selectMention({type:"file-picker"}',
          );
          check(
            buttons === 1,
            "older form yields exactly one button",
            `got ${buttons}`,
          );
          check(
            after === fresh,
            "older form upgrades to exactly a fresh apply",
          );

          fs.writeFileSync(
            target,
            replaceLiteral(clean, attachVariant.original, old),
            "utf8",
          );
          shim.setConfig({ addAttachFileButton: false });
          test.reconcileAttachFileButton(migrate);
          check(
            fs.readFileSync(target, "utf8") === clean,
            "older form can be removed back to pristine",
          );
        }
      } finally {
        fs.rmSync(migrate, { recursive: true, force: true });
      }
    }
  },
};
