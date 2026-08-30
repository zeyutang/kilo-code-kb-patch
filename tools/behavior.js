#!/usr/bin/env node
// Run the chat-history patch and prove what it does, not just where it lands.
//
//   node tools/behavior.js [--ext <path to kilocode.kilo-code-*>]
//   node tools/behavior.js --vsix <path to a Kilo Code .vsix>
//
// Every other check in this harness is textual: retarget proves the pattern is
// the one this build wants, verify proves it applies uniquely, reverses cleanly
// and still parses. None of that can see a semantic dependency, and the 7.5.4
// retarget found one the hard way (a caption calling an i18n key Kilo had
// dropped, invisible for five releases). chat-history has the same exposure and
// worse: its edit passes a synthetic caret into Kilo's own boundary gate, so its
// correctness rests on how that gate reads its arguments. If Kilo ever stops
// clamping the caret, or gates on something else, the pattern still derives,
// still applies, still parses, and the chord silently stops recalling anything.
//
// So this runs the real code. Kilo's whole prompt-history module (cap, storage
// key, loader, saver, caret gate, dedupe helpers, navigator factory) is one
// contiguous region of the bundle and is sliced verbatim; only localStorage and
// Solid's createSignal are stubbed. The handler statement is sliced verbatim
// too, in both its shipped-original and shipped-patched forms, and the two are
// driven side by side through a table of keystrokes.
//
// What each outcome means:
//   handled       the handler consumed the key and rewrote the draft
//   guard-return  Kilo's own selection guard stopped it, without preventDefault
//   fell-through  the key reaches the handler's later branches, so the
//                 platform's caret gesture survives
const path = require("path");
const { loadExtension } = require("./lib/load");
const { resolveBundleSource, assertPristine } = require("./lib/bundle");
const { RULES, ID, esc } = require("./lib/rules");

let failures = 0;
function check(condition, label, detail) {
  if (condition) console.log(`  ok    ${label}`);
  else {
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

// Brace-walk from an anchor offset to the end of the enclosing {...}.
function block(content, at) {
  let depth = 0;
  let started = false;
  for (let i = at; i < content.length; i++) {
    if (content[i] === "{") {
      depth++;
      started = true;
    } else if (content[i] === "}") {
      depth--;
      if (started && depth === 0) return content.slice(at, i + 1);
    }
  }
  throw new Error(`unbalanced braces from offset ${at}`);
}

// The history module, as raw bytes, plus the two names the runner has to bind
// from inside it: the factory and Solid's createSignal.
function historyModule(content) {
  const keyAt = content.indexOf('"kilo.prompt-history.v1"');
  if (keyAt === -1) throw new Error("no prompt-history storage key in this build");
  const start = content.lastIndexOf("var ", keyAt);
  const navAt = content.indexOf("return{navigate:", keyAt);
  if (navAt === -1) throw new Error("no navigate() export in the history module");

  // The factory's own reset() is declared before the returned object literal, so
  // walk back through declarations until one's body actually encloses it.
  let factoryAt = navAt;
  for (;;) {
    factoryAt = content.lastIndexOf("function ", factoryAt - 1);
    if (factoryAt === -1 || factoryAt < start) {
      throw new Error("no declaration enclosing navigate()");
    }
    if (factoryAt + block(content, factoryAt).length > navAt) break;
  }

  const source = content.slice(start, factoryAt) + block(content, factoryAt);
  const factory = /^function (\w+)\(/.exec(content.slice(factoryAt))[1];
  // The factory opens with the index signal, which names createSignal for us.
  const signal = /let\[\w+,\w+\]=(\w+)\(-1\)/.exec(source)?.[1];
  if (!signal) throw new Error("could not bind createSignal from the factory");
  return { source, factory, signal };
}

// A callable copy of one keydown handler, closed over a live history navigator.
function runner(module_, statement, symbols, tailSymbols) {
  const { setter, resize } = tailSymbols;
  const src = `
"use strict";
let __storage = {};
const localStorage = {
  getItem: (k) => __storage[k] ?? null,
  setItem: (k, v) => { __storage[k] = v; },
};
const console = { warn: () => {}, log: () => {} };
const ${module_.signal} = (init) => {
  let v = init;
  return [() => v, (n) => (v = typeof n === "function" ? n(v) : n)];
};
${module_.source}
return (seed, draft) => {
  const ${symbols.history} = ${module_.factory}();
  ${symbols.history}.seed(seed);
  let text = draft;
  const ${symbols.text} = () => text;
  const ${setter} = (v) => { text = v; };
  const ${resize} = () => {};
  const ${symbols.textarea} = {
    value: draft, selectionStart: 0, selectionEnd: 0,
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
  };
  let prevented = false;
  let ${symbols.event} = null;
  return (press) => {
    ${symbols.textarea}.value = text;
    ${symbols.textarea}.selectionStart = press.caret;
    ${symbols.textarea}.selectionEnd = press.selectionEnd ?? press.caret;
    prevented = false;
    ${symbols.event} = {
      key: press.key,
      metaKey: !!press.meta, ctrlKey: !!press.ctrl,
      altKey: !!press.alt, shiftKey: !!press.shift,
      preventDefault() { prevented = true; },
    };
    const outcome = (() => {
      ${statement}
      return "fell-through";
    })() ?? "guard-return";
    return { outcome, prevented, text, caret: ${symbols.textarea}.selectionStart };
  };
};`;
  return new Function(src)();
}

const DRAFT = "line one\nline two";
// seed() pushes in reverse, so the last entry here is the most recent send.
const SENT = ["first message", "second message", "third message"];

// stock: what Kilo does. patched: what it must do instead. The pairing is the
// point, so a build where Kilo changed its own behavior shows up as a stock
// column that no longer matches.
const CASES = [
  {
    label: "bare Up, caret mid-draft",
    press: { key: "ArrowUp", caret: 4 },
    stock: "fell-through",
    patched: "fell-through",
  },
  {
    label: "bare Up, caret at start",
    press: { key: "ArrowUp", caret: 0 },
    stock: "handled",
    patched: "fell-through",
  },
  {
    label: "bare Down, caret at end",
    press: { key: "ArrowDown", caret: DRAFT.length },
    stock: "fell-through",
    patched: "fell-through",
  },
  {
    label: "Cmd+Up, caret mid-draft",
    press: { key: "ArrowUp", caret: 4, meta: true },
    stock: "fell-through",
    patched: "handled",
  },
  {
    label: "Cmd+Up, caret at start",
    press: { key: "ArrowUp", caret: 0, meta: true },
    stock: "fell-through",
    patched: "handled",
  },
  {
    label: "Ctrl+Up, caret mid-draft",
    press: { key: "ArrowUp", caret: 4, ctrl: true },
    stock: "fell-through",
    patched: "handled",
  },
  {
    label: "Cmd+Up with a selection",
    press: { key: "ArrowUp", caret: 2, selectionEnd: 6, meta: true },
    stock: "fell-through",
    patched: "guard-return",
  },
  {
    label: "Cmd+Shift+Up",
    press: { key: "ArrowUp", caret: 4, meta: true, shift: true },
    stock: "fell-through",
    patched: "fell-through",
  },
  {
    label: "Cmd+Alt+Up",
    press: { key: "ArrowUp", caret: 4, meta: true, alt: true },
    stock: "fell-through",
    patched: "fell-through",
  },
  {
    label: "Cmd+Down, nothing to go forward to",
    press: { key: "ArrowDown", caret: 2, meta: true },
    stock: "fell-through",
    patched: "fell-through",
  },
];

// Walking back then forward must return the draft Kilo stashed on the way out.
const WALK = [
  { key: "ArrowUp", text: "third message" },
  { key: "ArrowUp", text: "second message" },
  { key: "ArrowDown", text: "third message" },
  { key: "ArrowDown", text: "my draft" },
];

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log("usage: node tools/behavior.js [--ext <path> | --vsix <path>]");
    return 0;
  }

  const test = loadExtension();
  const source = resolveBundleSource(test, args);
  console.log(
    `Kilo Code v${source.version}\n  ${source.label}` +
      `${source.kind === "vsix" ? " (vsix, pristine)" : ""}\n`
  );
  assertPristine(source.bundles);

  const content = source.bundles["webview.js"];
  if (content === undefined) throw new Error("no webview.js in this source");

  const rule = RULES.find((r) => r.key === "chat-history");
  const derived = rule.derive(content);
  if (!derived.original) {
    console.log(`  FAIL  chat-history does not derive here: ${JSON.stringify(derived)}`);
    return 1;
  }
  const symbols = derived.symbols;

  // Exercise what ships, not what the rule rebuilds, since the shipped entry is
  // what applies on a user's machine. retarget compares the two; if they have
  // drifted, say so here rather than testing a pattern nobody runs.
  const entry = test.PATCHES.find((f) => f.filename === "webview.js").patches.find(
    (p) => p.feature === "chat-history" && content.includes(p.original)
  );
  if (!entry) {
    console.log("  FAIL  no shipped chat-history entry matches this build");
    return 1;
  }
  check(
    entry.original === derived.original,
    "the entry that applies here is the one the shape rule derives",
    "shipped and derived anchors differ; run retarget"
  );

  const module_ = historyModule(content);
  const stockStatement = block(content, content.indexOf(entry.original));
  const patchedBundle = content.replace(entry.original, entry.patched);
  const patchedStatement = block(patchedBundle, patchedBundle.indexOf(entry.patched));

  // Past the anchor the statement binds two more locals, the text setter and the
  // auto-resize. Every interpolated symbol is escaped: "$e" is a real spelling.
  const tail = new RegExp(
    `if\\(${esc(symbols.result)}!==null\\)\\{if\\(${esc(symbols.event)}\\.preventDefault\\(\\),` +
      `(${ID})\\(${esc(symbols.result)}\\),${esc(symbols.textarea)}\\)\\{` +
      `${esc(symbols.textarea)}\\.value=${esc(symbols.result)},(${ID})\\(\\)`
  ).exec(patchedStatement);
  if (!tail) {
    console.log("  FAIL  could not bind the setter/resize locals from the statement tail");
    return 1;
  }
  const tailSymbols = { setter: tail[1], resize: tail[2] };

  // A bare `return` (Kilo's selection guard) yields undefined from the wrapper,
  // which the runner reports as "guard-return"; every other exit is explicit.
  const label = (s) => s.replace(/return\}\}$/, 'return"handled"}}');
  const stock = runner(module_, label(stockStatement), symbols, tailSymbols);
  const patched = runner(module_, label(patchedStatement), symbols, tailSymbols);

  console.log(
    `keystrokes (event ${symbols.event}, history ${symbols.history}, ` +
      `text ${symbols.text}, textarea ${symbols.textarea})`
  );
  for (const c of CASES) {
    const before = stock(SENT, DRAFT)(c.press);
    const after = patched(SENT, DRAFT)(c.press);
    check(
      before.outcome === c.stock && after.outcome === c.patched,
      `${c.label}: ${c.stock} -> ${c.patched}`,
      `stock "${before.outcome}", patched "${after.outcome}"`
    );
  }

  console.log("\ndraft stash (one navigator, Cmd+Up twice then Cmd+Down twice)");
  const session = patched(SENT, "my draft");
  for (const step of WALK) {
    const r = session({ key: step.key, meta: true, caret: 3 });
    check(
      r.outcome === "handled" && r.text === step.text,
      `Cmd+${step.key.replace("Arrow", "")} recalls ${JSON.stringify(step.text)}`,
      `got "${r.outcome}" with ${JSON.stringify(r.text)}`
    );
  }

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  return failures === 0 ? 0 : 1;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
