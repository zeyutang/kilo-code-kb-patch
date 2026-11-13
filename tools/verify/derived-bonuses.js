// Every bundle splice a build's own bytes can supply (DERIVABLE_BONUSES),
// so the case worth proving is the one no reviewed entry answers: a future
// Kilo that re-minified only these sites. The entry that answers for this
// build is withheld to make it look like that one, and what the derivation
// writes is then held against the bytes that entry would have written.
// A separate copy of the bundle per bonus, because everything here has to
// start from pristine.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { check } = require("../lib/cli");
const { shim } = require("../lib/load");
const { countOccurrences } = require("../lib/bundle");
const { replaceLiteral } = require("../lib/rules");

module.exports = {
  needs: [],
  run({ test, pristine, sandbox, pristineJs }) {
    const DERIVED_SPECS = {
      "attach-button": {
        setting: "addAttachFileButton",
        row: "Prompt toolbar",
        injected: (js) =>
          countOccurrences(js, 'selectMention({type:"file-picker"}') === 1,
        kilo: (js) =>
          countOccurrences(js, ".status().message||") ===
          countOccurrences(pristineJs, ".status().message||"),
        kiloLabel: "Kilo's own indexing button survives the splice",
        // The same edit as a kb-patch that captioned the button differently
        // would have written it.
        restyle: (patched) =>
          patched.replace(/"Attach file"/g, '"Attach a file"'),
        // An entry whose button calls some other controller, as one reviewed
        // for a build that shares this toolbar would (7.7.6 and 7.7.9).
        impostor: (patched) =>
          patched.replace(
            /[A-Za-z_$][\w$]*\.selectMention\(\{type:"file-picker"\}/,
            'kbpImpostor.selectMention({type:"file-picker"}',
          ),
      },
      "math-rendering": {
        setting: "chatMathRendering",
        row: "math",
        injected: (js) =>
          countOccurrences(js, 'name:"kbpKatexInlineDollar"') === 1 &&
          countOccurrences(js, 'name:"kbpKatexBlockBracket"') === 1 &&
          countOccurrences(js, 'name:"kbpKatexInlineBracket"') === 1,
        kilo: (js) =>
          js.includes('{name:"doubleKatexBlock",level:"block"') &&
          js.includes('{name:"doubleKatexInline",level:"inline"'),
        kiloLabel: "Kilo's own $$ extensions survive the splice",
      },
      "raw-markdown": {
        setting: "chatRawMarkdownButton",
        row: "markdown source",
        injected: (js) =>
          countOccurrences(js, '"data-slot":"kbp-raw-markdown-toggle"') === 1,
        kilo: (js) =>
          countOccurrences(js, '"ui.message.copyResponse"') ===
          countOccurrences(pristineJs, '"ui.message.copyResponse"'),
        kiloLabel: "Kilo's own copy button survives the splice",
        restyle: (patched) =>
          patched.replace(/"Markdown source"/g, '"Markdown"'),
        impostor: (patched) =>
          patched.replace(
            /_pre\.textContent=[A-Za-z_$][\w$]*\(\)/,
            "_pre.textContent=kbpImpostor()",
          ),
      },
    };
    for (const key of test.DERIVABLE_BONUSES) {
      console.log(`\n${key} derived (the release that need not happen)`);
      const spec = DERIVED_SPECS[key];
      if (!check(spec !== undefined, "the harness knows this bonus")) continue;
      const reconcile = (dir, record) =>
        test.reconcileDerivableBonus(dir, key, record);
      const list = test.BONUS_VARIANTS[key];
      const kept = [...list];
      const shipped = test.shippedBonusVariant(pristineJs, key);
      const withhold = () =>
        list.splice(0, list.length, ...kept.filter((v) => v !== shipped));
      const reinstate = () => list.splice(0, list.length, ...kept);

      const box = path.join(sandbox, `derived-${key}`);
      const boxDist = path.join(box, "dist");
      fs.mkdirSync(boxDist, { recursive: true });
      const reset = (js) => {
        for (const name of [test.CHAT_SCRIPT_FILE, test.CHAT_STYLE_FILE]) {
          if (pristine[name] !== undefined) {
            fs.writeFileSync(path.join(boxDist, name), pristine[name]);
          }
        }
        if (js !== undefined) {
          fs.writeFileSync(path.join(boxDist, test.CHAT_SCRIPT_FILE), js);
        }
      };
      reset();
      const js = () =>
        fs.readFileSync(path.join(boxDist, test.CHAT_SCRIPT_FILE), "utf8");
      const row = () =>
        test.computeBonusStatus(box).find((b) => b.label.includes(spec.row))
          ?.state;
      const recordNow = () => test.readDerivedRecordAt(boxDist);
      const entry = () => recordNow().find((p) => p.feature === key);

      withhold();
      shim.setConfig({ [spec.setting]: true });
      try {
        check(
          test.shippedBonusVariant(js(), key) === undefined,
          "with its entry withheld, no reviewed entry answers for this build",
        );
        const derived = test.deriveBonus(key, js());
        if (derived === undefined) {
          // Refused at apply. That is only acceptable where a reviewed entry
          // covers the build, so that the setting still does something there:
          // the attach button's pre-7.6.0 text-button form is the one case.
          const admission = test.admissibility(test.BONUS_RULES[key], js());
          check(
            shipped !== undefined,
            `refused at apply (${admission.refused ?? "already patched"}), and a reviewed entry covers this build`,
          );
          continue;
        }
        check(true, "the splice derives from the build");
        // Only where this release reviewed an entry is there something to
        // hold the derivation against. Where there is, they must agree.
        if (shipped !== undefined) {
          check(
            derived.original === shipped.original &&
              derived.patched === shipped.patched,
            "byte-identical to the entry this release reviewed and ships",
          );
        }
        check(reconcile(box), "enabling applies the derived splice");
        const after = js();
        check(spec.injected(after), "exactly one copy of the added code");
        check(spec.kilo(after), spec.kiloLabel);
        try {
          new vm.Script(after, { filename: test.CHAT_SCRIPT_FILE });
          check(true, "the patched bundle parses");
        } catch (e) {
          check(false, "the patched bundle parses", String(e.message));
        }
        // Recorded, because nothing shipped can name this edit: without the
        // record Restore reverts nothing and the next launch derives again.
        check(
          entry() !== undefined &&
            entry().original === derived.original &&
            entry().patched === derived.patched,
          "the bundle records the derivation",
        );
        check(
          test
            .recordedFor(recordNow(), test.CHAT_SCRIPT_FILE, after)
            .every((p) => p.feature !== key),
          "and keeps it out of the core patch set, which applies unconditionally",
        );
        // Apply rewrites the whole record, and the reconciler that owns this
        // entry runs outside it, so the entry has to survive that write or
        // the edit is left on disk with nothing naming it.
        check(
          test
            .bonusDerivationsToKeep(recordNow(), boxDist)
            .some((p) => p.feature === key),
          "Apply carries the entry across its rewrite of the record",
        );
        // A record written by a newer kb-patch names bonuses this build has
        // never heard of, which a downgrade is the ordinary way to meet.
        // Those are carried over too: dropping one would leave its edit on
        // disk with nothing able to name it, the one state Restore cannot
        // undo.
        check(
          test.bonusDerivationsToKeep(
            [{ ...derived, feature: "a-bonus-from-a-later-release" }],
            boxDist,
          ).length === 1,
          "and carries over an entry for a bonus it does not know",
        );
        // Until a release ships the entry, which is the retarget: the entry
        // is then redundant and goes, the same convergence patchSetFor
        // applies to a core derivation. Only checkable where this release
        // does ship one.
        if (shipped !== undefined) {
          reinstate();
          check(
            test.bonusDerivationsToKeep(recordNow(), boxDist).length === 0,
            "and retires it once a reviewed entry describes the same edit",
          );
          withhold();
        }
        test.reconcileChatStyle(box);
        check(
          row() === "on",
          'the bonus reports "on" rather than "unavailable"',
          `got "${row()}"`,
        );
        check(reconcile(box) === false, "re-enabling is a no-op");
        // A second derivation against the patched bundle must find nothing:
        // the math extensions end in the bytes their rule anchors on, and the
        // two buttons keep their anchor beside the insertion.
        check(
          test.deriveBonus(key, after) === undefined,
          "a second derivation against the patched bundle finds nothing",
        );
        // Restore's ordering: the core files are rewritten first, taking the
        // record block with them, so the reconcile has to be handed the
        // record that was read before that write.
        fs.writeFileSync(
          path.join(boxDist, test.CHAT_SCRIPT_FILE),
          test.stripChatScript(after),
        );
        check(
          recordNow().length === 0,
          "with the block gone the file names no derivation",
        );
        shim.setConfig({ [spec.setting]: false });
        check(
          reconcile(box, [derived]) && js() === pristineJs,
          "and the passed-in record still reverses the edit, byte for byte",
        );
        // Then the ordinary path: apply again, turn it off with the record
        // where it lives, and the entry goes with the edit.
        shim.setConfig({ [spec.setting]: true });
        reconcile(box);
        shim.setConfig({ [spec.setting]: false });
        check(
          reconcile(box) && entry() === undefined,
          "turning it off removes the edit and its record entry",
        );
        check(js() === pristineJs, "leaving the bundle as Kilo shipped it");

        // A reviewed entry is checked against the rule for the two bonuses
        // whose anchor does not hold every name their edit writes, so an
        // entry that names some other build's closure locals is declined
        // rather than applied here. What lands instead is the rule's edit.
        if (spec.impostor) {
          const impostor = {
            original: derived.original,
            patched: spec.impostor(derived.patched),
          };
          if (
            check(
              impostor.patched !== derived.patched,
              "an impostor entry can be built for this build",
            )
          ) {
            list.splice(0, list.length, impostor, ...kept);
            check(
              test.shippedBonusVariant(pristineJs, key) === shipped,
              "an entry naming other closure locals than this build's is declined",
            );
            reset();
            shim.setConfig({ [spec.setting]: true });
            reconcile(box);
            check(
              js().includes(derived.patched) &&
                !js().includes(impostor.patched),
              "and the edit that lands is the one the rule derives",
            );
            withhold();
          }
        }

        // A derivation recorded by a kb-patch whose rule wrote the edit
        // differently, met by the reviewed entry for this build. The two
        // buttons keep their anchor beside the insertion, so applying the
        // reviewed edit on top would add a second copy; the stale one has to
        // be reversed first.
        if (spec.restyle && shipped !== undefined) {
          const stale = { ...derived, patched: spec.restyle(derived.patched) };
          reset(
            test.withDerivedRecord(
              replaceLiteral(pristineJs, stale.original, stale.patched),
              [stale],
            ),
          );
          reinstate();
          shim.setConfig({ [spec.setting]: true });
          check(
            reconcile(box),
            "a stale derived edit is replaced by the reviewed one",
          );
          check(
            js() ===
              replaceLiteral(pristineJs, shipped.original, shipped.patched) &&
              recordNow().length === 0,
            "leaving exactly the reviewed edit and no record",
          );
          shim.setConfig({ [spec.setting]: false });
          check(
            reconcile(box) && js() === pristineJs,
            "which then turns off to the bundle Kilo shipped",
          );
          withhold();
        }
      } finally {
        reinstate();
        shim.setConfig({ addAttachFileButton: true, chatMathRendering: true });
      }
    }
  },
};
