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
const { loadExtension, shim, REPO_ROOT } = require("./lib/load");
const {
  resolveBundleSource,
  assertPristine,
  countOccurrences,
  unpatched,
} = require("./lib/bundle");
const {
  RULES,
  ATTACH_RULE,
  RAW_MARKDOWN_RULE,
  PROBES,
  longestLiteral,
  findAll,
  withoutPrefilter,
  replaceLiteral,
  ID,
  esc,
  HISTORY_DECLARATIONS_LIMIT,
} = require("./lib/rules");

// A stand-in for the few DOM operations the raw-markdown toggle performs, in
// the spirit of the chat-scroll scroller below: enough of an element to run
// the shipped handler against, and no more. Selectors are supported in the one
// form the toggle uses, an optional tag name followed by `[attr]` or
// `[attr=value]`, so a variant that selected some other way would fail here
// rather than pass on a stub that accepts anything.
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

// The contract of the literal a shape is prefiltered by, tried on shapes nobody
// wrote: every match of a source contains the literal drawn from it. Sources
// come from a small grammar over a four-letter alphabet (runs, classes,
// quantified atoms, groups of every kind with and without a repeat,
// alternation, lookarounds, backreferences, escapes), so random text over the
// same letters matches them often, and each match is checked.
//
// The cases beside this pin constructs one at a time. This is for what they
// cannot list: one construct inside another, where the extractor has to carry
// what a group guarantees out through the groups around it.
//
// The generator is seeded, so a run is the same sources and the same text
// every time. A group is never repeated without bound: an unbounded repeat
// around an unbounded repeat backtracks exponentially, which would test the
// regex engine's patience rather than the extractor.
function randomShapeViolations(count, seed) {
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const LETTERS = ["a", "b", "c", "d"];
  const ATOM_REPEATS = ["", "", "", "?", "*", "+", "{0,2}", "{1,2}", "{2}"];
  const ATOM_REPEATS_MORE = ["{2,}", "{0,}", "??", "*?", "+?"];
  const GROUP_REPEATS = ["", "", "", "?", "{0,2}", "{1,2}", "{2}", "??"];
  const CLASSES = ["[ab]", "[^a]", ".", "[a-c]", "\\w", "[cd]", "\\S", "\\D"];
  const CLASSES_MORE = ["[\\]a)(|]", "[a\\-c]"];
  const ESCAPES = ["\\.", "\\n", "\\x61", "\\u0062", "\\b", "\\B", "^", "$"];
  const ESCAPES_MORE = ["\\0", "\\cJ", "\\t", "\\/", "\\-"];

  const generate = () => {
    let groups = 0;
    const named = [];
    const run = () => {
      let out = "";
      const length = 1 + Math.floor(random() * 4);
      for (let i = 0; i < length; i++) out += pick(LETTERS);
      return out;
    };
    const repeat = () => pick([...ATOM_REPEATS, ...ATOM_REPEATS_MORE]);
    let alternation;
    const atom = (depth) => {
      const r = random();
      if (r < 0.42) return run();
      if (r < 0.5) return pick(LETTERS) + repeat();
      if (r < 0.56) return pick([...CLASSES, ...CLASSES_MORE]) + repeat();
      if (r < 0.6 && groups > 0) {
        return `\\${1 + Math.floor(random() * groups)}`;
      }
      if (r < 0.63) return pick([...ESCAPES, ...ESCAPES_MORE]);
      if (r < 0.65 && named.length > 0) return `\\k<${pick(named)}>`;
      if (depth >= 3) return run();
      const kind = random();
      if (kind < 0.3) {
        groups++;
        return `(${alternation(depth + 1)})${pick(GROUP_REPEATS)}`;
      }
      if (kind < 0.6) {
        return `(?:${alternation(depth + 1)})${pick(GROUP_REPEATS)}`;
      }
      if (kind < 0.68) {
        groups++;
        const name = `g${groups}`;
        const body = alternation(depth + 1);
        named.push(name);
        return `(?<${name}>${body})${pick(GROUP_REPEATS)}`;
      }
      if (kind < 0.76) return `(?=${alternation(depth + 1)})`;
      if (kind < 0.84) return `(?!${alternation(depth + 1)})`;
      if (kind < 0.92) return `(?<=${alternation(depth + 1)})`;
      return `(?<!${alternation(depth + 1)})`;
    };
    const sequence = (depth) => {
      let out = "";
      const length = 1 + Math.floor(random() * 4);
      for (let i = 0; i < length; i++) out += atom(depth);
      return out;
    };
    alternation = (depth) => {
      let out = sequence(depth);
      while (random() < 0.18) out += `|${sequence(depth)}`;
      return out;
    };
    return alternation(0);
  };
  const text = () => {
    let out = "";
    const length = 30 + Math.floor(random() * 60);
    for (let i = 0; i < length; i++) {
      out += random() < 0.03 ? pick([".", "\n", " "]) : pick(LETTERS);
    }
    return out;
  };

  const result = { shapes: 0, literals: 0, matches: 0, violations: [] };
  for (let n = 0; n < count; n++) {
    const source = generate();
    let shape;
    try {
      shape = new RegExp(source, "g");
    } catch {
      continue;
    }
    result.shapes++;
    const literal = longestLiteral(source);
    if (literal) result.literals++;
    for (let t = 0; t < 12; t++) {
      for (const m of text().matchAll(shape)) {
        result.matches++;
        if (!m[0].includes(literal)) {
          result.violations.push({ source, literal, match: m[0] });
          break;
        }
      }
    }
  }
  return result;
}

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
  // eslint-disable-next-line global-require
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

// Runs the attach button a patched bundle carries, the same way the toggle's
// handler is run below: the inserted text itself is evaluated against lazy
// stubs, bound by the names the rule read off this build, so what is asserted
// is the button that ships rather than a copy of it. The edit is the button
// followed by the anchor it was inserted before, and the anchor is cut
// mid-expression, so only the button half is evaluated.
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
  const context = {
    [symbols.insert]: (parent, node) => inserted.push({ parent, node }),
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
  try {
    vm.runInNewContext(button, context);
  } catch (e) {
    return `the button text does not run: ${e.message}`;
  }
  if (inserted.length !== 1 || inserted[0].parent !== "toolbar") {
    return `expected one insert into the toolbar, got ${inserted.length}`;
  }
  const tip = inserted[0].node;
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
  if (args.ext && args.vsix)
    throw new Error("pass either --ext or --vsix, not both");
  return args;
}

async function main() {
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
      `${source.kind === "vsix" ? " (vsix, pristine)" : ""}\n`,
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
        check(
          hits === 1,
          `${fp.filename}: unique original for "${p.description}"`,
          `occurs ${hits}x`,
        );
      }
    }

    console.log("\napply");
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      const result = test.applyPatches(
        path.join(dist, fp.filename),
        fp.patches,
      );
      check(
        result.applied.length > 0,
        `${fp.filename}: applied ${result.applied.length} patch(es)`,
      );
      for (const description of result.applied)
        console.log(`          + ${description}`);
    }
    // The core stylesheet block, the way Apply Patches writes it. The bonus
    // settings are still at their defaults here, so only the core block lands.
    // A core block whose gate says this build already does without it is not
    // written at all (math-clip, where KaTeX declares the fix itself).
    const pristineCss = pristine[test.CHAT_STYLE_FILE];
    const cssPath = path.join(dist, test.CHAT_STYLE_FILE);
    const coreOn = test.coreCssDecision(true);
    const coreOff = test.coreCssDecision(false);
    const cssCoreNeeded = (key) =>
      pristineCss === undefined ||
      test.FEATURE_GATES[key]?.(pristineCss) !== false;
    const cssApplied = test.reconcileChatStyle(sandbox, coreOn);
    for (const key of test.CHAT_CSS_CORE) {
      check(
        cssApplied[key] === cssCoreNeeded(key),
        cssCoreNeeded(key)
          ? `${test.CHAT_STYLE_FILE}: applied "${key}"`
          : `${test.CHAT_STYLE_FILE}: "${key}" not written, since this build does without it`,
      );
    }
    // The core script block, the same patch's other half, appended to the
    // bundle the splices above landed in.
    const scriptPath = path.join(dist, test.CHAT_SCRIPT_FILE);
    const scriptApplied = test.reconcileChatScript(sandbox, true);
    for (const key of test.CHAT_SCRIPT_CORE) {
      check(
        scriptApplied[key],
        `${test.CHAT_SCRIPT_FILE}: applied "${key}" block`,
      );
    }

    console.log("\ncompleteness");
    const status = test.computeStatus(dist);
    check(
      status.verdict === "fully patched",
      `verdict is "fully patched"`,
      `got "${status.verdict}"`,
    );
    // A row may also read "unneeded", but only where the feature's gate says
    // this build does not have the Kilo behavior it fixes; a label maps back to
    // its key through the extension's own label table.
    const keyOf = (label) =>
      Object.entries(test.FEATURE_LABELS).find(([, l]) => l === label)?.[0];
    for (const file of status.files) {
      if (!file.found) continue;
      for (const feature of file.features) {
        if (feature.state === "unneeded") {
          const gate = test.FEATURE_GATES[keyOf(feature.label)];
          check(
            gate !== undefined && gate(pristine[file.filename]) === false,
            `${file.filename}: ${feature.label} (not needed on this build)`,
            "reads unneeded without a gate that says so",
          );
          continue;
        }
        check(
          feature.state === "patched",
          `${file.filename}: ${feature.label}`,
          `state "${feature.state}"`,
        );
      }
      // Every behavior the patch set declares must reach the status view, since
      // a feature that never renders is also absent from the verdict and would
      // read as "nothing wrong" while being unpatched. A bundle declares its
      // splices' features plus, for the one that takes it, the script block's.
      const declared = new Set(
        file.filename === test.CHAT_STYLE_FILE
          ? test.CHAT_CSS_CORE
          : [
              ...(
                test.PATCHES.find((f) => f.filename === file.filename)
                  ?.patches ?? []
              ).map((p) => p.feature),
              ...(file.filename === test.CHAT_SCRIPT_FILE
                ? test.CHAT_SCRIPT_CORE
                : []),
            ],
      );
      check(
        file.features.length === declared.size,
        `${file.filename}: all ${declared.size} declared feature(s) appear in the status view`,
        `got ${file.features.length} row(s) for ${declared.size} declared feature(s)`,
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
        `no rule for: ${missing.join(", ")}`,
      );
    }

    // A file Kilo retired keeps its section and reports every behavior it used
    // to carry as "not needed", which the loop above cannot check because it
    // only walks the files a build ships. Dropping those rows would hide which
    // behaviors are inert here, and "missing" would read as a stale pattern.
    for (const file of status.files.filter((f) => !f.found)) {
      const declared = new Set(
        (
          test.PATCHES.find((f) => f.filename === file.filename)?.patches ?? []
        ).map((p) => p.feature),
      );
      const retired = test.RETIRED_FILES.has(file.filename);
      check(
        file.features.length === (retired ? declared.size : 0),
        retired
          ? `${file.filename}: not shipped here, and all ${declared.size} of its feature(s) still report`
          : `${file.filename}: absent and unaccounted for, so it reports no rows`,
        `got ${file.features.length} row(s)`,
      );
      check(
        file.features.every((ft) => ft.state === "unneeded"),
        `${file.filename}: every row reads "not needed on this Kilo Code build"`,
      );
    }

    // A gate and its shape rule are two readings of the same fact, that a
    // build has the Kilo behavior a feature fixes, so the two must agree: a
    // gate that opens where the rule finds no site would report "missing"
    // for a build that needs a retarget, and a gate that closes where the
    // rule derives would hide a site that is there to patch.
    console.log(
      "\ngates (features that fix a behavior this build may not have)",
    );
    for (const [key, gate] of Object.entries(test.FEATURE_GATES)) {
      // A core stylesheet block has no shape rule, and its counterpart is the
      // block itself: the gate has to close exactly where the extension
      // declines to write it, or the row would read "not needed" beside a
      // block it still writes, or "missing" on a build that carries the fix.
      if (test.CHAT_CSS_CORE.includes(key)) {
        if (pristineCss === undefined) continue;
        const wanted = gate(pristineCss);
        const writes = test.chatCssBlock(key, pristineCss) !== "";
        check(
          wanted === writes,
          `${key}: the gate (${wanted ? "wanted" : "not needed"}) agrees with the block (${
            writes ? "written" : "not written"
          })`,
        );
        continue;
      }
      const rule = RULES.find((r) => r.key === key);
      if (
        !check(rule !== undefined, `${key}: the gated feature has a shape rule`)
      )
        continue;
      const content = pristine[rule.file];
      if (content === undefined) continue;
      const wanted = gate(content);
      const derives = rule.derive(content).original !== undefined;
      check(
        wanted === derives,
        `${key}: the gate (${wanted ? "wanted" : "not needed"}) agrees with the rule (${
          derives ? "derives" : "no site"
        })`,
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
      `${test.CHAT_STYLE_FILE}: re-apply is a no-op`,
    );
    const scriptAgain = test.reconcileChatScript(sandbox, true);
    check(
      test.CHAT_SCRIPT_CORE.every((key) => !scriptAgain[key]),
      `${test.CHAT_SCRIPT_FILE}: re-apply of the block is a no-op`,
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

    // The second core stylesheet block: one declaration that makes each
    // rendered formula clip its own out-of-flow MathML twin, so the twins stop
    // extending the chat scroller past its content (the measurement is in the
    // comment above MATH_CLIP_RULE in src/extension.ts; nothing here can run
    // layout). It stores no per-release text either, so what is asserted is the
    // shape of the rule, that it leaves the MathML in the tree, and the same
    // carry-over contract and status rows as the block above. From Kilo 7.8.7
    // KaTeX declares the same position itself, and there the block is not
    // written and its row reads "not needed", so both readings of the gate are
    // also run on this build's own stylesheet with KaTeX's declaration put in
    // and taken out, whichever of the two the build ships.
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
      // patched, and both restore to pristine (asserted below and in the
      // derived-math section), so the invariant here is that the block is
      // still there and still whole, not where in the tail it sits.
      const coreBlocksWhole = () =>
        test.CHAT_SCRIPT_CORE.every(
          (key) =>
            countOccurrences(
              scriptOn(),
              test.chatScriptBlock(key, pristineJs),
            ) === 1,
        );
      shim.setConfig({ addAttachFileButton: true, chatMathRendering: true });
      test.reconcileAttachFileButton(sandbox);
      test.reconcileMathRendering(sandbox);
      check(
        coreBlocksWhole() && jsRow() === "patched",
        "enabling the bundle bonuses leaves the block in place",
      );
      shim.setConfig({});
      test.reconcileAttachFileButton(sandbox);
      test.reconcileMathRendering(sandbox);
      check(
        coreBlocksWhole() && jsRow() === "patched",
        "disabling them does too",
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

    // The hover guard is the bundle's second core block: listeners appended
    // with no per-release text, gated on the two templates the chat-scroll
    // script reaches the textarea through. What is asserted is the gate, the
    // block's shape and its place after the chat-scroll block, the status rows
    // and the round trip, and, since the script depends on nothing of Kilo's,
    // what it does when driven with the event sequences the engine produces
    // (measured in a headless Chromium; see the comment above
    // HOVER_GUARD_ANCHORS in src/extension.ts). Pointer events keep fractional
    // coordinates and mouse events truncate them, which the sequences below
    // reproduce.
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

    // A reviewed entry answers where one matches (and the rule agrees with
    // it), the build's own bytes supply the button where none does, and a
    // build the rule cannot read either is a silent no-op reported as
    // "unavailable". Each half of that is asserted, since the last one is what
    // keeps an unsupported release from being half-patched.
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
      test.computeBonusStatus(sandbox).find((b) => b.label.includes("math"))
        ?.state;
    if (mathVariant) {
      check(
        countOccurrences(beforeMath, mathVariant.original) === 1,
        "the matched pack tail occurs exactly once",
      );
      check(
        test.reconcileMathRendering(sandbox),
        "enabling adds the extensions",
      );
      const afterMath = fs.readFileSync(path.join(dist, "webview.js"), "utf8");
      check(
        countOccurrences(afterMath, 'name:"kbpKatexInlineDollar"') === 1 &&
          countOccurrences(afterMath, 'name:"kbpKatexBlockBracket"') === 1 &&
          countOccurrences(afterMath, 'name:"kbpKatexInlineBracket"') === 1,
        "exactly one copy of each added extension",
      );
      check(
        afterMath.includes('{name:"doubleKatexBlock",level:"block"') &&
          afterMath.includes('{name:"doubleKatexInline",level:"inline"') &&
          afterMath.includes('{name:"inlineKatex",level:"inline"'),
        "Kilo's own $$ and \\( extensions survive the splice",
      );
      check(mathRow() === "on", "bonus reports on", `got "${mathRow()}"`);
      check(
        test.reconcileMathRendering(sandbox) === false,
        "re-enabling is a no-op",
      );
    } else {
      // Since 2.1.3 "no shipped entry" is the derived path rather than a dead
      // end, so what enabling does here depends on whether this build's own
      // bytes can supply the splice. What that path writes is asserted in the
      // next section; this one only has to agree with the row.
      const derivable =
        test.deriveBonus("math-rendering", beforeMath) !== undefined;
      check(
        test.reconcileMathRendering(sandbox) === derivable,
        derivable
          ? "no shipped entry: enabling applies the derived splice"
          : "no shipped entry and nothing to derive: enabling changes nothing",
      );
      const wanted = derivable ? "on" : "unavailable";
      check(
        mathRow() === wanted,
        `bonus reports "${wanted}"`,
        `got "${mathRow()}"`,
      );
    }

    // Every bundle splice a build's own bytes can supply (DERIVABLE_BONUSES),
    // so the case worth proving is the one no reviewed entry answers: a future
    // Kilo that re-minified only these sites. The entry that answers for this
    // build is withheld to make it look like that one, and what the derivation
    // writes is then held against the bytes that entry would have written.
    // A separate copy of the bundle per bonus, because everything here has to
    // start from pristine.
    const DERIVED_SPECS = {
      "attach-button": {
        setting: "addAttachFileButton",
        row: "Prompt toolbar",
        reconcile: (box, record) => test.reconcileAttachFileButton(box, record),
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
        reconcile: (box, record) => test.reconcileMathRendering(box, record),
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
        reconcile: (box, record) =>
          test.reconcileRawMarkdownToggle(box, record),
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
        check(spec.reconcile(box), "enabling applies the derived splice");
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
        check(spec.reconcile(box) === false, "re-enabling is a no-op");
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
          spec.reconcile(box, [derived]) && js() === pristineJs,
          "and the passed-in record still reverses the edit, byte for byte",
        );
        // Then the ordinary path: apply again, turn it off with the record
        // where it lives, and the entry goes with the edit.
        shim.setConfig({ [spec.setting]: true });
        spec.reconcile(box);
        shim.setConfig({ [spec.setting]: false });
        check(
          spec.reconcile(box) && entry() === undefined,
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
            spec.reconcile(box);
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
            spec.reconcile(box),
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
            spec.reconcile(box) && js() === pristineJs,
            "which then turns off to the bundle Kilo shipped",
          );
          withhold();
        }
      } finally {
        reinstate();
        shim.setConfig({ addAttachFileButton: true, chatMathRendering: true });
      }
    }

    // The raw-markdown toggle has the same contract as the other two splices:
    // a reviewed entry where one answers, the build's own bytes where none
    // does, and a silent no-op where neither can. What is particular to it is
    // that the patched text *begins* with the original (the splice appends
    // after Kilo's copy button), so a patched bundle shows both texts and only
    // variantEdit's already-patched-before-pristine ordering keeps enabling
    // from stacking a second button. That is what the re-enable check below is
    // for, and the count assertions are what would catch it if the ordering
    // ever changed.
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
        // Left on for the rest of the run, as the other two splices are, so
        // the parse check below sees a bundle carrying all three.
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
      const migrate = fs.mkdtempSync(
        path.join(os.tmpdir(), "kb-patch-core-migrate-"),
      );
      try {
        for (const [fp, p] of upgrades) {
          const clean = pristine[fp.filename];
          const target = path.join(migrate, fp.filename);

          fs.writeFileSync(target, clean, "utf8");
          test.applyPatches(target, fp.patches);
          const fresh = fs.readFileSync(target, "utf8");

          const older = replaceLiteral(clean, p.original, p.previous);
          fs.writeFileSync(target, older, "utf8");
          const result = test.applyPatches(target, fp.patches);
          check(
            result.applied.includes(`${p.description} (upgraded)`),
            `${fp.filename}: older "${p.feature}" form is upgraded in place`,
          );
          check(
            fs.readFileSync(target, "utf8") === fresh,
            `${fp.filename}: upgraded "${p.feature}" equals a fresh apply`,
          );

          fs.writeFileSync(target, older, "utf8");
          test.restorePatches(target, fp.patches);
          check(
            fs.readFileSync(target, "utf8") === clean,
            `${fp.filename}: older "${p.feature}" form restores to pristine`,
          );
        }
      } finally {
        fs.rmSync(migrate, { recursive: true, force: true });
      }
    }

    // Both permission edits are expressions whose correctness is in how they
    // *evaluate*, and 7.7.0 changed what they have to compose with: Escape now
    // opens Kilo's deny-with-feedback box instead of denying, and the approve
    // branch grew a conjunct so Enter inside that box submits the rejection.
    // The perm-approve edit adds two branches under that conjunct, which is
    // only right if the parenthesisation holds; a splice that dropped it would
    // still derive, apply, parse and restore, and would approve a tool while
    // the user was typing a reason for denying it. So the shipped text itself
    // is evaluated here rather than a copy of it, the way the raw-markdown
    // section pulls the real onClick off its splice.
    console.log("\npermission keys (what the patched expressions decide)");
    {
      const ev = (o) => ({
        key: "Escape",
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        ...o,
      });
      const empty = { value: "" };
      const spaces = { value: "   \n" };
      const text = { value: "hi" };

      const escapeRule = RULES.find((r) => r.key === "perm-escape");
      const escape = escapeRule.derive(pristine["webview.js"]);
      if (escape.original === undefined) {
        check(false, "perm-escape derives a site to evaluate");
      } else {
        const { handler, event, action } = escape.symbols;
        // The captured action calls into the enclosing scope, so every name it
        // mentions is stubbed to record that the dialog was reached.
        const named = [
          ...new Set(action.match(/[A-Za-z_$][\w$]*/g) ?? []),
        ].filter((n) => n !== event);
        const build = new Function(
          "calls",
          `let ${handler};const ${named
            .map((n) => `${n}=()=>calls.push("${n}")`)
            .join(",")};${escape.patched};return ${handler};`,
        );
        const calls = [];
        const fn = build(calls);
        const reaches = (e) => {
          calls.length = 0;
          fn(e);
          return calls.length > 0;
        };
        check(
          reaches(ev({ target: empty })),
          "Escape acts when the chat box is empty",
        );
        check(
          reaches(ev({ target: spaces })),
          "Escape acts when the chat box holds only whitespace",
        );
        check(
          !reaches(ev({ target: text })),
          "Escape does not act when the chat box holds text",
        );
        check(
          reaches(ev({ target: text, shiftKey: true })),
          "Shift+Escape acts even when the chat box holds text",
        );
        // Focus sits on a dialog button often enough that this is the common
        // case, and a button has no value for the guard to read.
        check(
          reaches(ev({ target: {} })),
          "Escape acts with focus on a button",
        );
        check(
          !reaches(ev({ key: "Enter", target: empty })),
          "a key other than Escape is left alone",
        );
      }

      const approveRule = RULES.find((r) => r.key === "perm-approve");
      const approve = approveRule.derive(pristine["webview.js"]);
      if (approve.original === undefined) {
        check(false, "perm-approve derives a site to evaluate");
      } else {
        const { enterCheck, event, extraGuards, dispatch } = approve.symbols;
        const head = approve.patched.indexOf("if(") + 3;
        const tail = approve.patched.indexOf(`){${dispatch}(`);
        const guard = approve.patched.slice(head, tail);
        const extras = [
          ...new Set((extraGuards ?? "").match(/[A-Za-z_$][\w$]*/g) ?? []),
        ];
        const approves = (
          e,
          { bareEnter = false, feedbackOpen = false } = {},
        ) =>
          new Function(
            event,
            `const ${enterCheck}=()=>${bareEnter};` +
              (extras.length
                ? `const ${extras
                    .map((n) => `${n}=()=>${feedbackOpen}`)
                    .join(",")};`
                : "") +
              `return !!(${guard});`,
          )(e);
        check(
          approves(ev({ key: "Enter", target: empty }), { bareEnter: true }),
          "bare Enter approves when the chat box is empty",
        );
        check(
          approves(ev({ key: " ", target: empty })),
          "Space approves when the chat box is empty",
        );
        check(
          !approves(ev({ key: " ", target: text })),
          "Space does not approve when the chat box holds text",
        );
        check(
          approves(ev({ key: "Enter", metaKey: true, target: text })),
          "Cmd+Enter approves whatever the chat box holds",
        );
        check(
          approves(ev({ key: "Enter", ctrlKey: true, target: text })),
          "Ctrl+Enter approves whatever the chat box holds",
        );
        check(
          !approves(ev({ key: "Escape", target: empty })),
          "Escape never approves",
        );
        if (extras.length === 0) {
          console.log(
            "  n/a   this build has no extra approve guard to respect",
          );
        } else {
          // The parenthesisation is the whole point: each added branch has to
          // sit under Kilo's conjunct, not beside it.
          check(
            !approves(ev({ key: "Enter", target: empty }), {
              bareEnter: true,
              feedbackOpen: true,
            }),
            "bare Enter does not approve while the feedback box is open",
          );
          check(
            !approves(ev({ key: " ", target: empty }), { feedbackOpen: true }),
            "Space does not approve while the feedback box is open",
          );
          check(
            !approves(ev({ key: "Enter", metaKey: true, target: text }), {
              feedbackOpen: true,
            }),
            "Cmd/Ctrl+Enter does not approve while the feedback box is open",
          );
        }
      }
    }

    // The chat-history rule reads past two stretches of Kilo's handler that it
    // does not own: what the handler declares between the direction and the
    // navigate() call, and what that call passes after the caret. Both were
    // empty until 7.8.2 made the history carry the draft's pasted chunks, and
    // a rule that spelled the call out matched nothing from that build on. So
    // two generations of the handler are live, and whichever one this build
    // has, the other is made out of its own bytes here and has to derive as
    // well: the same edit, with what Kilo added written back untouched.
    //
    // What makes the capture safe to derive unreviewed is narrower than "the
    // edit names nothing inside it". The edit changes what one local holds,
    // the caret, so nothing captured may read that local, and the rule has to
    // say so rather than derive. The last three checks are the limits on how
    // far the declarations stretch may run: not past the statement, not into
    // a block, and not further than a declaration list plausibly is.
    console.log(
      "\nchat history (what the rule reads past, and what it refuses)",
    );
    {
      const rule = RULES.find((r) => r.key === "chat-history");
      const js = pristine["webview.js"];
      const own = rule.derive(js);
      if (own.original === undefined) {
        check(false, "chat-history derives a site to reshape");
      } else {
        const s = own.symbols;
        const call = (extra) =>
          `${s.result}=${s.history}.navigate(${s.direction},${s.text}(),${s.caret}${extra})`;
        const tail = `${s.declarations}${call(s.extraArguments)}`;
        // This build's handler with other declarations ahead of the call and
        // other arguments after the caret, as anchor text and as a bundle.
        const reshaped = (text, declarations, extra) =>
          text.slice(0, -tail.length) + declarations + call(extra);
        const bundleWith = (declarations, extra) =>
          replaceLiteral(
            js,
            own.original,
            reshaped(own.original, declarations, extra),
          );
        const derived = (declarations, extra) =>
          rule.derive(bundleWith(declarations, extra));
        const outcome = (r) =>
          JSON.stringify(r.error ?? r.matches ?? "it derived a site");

        const carries = s.declarations !== "";
        const other = carries
          ? ["", ""]
          : ["_kbpP=_kbpC.pastes().map(_kbpX=>_kbpX.text),", ",_kbpP"];
        const flipped = derived(...other);
        check(
          own.original.endsWith(tail) &&
            flipped.original === reshaped(own.original, ...other),
          `the ${carries ? "text-only" : "chunk-carrying"} form of this handler derives too`,
          outcome(flipped),
        );
        check(
          flipped.patched === reshaped(own.patched, ...other),
          "with the same edit, and Kilo's declarations and arguments written back verbatim",
        );
        const admission = test.admissibility(rule, bundleWith(...other));
        check(
          "edit" in admission,
          "and apply would derive that form unreviewed",
          admission.refused,
        );

        const reads = derived(`_kbpP=_kbpF(${s.caret}),`, ",_kbpP");
        check(
          reads.original === undefined && /caret/.test(reads.error ?? ""),
          "a declaration that reads the caret is reported, not derived",
          outcome(reads),
        );
        const twice = derived("", `,${s.caret}`);
        check(
          twice.original === undefined && /caret/.test(twice.error ?? ""),
          "so is a call that passes the caret a second time",
          outcome(twice),
        );
        // The same letters where they are not the local: inside a longer
        // name (a `$` counts as part of one), as a member, and as a quoted
        // string. A minified name is short enough to meet all three, and
        // refusing on one would leave a sound build unpatched.
        const lookalike = derived(
          `_kbpP=_kbpF(_${s.caret},${s.caret}_,$${s.caret},${s.caret}$,_kbpO.${s.caret},"${s.caret}"),`,
          ",_kbpP",
        );
        check(
          lookalike.original !== undefined,
          "the caret's letters in a longer name, a member or a string are not a reading of it",
          outcome(lookalike),
        );

        const leaves = derived("_kbpP=1;let _kbpQ=2,", "");
        check(
          leaves.matches === 0,
          "declarations that end the statement are not read as part of it",
          outcome(leaves),
        );
        const enters = derived("_kbpP=()=>{},", ",_kbpP");
        check(
          enters.matches === 0,
          "nor are declarations that open a block",
          outcome(enters),
        );
        // One declaration of exactly `n` bytes ahead of its comma, so the two
        // sides of the bound differ by a single digit and nothing else.
        const stretch = (n) => `_kbpP=${"1".padEnd(n - 6, "0")},`;
        const atLimit = derived(stretch(HISTORY_DECLARATIONS_LIMIT), ",_kbpP");
        const pastLimit = derived(
          stretch(HISTORY_DECLARATIONS_LIMIT + 1),
          ",_kbpP",
        );
        check(
          atLimit.original !== undefined && pastLimit.matches === 0,
          `a stretch of ${HISTORY_DECLARATIONS_LIMIT} bytes is read and one of ${HISTORY_DECLARATIONS_LIMIT + 1} is not`,
          `${outcome(atLimit)} at the limit, ${outcome(pastLimit)} past it`,
        );
      }
    }

    // Patch text is minified code, and minified code is made of what
    // String.replace takes for patterns in a replacement string. `$` and `$$`
    // are ordinary names to the minifier (Kilo 7.8.3 calls a local of the chat
    // scope `$`), so `$&&x` is a local on the left of an `&&`, `$$()` is a
    // call, and `'$'` and `` `$` `` are strings: all four sequences between
    // them. Written through a bare replace, `$&&x` becomes the matched text
    // followed by `&x`, and `$$()` becomes a call to a different function,
    // which still parses.
    //
    // No shipped entry holds one of these sequences, so nothing above this
    // section would notice. Here a site is made to hold all four and is taken
    // through every path that writes an edit or takes one back: Apply and
    // Restore, the reconciler the three bonus splices share (a reviewed entry,
    // an older form of one, a derived edit, and a derived edit a reviewed one
    // supersedes), the rule that builds its edit by replacing inside what it
    // matched, and the harness's own recovery of pristine bytes.
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
      // patterns, whatever it happens to be moving today.
      const moving = [
        "out/extension.js",
        "out/rules.js",
        "tools/lib/bundle.js",
        "tools/behavior.js",
        "tools/retarget.js",
        "tools/verify.js",
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

    // activate() asks "is any webview.js patch still waiting?" with a
    // per-feature scan that stops at the variant which matches, rather than
    // testing all of them, because each test scans a ~20 MB bundle and the
    // array grows every retarget. That is only sound while at most one variant
    // of a feature matches a build, so the two forms are compared here on every
    // state an install passes through: pristine, fully patched, and each
    // single-feature-missing state an upgrade lands in. A retarget that shipped
    // a shadowing variant would part them here rather than in the field.
    console.log("\nneeds-patching scan (short-circuit matches the flat scan)");
    {
      const webviewPatches = test.PATCHES.find(
        (group) => group.filename === "webview.js",
      ).patches;
      const flat = (content) =>
        webviewPatches.some(
          (p) =>
            !content.includes(p.patched) &&
            (content.includes(p.original) ||
              (p.previous && content.includes(p.previous))),
        );
      const pristineJs = pristine["webview.js"];
      let full = pristineJs;
      for (const p of webviewPatches) {
        if (full.includes(p.patched)) continue;
        if (full.includes(p.original))
          full = replaceLiteral(full, p.original, p.patched);
      }
      const states = [
        ["pristine", pristineJs],
        ["fully patched", full],
        ...webviewPatches
          .filter(
            (p) => full.includes(p.patched) && !pristineJs.includes(p.patched),
          )
          .map((p) => [
            `only ${p.feature} missing`,
            replaceLiteral(full, p.patched, p.original),
          ]),
      ];
      let parted = 0;
      for (const [name, content] of states) {
        if (flat(content) !== test.webviewNeedsPatching(content)) {
          parted++;
          console.log(`  (parted on ${name})`);
        }
      }
      check(
        parted === 0,
        "both scans agree on every reachable state",
        `${states.length} states`,
      );
      check(
        test.webviewNeedsPatching(pristineJs) === true &&
          test.webviewNeedsPatching(full) === false,
        "pristine needs patching, fully patched does not",
      );
    }

    console.log("\nvalidity (fully patched bundles still parse)");
    for (const filename of Object.keys(pristine).filter((f) =>
      f.endsWith(".js"),
    )) {
      const target = path.join(dist, filename);
      try {
        execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
        check(true, `node --check ${filename}`);
      } catch (err) {
        check(
          false,
          `node --check ${filename}`,
          String(err.stderr || err.message).trim(),
        );
      }
    }

    // The state a Kilo re-minify leaves the extension in: withhold exactly the
    // variants this build matches, so nothing shipped recognizes it, and
    // require the derivation layer to answer with the same bytes the reviewed
    // release shipped. This is the claim that a pure re-minify needs no
    // release, checked per build rather than argued.
    // The extractor that decides which literal nominates candidate sites. The
    // retarget equivalence proof covers it for the shapes that exist today, on
    // the builds it is run against. These pin what it has to get right for a
    // shape nobody has written yet, on a build nobody has reviewed: a literal
    // counted as certain when it is not sends the scan to places some matches
    // never are, and the rule then reports "no match" where it fits.
    //
    // The first seven are the ways it went wrong while being written. The rest
    // are what an earlier version got wrong without it showing, because the
    // runs it misread (the text of an optional group, the `?:` that opens a
    // group, the second digit of `\11`) were never the longest in a shape.
    console.log("\nshape literal extraction (what prefilters a scan)");
    {
      const cases = [
        [`(${ID})\\.key==="Escape"`, '.key==="Escape"', "a plain run"],
        [
          `(${ID})=!!(${ID})\\?\\.closest\\("textarea\\.prompt-input"\\)`,
          '?.closest("textarea.prompt-input")',
          "escaped punctuation is literal (\\? is a ?), a class body is not",
        ],
        [`ab?cdef`, "cdef", "a quantified character is dropped from its run"],
        [`abcd\\d+efghi`, "efghi", "a character class escape ends the run"],
        [`(${ID})x\\1yzwv`, "yzwv", "a backreference ends the run"],
        [`ab{2,3}cdefg`, "cdefg", "a counted quantifier ends the run"],
        [`(${ID})`, "", "an all-placeholder shape yields nothing"],
        [
          `prefix(?:optional)?suffix`,
          "prefix",
          "a run inside an optional group is not certain",
        ],
        [
          `abcd(?:efghij)*klmno`,
          "klmno",
          "nor inside a group that may repeat zero times",
        ],
        [
          `abcd(?:efghij){0,3}klmno`,
          "klmno",
          "nor inside one counted from zero",
        ],
        [
          `abc(?:defghi)+jk`,
          "defghi",
          "a group that must match once keeps its runs",
        ],
        [
          `ab(?:cdefgh|ij)klmn`,
          "klmn",
          "either side of an alternation may be the one that matched",
        ],
        [
          `abcdef|ghijkl`,
          "",
          "an alternation at the top level leaves nothing certain",
        ],
        [
          `abcd(?!efghijk)`,
          "abcd",
          "a negative lookahead names text that must be absent",
        ],
        [`(?<!abcdefg)hijk`, "hijk", "and so does a negative lookbehind"],
        [
          `abcd(?=efghijk)`,
          "abcd",
          "a lookahead names text beside the match, not in it",
        ],
        [
          `(?:abcd)e`,
          "abcd",
          "the characters that spell a group's kind are not text",
        ],
        [`(?<name>abcd)e`, "abcd", "nor is a group's name"],
        [
          `a(?:bcdef(?:ghijklm)?no)+p`,
          "bcdef",
          "what is certain is settled group by group",
        ],
        [
          `abcd\\11efgh`,
          "abcd",
          "a backreference is read whole, however many digits",
        ],
        [
          `ab\\ncdef`,
          "ab\ncdef",
          "an escape for one fixed character is that character",
        ],
        [
          `abcd\\x41efgh`,
          "abcd",
          "a character written by its code leaves no digits behind",
        ],
        [`abcd)efgh`, "", "a source it cannot follow yields nothing"],
      ];
      for (const [source, want, why] of cases) {
        const got = longestLiteral(source);
        check(
          got === want,
          `${why}`,
          `wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
        );
      }

      // What a wrong literal costs, run rather than argued. Each text holds
      // one match that does not contain the run the earlier extractor chose
      // (the optional group is absent, the other alternative was taken, the
      // forbidden text is not there), far enough from either end for the scan
      // to be prefiltered. The prefiltered scan has to find what the full one
      // finds.
      const far = "_".repeat(20000);
      const hidden = [
        [
          `prefix(?:optional)?suffix`,
          "prefixsuffix",
          "a match without its optional group is still found",
        ],
        [
          `ab(?:cdefgh|ij)klmn`,
          "abijklmn",
          "so is one that took the other alternative",
        ],
        [
          `abcd(?!wxyzwxyz)`,
          "abcd.",
          "and one that a negative lookahead allows",
        ],
      ];
      for (const [source, text, why] of hidden) {
        const hay = far + text + far;
        const found = (matches) =>
          JSON.stringify(matches.map((m) => [m.index, m[0]]));
        const quick = found(findAll(hay, source));
        const full = found(withoutPrefilter(() => findAll(hay, source)));
        check(
          quick === full && JSON.parse(full).length === 1,
          why,
          `prefiltered ${quick}, full scan ${full}`,
        );
      }

      const sample = randomShapeViolations(2000, 20261001);
      check(
        sample.violations.length === 0 &&
          sample.literals > 1000 &&
          sample.matches > 100000,
        `${sample.shapes} random shapes: every one of ${sample.matches} matches contains the literal drawn from its source`,
        sample.violations.length > 0
          ? `${sample.violations.length} do not, first ${JSON.stringify(sample.violations[0])}`
          : `only ${sample.literals} shapes gave a literal and ${sample.matches} matches were seen`,
      );
    }

    console.log("\nderivation (the release that need not happen)");
    {
      const version = source.version;
      const box = path.join(sandbox, "derive");
      fs.mkdirSync(box, { recursive: true });
      for (const [name, body] of Object.entries(pristine)) {
        fs.writeFileSync(path.join(box, name), body);
      }

      // The same shape runPatch uses: plan every file, then write, so the
      // record in webview.js can cover kiloclaw.js too.
      const plan = (mode) => {
        const record = test.readDerivedRecordAt(box);
        return test.PATCHES.filter(
          (fp) => pristine[fp.filename] !== undefined,
        ).map((fp) => ({
          fp,
          fpath: path.join(box, fp.filename),
          withheld: fp.patches.filter(
            (p) => !pristine[fp.filename].includes(p.original),
          ),
          ...test.patchSetFor(
            fp.filename,
            path.join(box, fp.filename),
            version,
            fp.patches.filter(
              (p) => !pristine[fp.filename].includes(p.original),
            ),
            mode,
            record,
          ),
        }));
      };
      const write = (plans, mode) => {
        const next =
          mode === "apply"
            ? plans.flatMap((p) => [...p.remembered, ...p.derived])
            : [];
        const writer = (filename) =>
          filename === test.CHAT_SCRIPT_FILE
            ? (m) => test.withDerivedRecord(m, next)
            : undefined;
        return plans.map((p) =>
          mode === "apply"
            ? test.applyPatches(
                p.fpath,
                p.patches,
                p.derived.length > 0
                  ? test.derivedGuard(p.fp.filename, p.derived)
                  : undefined,
                writer(p.fp.filename),
              )
            : test.restorePatches(p.fpath, p.patches, writer(p.fp.filename)),
        );
      };

      const first = plan("apply");
      let derivedTotal = 0;
      for (const p of first) {
        derivedTotal += p.derived.length;
        const covering = p.fp.patches.filter((x) =>
          pristine[p.fp.filename].includes(x.original),
        );
        const byFeature = new Map(p.derived.map((d) => [d.feature, d]));
        for (const shipped of covering) {
          if (!test.DERIVABLE.includes(shipped.feature)) continue;
          const d = byFeature.get(shipped.feature);
          // A rule whose anchor was widened also reports the narrower
          // pre-widening form, and entries older than that widening ship the
          // narrow one: perm-keys on 7.4.17 through 7.4.20 is the live case.
          // Both describe the same edit, so accept either, which is the
          // fallback retarget's covered-check already applies. Comparing only
          // the wide form reports those builds as a difference that is not one.
          const legacy = RULES.find(
            (r) => r.key === shipped.feature && r.file === p.fp.filename,
          )?.derive(pristine[p.fp.filename])?.legacy;
          const same = (x) =>
            x !== undefined &&
            x.original === shipped.original &&
            x.patched === shipped.patched;
          check(
            d !== undefined && (same(d) || same(legacy)),
            `${p.fp.filename}: ${shipped.feature} derives the shipped bytes`,
            d === undefined ? "nothing derived" : "derived text differs",
          );
        }
      }
      const applied = write(first, "apply");
      check(derivedTotal > 0, `${derivedTotal} pattern(s) derived in total`);
      for (const [i, p] of first.entries()) {
        const covering = p.fp.patches.filter((x) =>
          pristine[p.fp.filename].includes(x.original),
        );
        check(
          applied[i].applied.length === covering.length,
          `${p.fp.filename}: derived apply lands ${covering.length} edit(s)`,
          `applied ${applied[i].applied.length}`,
        );
      }

      // The record has to be in the bundle, not anywhere this process holds.
      const onDisk = test.readDerivedRecordAt(box);
      check(
        onDisk.length === derivedTotal,
        `the bundle carries all ${derivedTotal} derived pattern(s)`,
        `found ${onDisk.length}`,
      );
      // One record in webview.js covers every file, which is only observable
      // on a build that ships a second one. Kilo dropped kiloclaw.js in 7.7.3,
      // so there the claim has nothing to demonstrate rather than being false.
      if (pristine["kiloclaw.js"] !== undefined) {
        check(
          onDisk.some((p) => p.filename === "kiloclaw.js"),
          "webview.js's record covers kiloclaw.js too",
        );
      }
      const rawJs = fs.readFileSync(path.join(box, "webview.js"), "utf8");
      // The record is base64 precisely so it does not reproduce the patched
      // text: a second literal copy would break both the guard's
      // "landed exactly once" check and the replace() Restore does.
      check(
        onDisk.every(
          (p) =>
            rawJs.split(p.patched).length ===
            (p.filename === "webview.js" ? 2 : 1),
        ),
        "the record reproduces no patched text verbatim",
      );

      for (const filename of Object.keys(pristine).filter((f) =>
        f.endsWith(".js"),
      )) {
        try {
          execFileSync(
            process.execPath,
            ["--check", path.join(box, filename)],
            { stdio: "pipe" },
          );
          check(true, `node --check ${filename} (derived)`);
        } catch (err) {
          check(
            false,
            `node --check ${filename} (derived)`,
            String(err.stderr || err.message).trim(),
          );
        }
      }

      const afterApply = Object.keys(pristine).map((n) =>
        fs.readFileSync(path.join(box, n), "utf8"),
      );
      write(plan("apply"), "apply");
      check(
        Object.keys(pristine).every(
          (n, i) =>
            fs.readFileSync(path.join(box, n), "utf8") === afterApply[i],
        ),
        "re-applying a derived patch set changes nothing",
      );

      // Restore reads the record out of the bundle, which is the whole point
      // of putting it there: nothing this process remembers is involved.
      write(plan("restore"), "restore");
      for (const [name, body] of Object.entries(pristine)) {
        if (!name.endsWith(".js")) continue;
        check(
          fs.readFileSync(path.join(box, name), "utf8") === body,
          `${name}: pristine again after restoring a derived patch set`,
        );
      }
      check(
        test.readDerivedRecordAt(box).length === 0,
        "restore takes the record away with the edits",
      );

      // What a launch sees in the two states derivation creates.
      const live = test.PATCHES.find((g) => g.filename === "webview.js");
      const kept = live.patches.slice();
      const withheldJs = kept.filter(
        (p) => !pristine["webview.js"].includes(p.original),
      );
      try {
        live.patches.splice(0, live.patches.length, ...withheldJs);
        const fresh = test.deriveFor(
          "webview.js",
          pristine["webview.js"],
          version,
          withheldJs,
        );
        let derivedJs = pristine["webview.js"];
        for (const d of fresh)
          derivedJs = replaceLiteral(derivedJs, d.original, d.patched);
        derivedJs = test.withDerivedRecord(derivedJs, fresh);

        check(
          test.webviewNeedsPatching(pristine["webview.js"]) === true,
          "an unrecognized build reports that it needs patching",
        );
        const started = process.hrtime.bigint();
        const settled = test.webviewNeedsPatching(
          derivedJs,
          test
            .recordedFor(
              test.readDerivedRecord(derivedJs),
              "webview.js",
              derivedJs,
            )
            .map((p) => ({
              feature: p.feature,
              original: p.original,
              patched: p.patched,
              description: p.description,
            })),
        );
        const launchMs = Number(process.hrtime.bigint() - started) / 1e6;
        check(
          settled === false,
          "a derivation-patched build reports nothing left to do",
        );
        check(
          launchMs < 200,
          `that reading costs ${launchMs.toFixed(0)} ms, not a full-array scan`,
        );
      } finally {
        live.patches.splice(0, live.patches.length, ...kept);
      }
    }

    // The commands themselves, in the order they really take, against a copy
    // laid out like an install. Everything above exercises the pieces. These
    // are the three entry points a user has (a launch, Apply Patches, Restore
    // Originals), which is where the pieces are put in an order, and an order
    // is what two shipped defects turned on.
    //
    // Restore Originals wrote reverted derivations back into the bundle,
    // because it restores the core files before it turns the bonuses off, and
    // the harness restored the other way round.
    //
    // And a kb-patch build installed over the same version never ran its
    // launch check, because the fingerprint that lets a launch skip it knew
    // kb-patch by its version alone. The buttons that build could newly write
    // stayed unwritten, Apply Patches did not write them either (it left the
    // bonuses to a launch), and Show Status asked for a restart that changed
    // nothing. Nothing here could see that, since nothing here took a launch.
    console.log("\ncommands in their own order (launch, Apply, Restore)");
    {
      const version = source.version;
      const root = path.join(sandbox, "commands");
      const box = path.join(root, `kilocode.kilo-code-${version}-harness`);
      const boxDist = path.join(box, "dist");
      const layOut = () => {
        fs.mkdirSync(boxDist, { recursive: true });
        for (const [name, body] of Object.entries(pristine)) {
          fs.writeFileSync(path.join(boxDist, name), body);
        }
      };
      // Two builds of kb-patch at one version: the same files, rebuilt.
      const build = (name, body) => {
        const dir = path.join(root, name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "extension.js"), body);
        fs.writeFileSync(path.join(dir, "rules.js"), "// rules\n");
        return dir;
      };
      const buildA = build("build-a", "// the build that recorded it\n");
      const buildB = build("build-b", "// the same version, built again\n");

      const memory = new Map();
      test.setExtensionContext({
        extension: { packageJSON: { version: "0.0.0" } },
        extensionUri: { fsPath: path.join(root, "kb", "x") },
        globalState: {
          get: (k, d) => (memory.has(k) ? memory.get(k) : d),
          update: (k, v) => {
            if (v === undefined) memory.delete(k);
            else memory.set(k, v);
            return Promise.resolve();
          },
        },
      });
      const defaults = Object.fromEntries(test.BONUS_SETTING_DEFAULTS);
      const bonusesOn = {
        ...defaults,
        addAttachFileButton: true,
        chatMathRendering: true,
        chatRawMarkdownButton: true,
      };
      // The three bundle splices: the name a reconcile pass reports each under,
      // the rule key, the words its status row carries, and the text only its
      // edit puts in the bundle.
      const SPLICES = [
        {
          name: "attach",
          key: "attach-button",
          row: "Prompt toolbar",
          marker: 'selectMention({type:"file-picker"}',
        },
        {
          name: "math",
          key: "math-rendering",
          row: "math",
          marker: 'name:"kbpKatexInlineDollar"',
        },
        {
          name: "rawMarkdown",
          key: "raw-markdown",
          row: "markdown source",
          marker: '"data-slot":"kbp-raw-markdown-toggle"',
        },
      ];
      const jsNow = () =>
        fs.readFileSync(path.join(boxDist, test.CHAT_SCRIPT_FILE), "utf8");
      const rows = () => {
        const all = test.computeBonusStatus(box);
        return Object.fromEntries(
          SPLICES.map((s) => [
            s.name,
            all.find((b) => b.label.includes(s.row))?.state,
          ]),
        );
      };
      const describe = () => JSON.stringify(rows());
      const onDisk = (s) => countOccurrences(jsNow(), s.marker);
      const restart = () => test.forgetSession();

      const keptCore = test.PATCHES.map((fp) => fp.patches.slice());
      const keptBonus = test.DERIVABLE_BONUSES.map((k) =>
        test.BONUS_VARIANTS[k].slice(),
      );
      try {
        // What this build can carry at all, by a reviewed entry or by its own
        // bytes. Every supported build carries all three, and the checks below
        // still ask, so a build that lost one reads "unavailable" here instead
        // of failing for a reason that has nothing to do with the commands.
        const wanted = SPLICES.filter(
          (s) =>
            test.shippedBonusVariant(pristineJs, s.key) !== undefined ||
            test.deriveBonus(s.key, pristineJs) !== undefined,
        );
        const rowsAre = (state, among = SPLICES) => {
          const now = rows();
          return among.every(
            (s) => now[s.name] === (wanted.includes(s) ? state : "unavailable"),
          );
        };
        const written = (among = SPLICES) =>
          among.every((s) => onDisk(s) === (wanted.includes(s) ? 1 : 0));

        layOut();
        shim.setConfig(bonusesOn);
        restart();
        check(
          rowsAre("unapplied"),
          'before anything runs, each bonus asked for reads "unapplied"',
          describe(),
        );
        const first = test.startupPass(box, buildA);
        check(
          first.settled === false && first.needsPatching === true,
          "a first launch runs the full check and finds work for Apply",
        );
        check(
          written() &&
            SPLICES.every((s) => first.bonuses[s.name] === wanted.includes(s)),
          "having written every bonus the settings ask for",
          describe(),
        );
        check(
          test.isSettled(box, buildA) === false,
          "and it records nothing while Apply still has work",
        );
        await test.patchInstall(box, "apply", first.bonuses);
        check(
          test.computeStatus(boxDist).verdict === "fully patched",
          "Apply Patches leaves the install fully patched",
          `got "${test.computeStatus(boxDist).verdict}"`,
        );
        check(
          rowsAre("pending"),
          "the bonuses read pending, written by the session on screen",
          describe(),
        );
        restart();
        check(rowsAre("on"), "and on once the host has restarted", describe());
        check(
          test.startupPass(box).settled === true,
          "the next launch finds the install settled and runs nothing",
        );

        // The state the reported case starts from: the settings ask for the two
        // buttons, the bundle does not carry them, and the install is recorded
        // as settled. A kb-patch that could not yet write them on this Kilo
        // build leaves exactly that behind.
        const buttons = SPLICES.filter(
          (s) => s.name !== "math" && wanted.includes(s),
        );
        const leaveUnwritten = (ownDir) => {
          shim.setConfig({
            ...bonusesOn,
            addAttachFileButton: false,
            chatRawMarkdownButton: false,
          });
          test.reconcileBonuses(box);
          shim.setConfig(bonusesOn);
          restart();
          test.markSettled(box, ownDir);
        };
        if (buttons.length === 0) {
          console.log("  n/a   this build carries neither button");
        } else {
          leaveUnwritten(buildA);
          check(
            buttons.every((s) => onDisk(s) === 0) &&
              test.startupPass(box, buildA).settled === true,
            "buttons unwritten and the install recorded as settled: that build's launches skip the check",
          );
          check(
            rowsAre("unapplied", buttons) && rows().math === "on",
            'Show Status reads the buttons "unapplied", not as waiting for a restart',
            describe(),
          );
          const rebuilt = test.startupPass(box, buildB);
          check(
            rebuilt.settled === false &&
              buttons.every((s) => rebuilt.bonuses[s.name]) &&
              written(),
            "a rebuilt kb-patch at the same version runs the check and writes them",
            JSON.stringify(rebuilt),
          );
          check(
            rowsAre("pending", buttons),
            "they read pending until the restart its notification offers",
            describe(),
          );
          restart();
          check(
            test.startupPass(box, buildB).settled === true && rowsAre("on"),
            "after which its launches are settled and every row reads on",
            describe(),
          );

          // The other way out, for a launch that did skip the check.
          leaveUnwritten(undefined);
          check(
            test.startupPass(box).settled === true &&
              buttons.every((s) => onDisk(s) === 0),
            "on a launch that skipped the check the buttons are still unwritten",
          );
          await test.patchInstall(box, "apply");
          check(
            written(),
            "Apply Patches writes every bonus the settings ask for",
            describe(),
          );
          restart();
          check(
            rowsAre("on") && test.isSettled(box),
            "so what it records as settled has them written",
            describe(),
          );

          // A pass that could not write. Read-only stands in for whatever
          // stopped the write, which root would not be stopped by.
          if (typeof process.getuid === "function" && process.getuid() === 0) {
            console.log("  n/a   running as root, where no write fails");
          } else {
            leaveUnwritten(undefined);
            const target = path.join(boxDist, test.CHAT_SCRIPT_FILE);
            fs.chmodSync(target, 0o444);
            try {
              test.reconcileBonuses(box);
              test.markSettled(box);
            } finally {
              fs.chmodSync(target, 0o644);
            }
            check(
              buttons.every((s) => onDisk(s) === 0) &&
                test.isSettled(box) === false,
              "a pass that could not write is not recorded, and the earlier record goes with it",
            );
            restart();
            const retry = test.startupPass(box);
            check(
              retry.settled === false && written(),
              "so the next launch tries again, and writes",
              JSON.stringify(retry),
            );
            restart();
          }
        }

        // Restore Originals where nothing reviewed answered: the core edits and
        // every bonus derived, all of them named only by the record. The core
        // files are reversed first (taking the record block with them) and
        // each bonus reconciler is then handed the record as it stood before.
        // Until the reconcilers kept only entries whose edit is still on disk,
        // the math one wrote the reverted core entries back into the restored
        // bundle.
        for (const fp of test.PATCHES) {
          const body = pristine[fp.filename];
          if (body === undefined) continue;
          const keep = fp.patches.filter((p) => !body.includes(p.original));
          fp.patches.splice(0, fp.patches.length, ...keep);
        }
        for (const k of test.DERIVABLE_BONUSES) {
          const list = test.BONUS_VARIANTS[k];
          const keep = list.filter((v) => !pristineJs.includes(v.original));
          list.splice(0, list.length, ...keep);
        }
        layOut();
        memory.clear();
        shim.setConfig(bonusesOn);
        restart();
        const derivedLaunch = test.startupPass(box);
        await test.patchInstall(box, "apply", derivedLaunch.bonuses);
        const record = test.readDerivedRecordAt(boxDist);
        const recorded = record
          .filter((p) => test.DERIVABLE_BONUSES.includes(p.feature))
          .map((p) => p.feature);
        check(
          record.some((p) => test.DERIVABLE.includes(p.feature)) &&
            recorded.length > 0,
          `with every reviewed entry withheld, the record names core and bonus derivations (${recorded.join(", ")})`,
        );
        check(
          test.computeStatus(boxDist).verdict === "fully patched",
          "and the install reads fully patched by derivation alone",
          `got "${test.computeStatus(boxDist).verdict}"`,
        );
        await test.patchInstall(box, "restore");
        for (const [name, body] of Object.entries(pristine)) {
          check(
            fs.readFileSync(path.join(boxDist, name), "utf8") === body,
            `${name}: pristine after Restore Originals`,
          );
        }
        check(
          test.readDerivedRecordAt(boxDist).length === 0,
          "no record of reverted edits is written back",
        );
        const settings = shim.workspace.getConfiguration();
        check(
          test.BONUS_SETTING_DEFAULTS.every(
            ([key, off]) => settings.get(key, off) === off,
          ),
          "every bonus setting is back at its off value",
        );
        check(
          test.isSettled(box) === false,
          "and the install is no longer recorded as settled",
        );
      } finally {
        test.PATCHES.forEach((fp, i) =>
          fp.patches.splice(0, fp.patches.length, ...keptCore[i]),
        );
        test.DERIVABLE_BONUSES.forEach((k, i) =>
          test.BONUS_VARIANTS[k].splice(
            0,
            test.BONUS_VARIANTS[k].length,
            ...keptBonus[i],
          ),
        );
        shim.setConfig(defaults);
        test.setExtensionContext(undefined);
        restart();
      }
    }

    console.log("\nsettled fingerprint (what invalidates the launch shortcut)");
    {
      const memory = new Map();
      const ctx = (kbVersion) => ({
        extension: { packageJSON: { version: kbVersion } },
        extensionUri: { fsPath: path.join(sandbox, "kb", "x") },
        globalState: {
          get: (k, d) => (memory.has(k) ? memory.get(k) : d),
          update: (k, v) => {
            if (v === undefined) memory.delete(k);
            else memory.set(k, v);
            return Promise.resolve();
          },
        },
      });
      // A directory laid out like an install, so stat() has something to read
      // and moving a file cannot touch the real one.
      const fake = path.join(sandbox, "settled");
      fs.mkdirSync(path.join(fake, "dist"), { recursive: true });
      for (const name of ["webview.js", "kiloclaw.js", test.CHAT_STYLE_FILE]) {
        fs.writeFileSync(path.join(fake, "dist", name), `// ${name}\n`);
      }
      test.setExtensionContext(ctx("1.0.0"));
      shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
      try {
        test.markSettled(fake);
        check(
          test.isSettled(fake) === true,
          "a recorded install reads settled",
        );

        shim.setConfig({
          ...Object.fromEntries(test.BONUS_SETTING_DEFAULTS),
          chatMathRendering: true,
        });
        check(
          test.isSettled(fake) === false,
          "a bonus setting change invalidates it",
        );
        shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
        check(
          test.isSettled(fake) === true,
          "putting the setting back restores it",
        );

        test.setExtensionContext(ctx("1.0.1"));
        check(
          test.isSettled(fake) === false,
          "a kb-patch version change invalidates it",
        );
        test.setExtensionContext(ctx("1.0.0"));

        const target = path.join(fake, "dist", "webview.js");
        const before = fs.statSync(target);
        fs.appendFileSync(target, "// touched\n");
        check(
          test.isSettled(fake) === false,
          "a changed bundle invalidates it (a Kilo update)",
        );
        // Rewriting the same bytes does not bring the record back, because
        // mtimeMs carries sub-millisecond precision that utimes cannot
        // reproduce. That is the safe direction: the shortcut is given up and
        // the full check runs, rather than a changed install reading settled.
        fs.writeFileSync(target, "// webview.js\n");
        fs.utimesSync(target, before.atime, before.mtime);
        check(
          test.isSettled(fake) === false,
          "rewriting a bundle keeps it invalid, even byte-for-byte",
        );
        test.markSettled(fake);
        check(
          test.isSettled(fake) === true,
          "recording again after the write restores it",
        );

        // kb-patch is known by the files that hold its code, not by its
        // version alone: a build installed over the same version, which is how
        // a release is tested before its version is bumped, changes what the
        // reconcilers would write and leaves the version as it was.
        const own = path.join(sandbox, "own-build");
        fs.mkdirSync(own, { recursive: true });
        fs.writeFileSync(path.join(own, "extension.js"), "// extension\n");
        fs.writeFileSync(path.join(own, "rules.js"), "// rules\n");
        test.markSettled(fake, own);
        check(
          test.isSettled(fake, own) === true,
          "an install reads settled under the build that recorded it",
        );
        fs.writeFileSync(path.join(own, "extension.js"), "// built again\n");
        check(
          test.isSettled(fake, own) === false,
          "a rebuilt kb-patch at the same version invalidates it",
        );
        test.markSettled(fake, own);
        fs.writeFileSync(path.join(own, "rules.js"), "// rules, built again\n");
        check(
          test.isSettled(fake, own) === false,
          "and so does a rebuild of its rules alone",
        );
        fs.rmSync(path.join(own, "rules.js"));
        test.markSettled(fake, own);
        check(
          test.isSettled(fake, own) === false,
          "a build whose own files cannot be read is never recorded as settled",
        );
        check(
          test.ownBuildIdentity() !== undefined &&
            test.installFingerprint(fake).includes(test.ownBuildIdentity()),
          "the running build's own files are part of the fingerprint",
        );
        test.markSettled(fake);

        test.clearSettled();
        check(
          test.isSettled(fake) === false,
          "clearSettled invalidates it (what Restore does)",
        );

        // A file Kilo retired is accounted for by its absence, so the
        // shortcut survives on a build that does not ship it. Recorded and
        // re-read here rather than reasoned about, because getting this wrong
        // silently costs every launch on every such install the full check.
        const retired = path.join(fake, "dist", "kiloclaw.js");
        fs.rmSync(retired);
        test.markSettled(fake);
        check(
          test.isSettled(fake) === true,
          "an install without a retired file still settles",
        );
        fs.writeFileSync(retired, "// kiloclaw.js\n");
        check(
          test.isSettled(fake) === false,
          "that file coming back invalidates it",
        );
        fs.rmSync(retired);

        // Any other missing file is a state we make no claim about.
        fs.rmSync(path.join(fake, "dist", "webview.js"));
        test.clearSettled();
        test.markSettled(fake);
        check(
          test.isSettled(fake) === false,
          "an install missing a file we expect is never recorded as settled",
        );
      } finally {
        test.setExtensionContext(undefined);
        shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
      }
    }

    console.log("\neditor-title rename (the one bonus in Kilo's manifest)");
    // The manifest is read from VS Code's scanner cache at window startup, so
    // the rewrite takes the cache with it, for every profile. The fake user
    // data folder is laid out the way the extension finds it: from its own
    // global storage path.
    {
      const kilo = path.join(sandbox, "kilo");
      const manifest = path.join(kilo, "package.json");
      const userData = path.join(sandbox, "userdata");
      const cacheDir = path.join(userData, "CachedProfilesData");
      const caches = ["__default__profile__", "p1"].map((profile) =>
        path.join(cacheDir, profile, "extensions.user.cache"),
      );
      const keep = path.join(cacheDir, "p1", "extensions.builtin.cache");
      const layOut = (title) => {
        fs.mkdirSync(kilo, { recursive: true });
        const commands = [{ command: "kilo-code.new.openInTab", title }];
        fs.writeFileSync(
          manifest,
          JSON.stringify({ contributes: { commands } }, null, 2),
        );
        for (const file of [...caches, keep]) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, "{}");
        }
      };
      const storageAt = (...rel) => ({
        globalStorageUri: {
          fsPath: path.join(userData, ...rel, "zeyutang.kilo-code-kb-patch"),
        },
      });
      const carries = (title) =>
        fs.readFileSync(manifest, "utf8").includes(JSON.stringify(title));
      const cachesGone = () => caches.every((f) => !fs.existsSync(f));
      const cachesStay = () => caches.every((f) => fs.existsSync(f));
      try {
        layOut(test.OPEN_IN_TAB_ORIGINAL);
        shim.setConfig({ renameOpenInTab: true });
        test.setExtensionContext(storageAt("User", "globalStorage"));
        check(
          test.reconcileOpenInTabTitle(kilo) === true &&
            carries(test.OPEN_IN_TAB_RENAMED),
          "the rename rewrites the manifest",
        );
        check(cachesGone(), "every profile's manifest cache goes with it");
        check(fs.existsSync(keep), "other cache files stay");
        check(
          test.reconcileOpenInTabTitle(kilo) === false,
          "rewriting again changes nothing, with the caches already gone",
        );

        layOut(test.OPEN_IN_TAB_ORIGINAL);
        test.setExtensionContext(
          storageAt("User", "profiles", "abc", "globalStorage"),
        );
        check(
          test.reconcileOpenInTabTitle(kilo) === true && cachesGone(),
          "a non-default profile's storage path finds the same caches",
        );

        layOut(test.OPEN_IN_TAB_ORIGINAL);
        test.setExtensionContext(storageAt("elsewhere"));
        check(
          test.reconcileOpenInTabTitle(kilo) === true && cachesStay(),
          "an unrecognized storage layout still rewrites, deleting nothing",
        );

        layOut(test.OPEN_IN_TAB_RENAMED);
        shim.setConfig({ renameOpenInTab: false });
        test.setExtensionContext(undefined);
        check(
          test.reconcileOpenInTabTitle(kilo) === true &&
            carries(test.OPEN_IN_TAB_ORIGINAL) &&
            cachesStay(),
          "turning it off restores Kilo's title; no context, no deletion",
        );
      } finally {
        test.setExtensionContext(undefined);
        shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
      }
    }

    console.log("\nzero leakage (restore returns the file to pristine)");
    // Every bonus at its off value, which is what Restore Originals writes.
    shim.setConfig(Object.fromEntries(test.BONUS_SETTING_DEFAULTS));
    test.reconcileAttachFileButton(sandbox);
    test.reconcileMathRendering(sandbox);
    test.reconcileRawMarkdownToggle(sandbox);
    test.reconcileChatStyle(sandbox, coreOff);
    test.reconcileChatScript(sandbox, false);
    for (const fp of test.PATCHES) {
      if (pristine[fp.filename] === undefined) continue;
      test.restorePatches(path.join(dist, fp.filename), fp.patches);
    }
    for (const [filename, original] of Object.entries(pristine)) {
      const restored = fs.readFileSync(path.join(dist, filename), "utf8");
      check(
        restored === original,
        `${filename}: byte-identical to pristine after restore`,
      );
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  return failures === 0 ? 0 : 1;
}

// Async because Restore Originals is: it writes the bonus settings back before
// it touches a file, and the commands section runs it as the command does.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`verify: ${err.message}`);
    process.exitCode = 2;
  },
);
