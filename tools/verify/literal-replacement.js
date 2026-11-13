// Patch text is minified code, and minified code is made of what
// String.replace takes for patterns in a replacement string. `$` and `$$`
// are ordinary names to the minifier (Kilo 7.8.3 calls a local of the chat
// scope `$`), so `$&&x` is a local on the left of an `&&`, `$$()` is a
// call, and `'$'` and `` `$` `` are strings: all four sequences between
// them. Written through a bare replace, `$&&x` becomes the matched text
// followed by `&x`, and `$$()` becomes a call to a different function,
// which still parses.
//
// No shipped entry holds one of these sequences, so no other section would
// notice. Here a site is made to hold all four and is taken through every path
// that writes an edit or takes one back: Apply and Restore, the reconciler the
// three bonus splices share (a reviewed entry, an older form of one, a derived
// edit, and a derived edit a reviewed one supersedes), the rule that builds its
// edit by replacing inside what it matched, and the harness's own recovery of
// pristine bytes.

const fs = require("fs");
const path = require("path");
const { check } = require("../lib/cli");
const { shim, REPO_ROOT } = require("../lib/load");
const { countOccurrences, unpatched } = require("../lib/bundle");
const { RULES, replaceLiteral, esc } = require("../lib/rules");

// Every call in a file that hands String.replace a replacement it will read
// for patterns: a `replace` or `replaceAll` whose second argument is neither a
// function nor a literal with no `$` in it. The regex-escaping idiom "\\$&"
// is the one literal that means its pattern and is let through.
//
// `text.replace(find, put)` is the natural way to write a replacement and the
// wrong one for patch text, so the files that move patch text are read for it
// rather than trusted never to grow one. They are parsed with the compiler the
// project already builds with, since telling a regex literal from a division
// is not a job for a regex. Returns `file:line` for each call found.
function patternReadingReplaces(file) {
  const ts = require("typescript");
  const text = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  const found = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["replace", "replaceAll"].includes(node.expression.name.text) &&
      node.arguments.length >= 2
    ) {
      const put = node.arguments[1];
      const isFunction =
        ts.isArrowFunction(put) || ts.isFunctionExpression(put);
      const isPlainLiteral =
        (ts.isStringLiteral(put) || ts.isNoSubstitutionTemplateLiteral(put)) &&
        (!put.text.includes("$") || put.text === "\\$&");
      if (!isFunction && !isPlainLiteral) {
        const at = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        found.push(`${path.basename(file)}:${at.line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

module.exports = {
  needs: [],
  run({ test, pristine, sandbox }) {
    console.log("\nliteral replacement (a `$` in patch text is not a pattern)");
    {
      const SITE = "if($&&$$(a,'$',`$`))return 1;";
      const EDIT = "if($&&$$(a,'$',`$`)&&!$.kbp)return 1;";
      const OLDER = "if($&&$$(a,'$',`$`)&&$.kbp)return 1;";
      const whole = (site) =>
        `var $={},$$=()=>1,a=0;function kbpSite(){${site}return 0}`;
      const BUTTON = "kbpButton($&&$$,'$',`$`);";
      const OLD_BUTTON = "kbpOldButton($&&$$,'$',`$`);";
      const DERIVED_BUTTON = "kbpDerivedButton($&&$$,'$',`$`);";

      check(
        replaceLiteral("a<x>b<x>", "<x>", "$&$$$`$'") === "a$&$$$`$'b<x>",
        "the replacement goes in as written, at the first occurrence only",
      );

      const box = path.join(sandbox, "literal");
      const boxDist = path.join(box, "dist");
      fs.mkdirSync(boxDist, { recursive: true });
      const target = path.join(boxDist, test.CHAT_SCRIPT_FILE);
      const now = () => fs.readFileSync(target, "utf8");
      const lay = (text) => fs.writeFileSync(target, text, "utf8");

      const def = {
        feature: "chat-input",
        original: SITE,
        patched: EDIT,
        previous: OLDER,
        description: "a site made of `$` sequences",
      };
      lay(whole(SITE));
      test.applyPatches(target, [def]);
      check(now() === whole(EDIT), "Apply writes the edit as it is spelled");
      test.restorePatches(target, [def]);
      check(
        now() === whole(SITE),
        "Restore puts Kilo's bytes back as they were",
      );
      lay(whole(OLDER));
      test.applyPatches(target, [def]);
      check(
        now() === whole(EDIT),
        "an older form of the edit upgrades to the same bytes",
      );
      lay(whole(OLDER));
      test.restorePatches(target, [def]);
      check(now() === whole(SITE), "and restores to the same original");

      const webviewPatches = test.PATCHES.find(
        (group) => group.filename === test.CHAT_SCRIPT_FILE,
      ).patches;
      const keptCore = webviewPatches.slice();
      const keptAttach = test.ATTACH_FILE_BUTTONS.slice();
      const defaults = Object.fromEntries(test.BONUS_SETTING_DEFAULTS);
      try {
        // A reviewed bonus entry. The attach rule cannot read this file, so
        // the entry is all there is to go on and applies by its text.
        const variant = {
          original: SITE,
          patched: BUTTON + SITE,
          previous: [OLD_BUTTON + SITE],
        };
        test.ATTACH_FILE_BUTTONS.unshift(variant);
        lay(whole(SITE));
        shim.setConfig({ ...defaults, addAttachFileButton: true });
        check(
          test.reconcileAttachFileButton(box) && now() === whole(BUTTON + SITE),
          "a reviewed bonus entry is written as it is spelled",
        );
        lay(whole(OLD_BUTTON + SITE));
        check(
          test.reconcileAttachFileButton(box) && now() === whole(BUTTON + SITE),
          "an older form of it is rewritten in place to the same bytes",
        );
        // A derived edit the record names, met by a reviewed entry that spells
        // the edit differently: the derived one is reversed first.
        lay(
          test.withDerivedRecord(whole(DERIVED_BUTTON + SITE), [
            {
              feature: "attach-button",
              filename: test.CHAT_SCRIPT_FILE,
              original: SITE,
              patched: DERIVED_BUTTON + SITE,
              description: "attach-button [derived]",
            },
          ]),
        );
        check(
          test.reconcileAttachFileButton(box) && now() === whole(BUTTON + SITE),
          "a derived edit the reviewed entry supersedes is reversed exactly first",
        );
        shim.setConfig(defaults);
        check(
          test.reconcileAttachFileButton(box) && now() === whole(SITE),
          "and switching the bonus off puts Kilo's bytes back",
        );

        // The derived path, which has to earn its write (the edit lands once
        // and the bundle parses): a katex pack whose render helper the
        // minifier called `$$`, which no reviewed entry names.
        const PACK =
          "var $$=(t,o)=>t,kbpMarked={use(){}};kbpMarked.use({extensions:[" +
          '{name:"doubleKatexBlock",level:"block",renderer(n){return $$(n.text,{displayMode:!0,throwOnError:!1})+"\\n"}},' +
          '{name:"doubleKatexInline",level:"inline",renderer(n){return $$(n.text,{displayMode:!0,throwOnError:!1})}}]});';
        lay(PACK);
        shim.setConfig({ ...defaults, chatMathRendering: true });
        const wrote = test.reconcileMathRendering(box);
        const record = test.readDerivedRecordAt(boxDist);
        check(
          wrote &&
            record.length === 1 &&
            countOccurrences(now(), record[0].patched) === 1 &&
            countOccurrences(now(), "return $$(_n.text,") === 3,
          "a derived bonus edit that names `$$` is written once, with the name intact",
          `wrote ${wrote}, ${record.length} recorded`,
        );
        shim.setConfig(defaults);
        check(
          test.reconcileMathRendering(box) && now() === PACK,
          "and switching it off leaves the pack as Kilo wrote it",
        );

        // The harness's own recovery of pristine bytes, on every branch it
        // takes: the install's record, a core entry and its older form, a
        // bonus entry and its older form.
        webviewPatches.unshift(def);
        const recovered = (text, record = []) =>
          unpatched(whole(text), test.CHAT_SCRIPT_FILE, test, record) ===
          whole(SITE);
        check(
          recovered(DERIVED_BUTTON + SITE, [
            {
              filename: test.CHAT_SCRIPT_FILE,
              original: SITE,
              patched: DERIVED_BUTTON + SITE,
            },
          ]) &&
            recovered(EDIT) &&
            recovered(OLDER) &&
            recovered(BUTTON + SITE) &&
            recovered(OLD_BUTTON + SITE),
          "the harness recovers pristine bytes from each of those states",
        );
      } finally {
        webviewPatches.splice(0, webviewPatches.length, ...keptCore);
        test.ATTACH_FILE_BUTTONS.splice(
          0,
          test.ATTACH_FILE_BUTTONS.length,
          ...keptAttach,
        );
        shim.setConfig(defaults);
      }

      // The one rule that builds its edit by replacing inside the text it
      // matched. Its own site on this build is respelled so the dead-query
      // slot is called `$` and the close `$$`, which is what the edit then has
      // to write: `$&&…` and `$$()`.
      const mention = RULES.find((r) => r.key === "mention-escape");
      const js = pristine[test.CHAT_SCRIPT_FILE];
      const own = test.FEATURE_GATES["mention-escape"](js)
        ? mention.derive(js)
        : undefined;
      const names = (text, name) =>
        new RegExp(`(?<![\\w$.])${esc(name)}(?![\\w$])`).test(text);
      if (own?.original === undefined) {
        console.log("  n/a   this build has no mention-escape site to respell");
      } else if (names(own.original, "$") || names(own.original, "$$")) {
        console.log(
          "  n/a   this build's mention site already names `$` or `$$`",
        );
      } else {
        const respell = (text) =>
          [
            [own.symbols.dead, "$"],
            [own.symbols.close, "$$"],
          ].reduce(
            (out, [from, to]) =>
              out.replace(
                new RegExp(`(?<![\\w$.])${esc(from)}(?![\\w$])`, "g"),
                () => to,
              ),
            text,
          );
        const respelled = mention.derive(
          replaceLiteral(js, own.original, respell(own.original)),
        );
        check(
          respelled.original === respell(own.original) &&
            respelled.patched === respell(own.patched),
          "a rule that edits inside its match writes `$&&` and `$$()` as they are",
          JSON.stringify(
            respelled.error ?? respelled.matches ?? "the edit differs",
          ),
        );
      }

      // Everything above is about the paths that exist. This is about the next
      // one: nothing in the code that ships, or in the harness that stages and
      // reverses edits, may call replace with a replacement it would read for
      // patterns, whatever it happens to be moving today. The harness is read
      // whole, so code that moves into a module of its own is still read.
      const moving = [
        "out/extension.js",
        "out/rules.js",
        ...fs
          .readdirSync(path.join(REPO_ROOT, "tools"), { recursive: true })
          .filter((file) => file.endsWith(".js"))
          .sort()
          .map((file) => path.join("tools", file)),
      ];
      let reading;
      try {
        reading = moving.flatMap((file) =>
          patternReadingReplaces(path.join(REPO_ROOT, file)),
        );
      } catch (err) {
        console.log(
          `  n/a   the sources could not be read for a bare replace: ${err.message.split("\n")[0]}`,
        );
      }
      if (reading !== undefined) {
        check(
          reading.length === 0,
          "no replace in the patching code or the harness reads its replacement for patterns",
          reading.join(", "),
        );
      }
    }
  },
};
