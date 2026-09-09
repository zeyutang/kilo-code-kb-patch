#!/usr/bin/env node
// Prove the shipped patch set against a real Kilo build, offline.
//
//   node tools/verify.js [--ext <path to kilocode.kilo-code-*>]
//   node tools/verify.js --vsix <path to a Kilo Code .vsix>
//
// The install is only ever read. Pristine bytes are copied into a temp sandbox
// and every assertion runs against the extension's own exported functions, so a
// green run is evidence about what ships, not about a reimplementation. A vsix
// source is stronger still: those bytes never passed through kb-patch, so they
// need no reversal step to be trusted.
//
// What it proves, in the order the properties matter:
//   uniqueness    each original identifies exactly one site (String.replace
//                 rewrites the first match, so first must equal only)
//   completeness  applying yields "fully patched" with no feature missing
//   idempotence   a second apply is a no-op, so activation cannot drift
//   validity      the fully patched bundles still parse, the appended script
//                 block included
//   zero leakage  restoring returns the file byte-for-byte to pristine, which
//                 is the strongest statement that nothing outside the intended
//                 spans was touched
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const { loadExtension, shim } = require("./lib/load");
const { resolveBundleSource, assertPristine, countOccurrences } = require("./lib/bundle");
const { RULES, PROBES } = require("./lib/rules");

let failures = 0;
function check(condition, label, detail) {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`);
  }
  return condition;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--ext") args.ext = argv[++i];
    else if (argv[i] === "--vsix") args.vsix = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else throw new Error(`unknown argument ${JSON.stringify(argv[i])}`);
  }
  if (args.ext && args.vsix) throw new Error("pass either --ext or --vsix, not both");
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("usage: node tools/verify.js [--ext <path> | --vsix <path>]");
    return 0;
  }

  const test = loadExtension();
  const source = resolveBundleSource(test, args);
  const pristine = source.bundles;
  console.log(
    `Kilo Code v${source.version}\n  ${source.label}` +
      `${source.kind === "vsix" ? " (vsix, pristine)" : ""}\n`
  );
  assertPristine(pristine);

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kb-patch-verify-"));
  const dist = path.join(sandbox, "dist");
  fs.mkdirSync(dist, { recursive: true });
  for (const [filename, content] of Object.entries(pristine)) {
    fs.writeFileSync(path.join(dist, filename), content, "utf8");
  }

  try {
    console.log("uniqueness (originals present in this build)");
    for (const fp of test.PATCHES) {
      const content = pristine[fp.filename];
      if (content === undefined) continue;
      for (const p of fp.patches) {
        const hits = countOccurrences(content, p.original);
        // Most entries target other releases and are legitimately absent here;
        // only a pattern that this build actually matches must be unique.
        if (hits === 0) continue;
        check(hits === 1, `${fp.filename}: unique original for "${p.description}"`, `occurs ${hits}x`);
      }
    }

    console.log("\napply");
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      const result = test.applyPatches(path.join(dist, fp.filename), fp.patches);
      check(result.applied.length > 0, `${fp.filename}: applied ${result.applied.length} patch(es)`);
      for (const description of result.applied) console.log(`          + ${description}`);
    }
    // The core stylesheet block, the way Apply Patches writes it. The bonus
    // settings are still at their defaults here, so only the core block lands.
    const pristineCss = pristine[test.CHAT_STYLE_FILE];
    const cssPath = path.join(dist, test.CHAT_STYLE_FILE);
    const coreOn = test.coreCssDecision(true);
    const coreOff = test.coreCssDecision(false);
    const cssApplied = test.reconcileChatStyle(sandbox, coreOn);
    for (const key of test.CHAT_CSS_CORE) {
      check(cssApplied[key], `${test.CHAT_STYLE_FILE}: applied "${key}"`);
    }
    // The core script block, the same patch's other half, appended to the
    // bundle the splices above landed in.
    const scriptPath = path.join(dist, test.CHAT_SCRIPT_FILE);
    const scriptApplied = test.reconcileChatScript(sandbox, true);
    for (const key of test.CHAT_SCRIPT_CORE) {
      check(scriptApplied[key], `${test.CHAT_SCRIPT_FILE}: applied "${key}" block`);
    }

    console.log("\ncompleteness");
    const status = test.computeStatus(dist);
    check(status.verdict === "fully patched", `verdict is "fully patched"`, `got "${status.verdict}"`);
    for (const file of status.files) {
      if (!file.found) continue;
      for (const feature of file.features) {
        check(feature.state === "patched", `${file.filename}: ${feature.label}`, `state "${feature.state}"`);
      }
      // Every behavior the patch set declares must reach the status view, since
      // a feature that never renders is also absent from the verdict and would
      // read as "nothing wrong" while being unpatched. A bundle declares its
      // splices' features plus, for the one that takes it, the script block's.
      const declared = new Set(
        file.filename === test.CHAT_STYLE_FILE
          ? test.CHAT_CSS_CORE
          : [
              ...(test.PATCHES.find((f) => f.filename === file.filename)?.patches ?? []).map(
                (p) => p.feature
              ),
              ...(file.filename === test.CHAT_SCRIPT_FILE ? test.CHAT_SCRIPT_CORE : []),
            ]
      );
      check(
        file.features.length === declared.size,
        `${file.filename}: all ${declared.size} declared feature(s) appear in the status view`,
        `got ${file.features.length} row(s) for ${declared.size} declared feature(s)`
      );

      // The harness models the same behaviors as the extension; drift between
      // the two means a rule was added or renamed on only one side. A
      // stylesheet feature's counterpart is a probe rather than a shape rule.
      const ruled = new Set([
        ...RULES.filter((r) => r.file === file.filename).map((r) => r.key),
        ...PROBES.filter((p) => p.file === file.filename).map((p) => p.key),
      ]);
      const missing = [...declared].filter((k) => !ruled.has(k));
      check(
        missing.length === 0,
        `${file.filename}: every declared feature has a shape rule`,
        `no rule for: ${missing.join(", ")}`
      );
    }

    console.log("\nidempotence");
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      const again = test.applyPatches(path.join(dist, fp.filename), fp.patches);
      check(again.noChanges, `${fp.filename}: re-apply is a no-op`);
    }
    const cssAgain = test.reconcileChatStyle(sandbox, coreOn);
    check(
      test.CHAT_CSS_CORE.every((key) => !cssAgain[key]),
      `${test.CHAT_STYLE_FILE}: re-apply is a no-op`
    );
    const scriptAgain = test.reconcileChatScript(sandbox, true);
    check(
      test.CHAT_SCRIPT_CORE.every((key) => !scriptAgain[key]),
      `${test.CHAT_SCRIPT_FILE}: re-apply of the block is a no-op`
    );

    // The core stylesheet block stores no per-release text: it is written when
    // Kilo's own textarea rule still looks the way it assumes and skipped
    // otherwise, so what is asserted is the block's shape, the contract with
    // the bonus reconcile that shares the file (a core block is carried over
    // exactly as found, never applied or dropped on the side), and the status
    // rows that make an absent or stale block visible. What the rule does in a
    // browser was established in a headless Chromium on a copy of Kilo's layout
    // (see the comment above CHAT_SCROLL_RULE in src/extension.ts); nothing
    // here can run layout.
    console.log("\nchat scroll (core stylesheet patch)");
    if (pristineCss === undefined) {
      check(false, `${test.CHAT_STYLE_FILE} is present in dist/`);
    } else {
      const sizing = test.readPromptSizing(pristineCss);
      check(
        sizing !== undefined,
        "Kilo's textarea sizing rule is readable",
        JSON.stringify(sizing)
      );
      const applied = fs.readFileSync(cssPath, "utf8");
      check(
        countOccurrences(applied, "kilo-code-kb-patch:chat-scroll:begin") === 1 &&
          countOccurrences(applied, "kilo-code-kb-patch:chat-scroll:end") === 1,
        "exactly one chat-scroll block"
      );
      check(applied.includes(test.CHAT_SCROLL_RULE), "the block carries the field-sizing rule");
      check(
        test.CHAT_SCROLL_RULE.startsWith("@supports (field-sizing: content)") &&
          test.CHAT_SCROLL_RULE.includes(".chat-view .prompt-input {") &&
          test.CHAT_SCROLL_RULE.includes("height: auto !important"),
        "the rule is guarded by @supports, scoped to .chat-view, and overrides the inline height"
      );
      check(test.chatCssApplied(sandbox, "chat-scroll"), "the block reads as applied");

      shim.setConfig({ chatHistoryFontSizeEm: 1.3 });
      const withBonus = test.reconcileChatStyle(sandbox);
      check(
        !withBonus["chat-scroll"] &&
          fs.readFileSync(cssPath, "utf8").includes(test.CHAT_SCROLL_RULE),
        "a bonus reconcile leaves the applied block in place"
      );
      // Presence is judged by the block marker: Kilo's own stylesheet contains
      // the substring "chat-scroll" (`--chat-scrollbar-width`).
      const hasBlock = () =>
        fs.readFileSync(cssPath, "utf8").includes("kilo-code-kb-patch:chat-scroll:begin");
      const removed = test.reconcileChatStyle(sandbox, coreOff);
      check(removed["chat-scroll"] && !hasBlock(), "restoring removes the block");
      shim.setConfig({ chatHistoryFontSizeEm: 1.4 });
      test.reconcileChatStyle(sandbox);
      check(!hasBlock(), "a bonus reconcile does not apply the block on its own");
      const row = () =>
        test.computeStatus(dist).files.find((f) => f.filename === test.CHAT_STYLE_FILE)
          ?.features[0]?.state;
      check(row() === "unpatched", 'an absent block reads "unpatched"', `got "${row()}"`);
      check(
        test.computeStatus(dist).verdict === "partially patched",
        "and the verdict counts it",
        `got "${test.computeStatus(dist).verdict}"`
      );

      // A stale form (an older kb-patch's text) is reported and rewritten
      // rather than kept or duplicated.
      fs.writeFileSync(
        cssPath,
        fs.readFileSync(cssPath, "utf8") +
          "\n/* kilo-code-kb-patch:chat-scroll:begin */\n.stale {}\n/* kilo-code-kb-patch:chat-scroll:end */\n",
        "utf8"
      );
      check(row() === "unpatched", 'a stale block reads "unpatched"', `got "${row()}"`);
      const stillStale = test.reconcileChatStyle(sandbox);
      check(
        !stillStale["chat-scroll"] && fs.readFileSync(cssPath, "utf8").includes(".stale {}"),
        "a bonus reconcile leaves a stale block for Apply"
      );
      shim.setConfig({});
      const upgraded = test.reconcileChatStyle(sandbox, coreOn);
      const fresh = fs.readFileSync(cssPath, "utf8");
      check(
        upgraded["chat-scroll"] &&
          !fresh.includes(".stale {}") &&
          countOccurrences(fresh, "kilo-code-kb-patch:chat-scroll:begin") === 1,
        "Apply rewrites a stale block in place, exactly once"
      );
      check(row() === "patched", 'the fresh block reads "patched"', `got "${row()}"`);
      check(
        test.computeStatus(dist).verdict === "fully patched",
        "and the verdict is whole again",
        `got "${test.computeStatus(dist).verdict}"`
      );
    }

    // The script block is the other half of the same patch: a listener pair
    // appended to the bundle, with no per-release text either. Its threshold
    // is read out of the build, so what is asserted is the derivation, the
    // block's shape and placement, its survival across the bundle's own bonus
    // reconciles, the status rows, and the round trip. The block itself has no
    // dependency on Kilo's code, only on three class names, so unlike the
    // stylesheet rule it can also be run here, against a stand-in DOM.
    console.log("\nchat scroll (core script patch)");
    const pristineJs = pristine[test.CHAT_SCRIPT_FILE];
    if (pristineJs === undefined) {
      check(false, `${test.CHAT_SCRIPT_FILE} is present in dist/`);
    } else {
      const threshold = test.readScrollThreshold(pristineJs);
      check(
        Number.isInteger(threshold),
        "Kilo's chat templates and scroll threshold are readable",
        JSON.stringify({ threshold })
      );
      const block = test.chatScriptBlock("chat-scroll", pristineJs);
      const scriptOn = () => fs.readFileSync(scriptPath, "utf8");
      const marker = "kilo-code-kb-patch:chat-scroll:begin";
      check(
        countOccurrences(scriptOn(), marker) === 1 &&
          countOccurrences(scriptOn(), "kilo-code-kb-patch:chat-scroll:end") === 1,
        "exactly one chat-scroll block"
      );
      check(
        block !== "" && scriptOn().endsWith(block),
        "the block is appended at the very end of the bundle"
      );
      const body = test.chatScrollScript(threshold);
      check(
        body.includes('addEventListener("beforeinput"') &&
          body.includes('addEventListener("input"') &&
          body.includes("textarea.prompt-input") &&
          body.includes(".chat-view") &&
          body.includes(".message-list") &&
          body.includes(`< ${threshold} ?`),
        "the script names the three class names and this build's threshold"
      );
      check(
        !body.includes("preventDefault") && !body.includes("stopPropagation"),
        "the script prevents and stops nothing"
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
          this.top = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight));
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
        listeners.beforeinput?.capture === true && listeners.input?.capture === false,
        "the script listens on window: beforeinput in capture, input in bubble"
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
      check(edit(prompt, 21) === 0, "an edit that clamped the history re-pins it");
      list.scrollTop = 3500 - threshold + 1;
      check(edit(prompt, 0) === 0, "a history within Kilo's threshold counts as at the bottom");
      list.scrollTop = 3500 - threshold - 40;
      const away = list.scrollTop;
      check(
        edit(prompt, 0) === 3500 - away,
        "a history the user scrolled away from is left where it was"
      );
      list.scrollTop = 3500;
      check(
        edit(new HTMLTextAreaElement("textarea.other", true), 21) === 21,
        "an edit in another textarea is ignored"
      );
      list.scrollTop = 3500;
      check(
        edit(new HTMLTextAreaElement("textarea.prompt-input", false), 21) === 21,
        "a prompt textarea outside .chat-view is ignored"
      );
      list.scrollTop = 3500;
      check(edit({ tagName: "DIV" }, 21) === 21, "an edit in a non-textarea is ignored");

      // The bundle's bonuses are splices elsewhere in the file, so switching
      // them on and off must leave the block exactly as it was.
      const jsRow = () =>
        test
          .computeStatus(dist)
          .files.find((f) => f.filename === test.CHAT_SCRIPT_FILE)
          ?.features.find((ft) => ft.label.startsWith("Chat scroll"))?.state;
      check(jsRow() === "patched", 'the block reads "patched" in the bundle\'s rows', `got "${jsRow()}"`);
      shim.setConfig({ addAttachFileButton: true, chatMathRendering: true });
      test.reconcileAttachFileButton(sandbox);
      test.reconcileMathRendering(sandbox);
      check(
        scriptOn().endsWith(block) && jsRow() === "patched",
        "enabling the bundle bonuses leaves the block in place"
      );
      shim.setConfig({});
      test.reconcileAttachFileButton(sandbox);
      test.reconcileMathRendering(sandbox);
      check(
        scriptOn().endsWith(block) && jsRow() === "patched",
        "disabling them does too"
      );

      const removed = test.reconcileChatScript(sandbox, false);
      check(
        removed["chat-scroll"] && !scriptOn().includes(marker),
        "restoring removes the block"
      );
      check(jsRow() === "unpatched", 'an absent block reads "unpatched"', `got "${jsRow()}"`);
      check(
        test.computeStatus(dist).verdict === "partially patched",
        "and the verdict counts it",
        `got "${test.computeStatus(dist).verdict}"`
      );

      // A stale form (an older kb-patch's text) is reported and rewritten
      // rather than kept or duplicated.
      fs.writeFileSync(
        scriptPath,
        scriptOn() +
          "\n/* kilo-code-kb-patch:chat-scroll:begin */\n/* stale */\n/* kilo-code-kb-patch:chat-scroll:end */\n",
        "utf8"
      );
      check(jsRow() === "unpatched", 'a stale block reads "unpatched"', `got "${jsRow()}"`);
      const upgraded = test.reconcileChatScript(sandbox, true);
      check(
        upgraded["chat-scroll"] &&
          !scriptOn().includes("/* stale */") &&
          countOccurrences(scriptOn(), marker) === 1 &&
          scriptOn().endsWith(block),
        "Apply rewrites a stale block in place, exactly once"
      );
      check(jsRow() === "patched", 'the fresh block reads "patched"', `got "${jsRow()}"`);
      check(
        test.computeStatus(dist).verdict === "fully patched",
        "and the verdict is whole again",
        `got "${test.computeStatus(dist).verdict}"`
      );
    }

    // The bonus only ships variants for the releases it was targeted at, and on
    // any other build it is contractually a silent no-op reported as
    // "unavailable". Both halves of that contract are worth asserting: on a
    // build with no variant the setting must change nothing, which is what keeps
    // an unsupported release from being half-patched.
    console.log("\nattach-file button (opt-in bonus)");
    shim.setConfig({ addAttachFileButton: true });
    const webview = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
    if (test.matchingAttachFileButton(webview)) {
      check(test.reconcileAttachFileButton(sandbox), "enabling adds the button");
      check(
        test.computeBonusStatus(sandbox)[0]?.state === "on",
        "bonus reports on",
        `got "${test.computeBonusStatus(sandbox)[0]?.state}"`
      );
    } else {
      check(
        test.reconcileAttachFileButton(sandbox) === false,
        "no variant for this build: enabling changes nothing"
      );
      const state = test.computeBonusStatus(sandbox)[0]?.state;
      check(state === "unavailable", 'bonus reports "unavailable"', `got "${state}"`);
    }

    // Upgrading kb-patch can change a variant's patched text while the user's
    // bundle still carries the previous form. Since every patched string ends
    // with its own original, a naive apply would leave the old button in place
    // and inject a second one, so the old form has to be rewritten instead.
    const attachVariant = test.matchingAttachFileButton(webview);
    if (attachVariant?.previous?.length) {
      console.log("\nattach-file button upgrade (older form already installed)");
      const migrate = fs.mkdtempSync(path.join(os.tmpdir(), "kb-patch-migrate-"));
      try {
        fs.mkdirSync(path.join(migrate, "dist"));
        const target = path.join(migrate, "dist", "webview.js");
        const clean = pristine["webview.js"];
        const fresh = clean.replace(attachVariant.original, attachVariant.patched);
        for (const old of attachVariant.previous) {
          fs.writeFileSync(target, clean.replace(attachVariant.original, old), "utf8");
          shim.setConfig({ addAttachFileButton: true });
          test.reconcileAttachFileButton(migrate);
          const after = fs.readFileSync(target, "utf8");
          // Count buttons by the injected onClick's selectMention call, which
          // every variant contains exactly once regardless of how it captions
          // itself (7.5.4+ variants no longer call t("prompt.action.attachFile")).
          const buttons = countOccurrences(after, 'selectMention({type:"file-picker"}');
          check(buttons === 1, "older form yields exactly one button", `got ${buttons}`);
          check(after === fresh, "older form upgrades to exactly a fresh apply");

          fs.writeFileSync(target, clean.replace(attachVariant.original, old), "utf8");
          shim.setConfig({ addAttachFileButton: false });
          test.reconcileAttachFileButton(migrate);
          check(
            fs.readFileSync(target, "utf8") === clean,
            "older form can be removed back to pristine"
          );
        }
      } finally {
        fs.rmSync(migrate, { recursive: true, force: true });
      }
    }

    // Math rendering has the same "no variant for this build is a silent no-op"
    // contract as the attach button, and one property of its own worth pinning:
    // the splice must not disturb the two katex extensions Kilo already ships,
    // so both are asserted still present afterwards. What the added extensions
    // actually render is proved separately, in tools/behavior.js, against this
    // build's own bundled marked.
    console.log("\nmath rendering (opt-in bonus)");
    shim.setConfig({ addAttachFileButton: true, chatMathRendering: true });
    const beforeMath = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
    const mathVariant = test.matchingMathExtension(beforeMath);
    const mathRow = () =>
      test.computeBonusStatus(sandbox).find((b) => b.label.includes("math"))?.state;
    if (mathVariant) {
      check(
        countOccurrences(beforeMath, mathVariant.original) === 1,
        "the matched pack tail occurs exactly once"
      );
      check(test.reconcileMathRendering(sandbox), "enabling adds the extensions");
      const afterMath = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
      check(
        countOccurrences(afterMath, 'name:"kbpKatexInlineDollar"') === 1 &&
          countOccurrences(afterMath, 'name:"kbpKatexBlockBracket"') === 1 &&
          countOccurrences(afterMath, 'name:"kbpKatexInlineBracket"') === 1,
        "exactly one copy of each added extension"
      );
      check(
        afterMath.includes('{name:"doubleKatexBlock",level:"block"') &&
          afterMath.includes('{name:"doubleKatexInline",level:"inline"') &&
          afterMath.includes('{name:"inlineKatex",level:"inline"'),
        "Kilo's own $$ and \\( extensions survive the splice"
      );
      check(mathRow() === "on", "bonus reports on", `got "${mathRow()}"`);
      check(
        test.reconcileMathRendering(sandbox) === false,
        "re-enabling is a no-op"
      );
    } else {
      check(
        test.reconcileMathRendering(sandbox) === false,
        "no variant for this build: enabling changes nothing"
      );
      check(mathRow() === "unavailable", 'bonus reports "unavailable"', `got "${mathRow()}"`);
    }

    // The stylesheet bonuses store no per-release text: the typography block
    // reads Kilo's own declarations and re-declares them multiplied, and the
    // math block states an absolute em. So what is asserted here is the shape
    // of what they emit, not a stored pattern. Three of the assertions are the
    // promises the settings make: nothing outside the agent's reply is
    // restyled, code blocks keep their own size, and the math size is void
    // without the math bonus.
    console.log("\nchat stylesheet (opt-in bonuses)");
    if (pristineCss === undefined) {
      check(false, `${test.CHAT_STYLE_FILE} is present in dist/`);
    } else {
      const values = test.readChatStyleValues(pristineCss);
      check(values !== undefined, "Kilo's own declarations are readable", JSON.stringify(values));

      const ON = {
        addAttachFileButton: true,
        chatMathRendering: true,
        chatHistoryFontSizeEm: 1.3,
        chatHistoryFontFamily: "Charter, Georgia, serif",
        chatMathFontSizeEm: 1.05,
      };
      shim.setConfig(ON);
      const changed = test.reconcileChatStyle(sandbox);
      check(
        changed.typography && changed.math,
        "enabling appends both blocks and attributes each to its bonus"
      );
      const styled = fs.readFileSync(cssPath, "utf8");
      const typography = test.chatCssRules("typography", pristineCss);
      const math = test.chatCssRules("math", pristineCss);

      check(
        [...typography, ...math].every((r) => styled.includes(r)),
        "every rule the settings ask for is in the file"
      );
      check(
        values !== undefined &&
          styled.includes(`font-size: calc(${values.size} * 1.3)`) &&
          styled.includes(`font-size: calc(${values.heading} * 1.3)`) &&
          styled.includes(`font-size: calc(${values.table} * 1.3)`),
        "container, headings and tables are each scaled by the multiplier"
      );
      check(
        values !== undefined &&
          styled.includes(`pre { font-size: ${values.code}; }`) &&
          !styled.includes(`${values.code} * `),
        "code blocks are pinned to Kilo's own size, not scaled"
      );
      // Kilo gives inline code and file-path links a monospace family and no
      // size, so they follow the container unless pinned. Without these two
      // rules the setting would scale the `code` spans inside a sentence.
      check(
        values !== undefined &&
          styled.includes(`:not(pre) > code { font-size: ${values.size}; }`) &&
          styled.includes(`a.file-path-link { font-size: ${values.size}; }`),
        "inline code and file-path links are pinned to Kilo's own size"
      );
      check(
        styled.includes("font-family: Charter, Georgia, serif"),
        "the font-family value is emitted verbatim"
      );
      check(
        math.length === 1 && math[0].includes(".katex { font-size: 1.05em; }"),
        "the math size is emitted in em, in the math bonus's own block"
      );
      // The scoping promise: everything the typography block emits must be
      // under the assistant's text-part, which is what keeps the reasoning
      // block, tool output and the user's own messages out of it. And no rule
      // may name .shiki, which is how code blocks keep Kilo's own size.
      check(
        typography.length > 0 &&
          typography.every((r) => r.startsWith('[data-component="text-part"] ')),
        "typography rules are scoped to the agent's reply"
      );
      check(
        [...typography, ...math].every((r) => !r.includes(".shiki")),
        "no rule touches code blocks"
      );
      for (const key of test.CHAT_CSS_BLOCKS) {
        check(
          countOccurrences(styled, `kilo-code-kb-patch:${key}:begin`) === 1 &&
            countOccurrences(styled, `kilo-code-kb-patch:${key}:end`) === 1,
          `exactly one ${key} block`
        );
        check(test.chatCssApplied(sandbox, key), `${key} block reads as applied`);
      }
      const reapplied = test.reconcileChatStyle(sandbox);
      check(
        !reapplied.typography && !reapplied.math,
        "re-applying the same settings is a no-op"
      );

      // The math size belongs to the math bonus, so turning that bonus off has
      // to take the size rule with it while leaving typography alone.
      shim.setConfig({ ...ON, chatMathRendering: false });
      const offMath = test.reconcileChatStyle(sandbox);
      const withoutMath = fs.readFileSync(cssPath, "utf8");
      check(
        offMath.math && !offMath.typography,
        "turning math rendering off is attributed to the math bonus alone"
      );
      check(
        !withoutMath.includes(".katex { font-size:") &&
          typography.every((r) => withoutMath.includes(r)),
        "the math size is void without math rendering, typography is untouched"
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
        "a font-family value with CSS syntax in it is ignored"
      );

      // Rewriting the blocks in place must converge on exactly what a fresh
      // apply produces, so a settings change can never stack two copies.
      shim.setConfig(ON);
      test.reconcileChatStyle(sandbox);
      check(
        fs.readFileSync(cssPath, "utf8") === styled,
        "re-editing the settings converges on a fresh apply"
      );
    }

    // A core patch's `previous` holds the text an older kb-patch wrote at the
    // same site, so upgrading migrates the install in place (previous→patched)
    // and Restore Originals still reaches pristine (previous→original).
    // Simulate such an install for every entry whose site exists in this
    // build: rewrite that one site to the older form, then prove apply
    // converges on exactly a fresh result and restore on pristine bytes.
    const upgrades = [];
    for (const fp of test.PATCHES) {
      const clean = pristine[fp.filename];
      if (clean === undefined) continue;
      for (const p of fp.patches) {
        if (p.previous && countOccurrences(clean, p.original) === 1) {
          upgrades.push([fp, p]);
        }
      }
    }
    if (upgrades.length > 0) {
      console.log("\ncore upgrade (older patched form already installed)");
      const migrate = fs.mkdtempSync(path.join(os.tmpdir(), "kb-patch-core-migrate-"));
      try {
        for (const [fp, p] of upgrades) {
          const clean = pristine[fp.filename];
          const target = path.join(migrate, fp.filename);

          fs.writeFileSync(target, clean, "utf8");
          test.applyPatches(target, fp.patches);
          const fresh = fs.readFileSync(target, "utf8");

          const older = clean.replace(p.original, p.previous);
          fs.writeFileSync(target, older, "utf8");
          const result = test.applyPatches(target, fp.patches);
          check(
            result.applied.includes(`${p.description} (upgraded)`),
            `${fp.filename}: older "${p.feature}" form is upgraded in place`
          );
          check(
            fs.readFileSync(target, "utf8") === fresh,
            `${fp.filename}: upgraded "${p.feature}" equals a fresh apply`
          );

          fs.writeFileSync(target, older, "utf8");
          test.restorePatches(target, fp.patches);
          check(
            fs.readFileSync(target, "utf8") === clean,
            `${fp.filename}: older "${p.feature}" form restores to pristine`
          );
        }
      } finally {
        fs.rmSync(migrate, { recursive: true, force: true });
      }
    }

    console.log("\nvalidity (fully patched bundles still parse)");
    for (const filename of Object.keys(pristine).filter((f) => f.endsWith(".js"))) {
      const target = path.join(dist, filename);
      try {
        execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
        check(true, `node --check ${filename}`);
      } catch (err) {
        check(false, `node --check ${filename}`, String(err.stderr || err.message).trim());
      }
    }

    console.log("\nzero leakage (restore returns the file to pristine)");
    // Every bonus at its off value, which is what Restore Originals writes.
    shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
    test.reconcileAttachFileButton(sandbox);
    test.reconcileMathRendering(sandbox);
    test.reconcileChatStyle(sandbox, coreOff);
    test.reconcileChatScript(sandbox, false);
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      test.restorePatches(path.join(dist, fp.filename), fp.patches);
    }
    for (const [filename, original] of Object.entries(pristine)) {
      const restored = fs.readFileSync(path.join(dist, filename), "utf8");
      check(restored === original, `${filename}: byte-identical to pristine after restore`);
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  return failures === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`verify: ${err.message}`);
  process.exitCode = 2;
}
