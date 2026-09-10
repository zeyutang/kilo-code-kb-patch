#!/usr/bin/env node
// Run the patches whose correctness depends on Kilo's own code, and prove what
// they do rather than only where they land.
//
//   node tools/behavior.js [--ext <path to kilocode.kilo-code-*>]
//   node tools/behavior.js --vsix <path to a Kilo Code .vsix>
//
// Every other check in this harness is textual: retarget proves the pattern is
// the one this build wants, verify proves it applies uniquely, reverses cleanly
// and still parses. None of that can see a semantic dependency, and the 7.5.4
// retarget found one the hard way (a caption calling an i18n key Kilo had
// dropped, invisible for five releases). Three patches have that exposure, and
// all of them are driven here against the build's own code:
//
//   chat-history  its edit passes a synthetic caret into Kilo's own boundary
//                 gate, so its correctness rests on how that gate reads its
//                 arguments. If Kilo ever stops clamping the caret, or gates on
//                 something else, the pattern still derives, still applies,
//                 still parses, and the chord silently stops recalling
//                 anything. Kilo's whole prompt-history module (cap, storage
//                 key, loader, saver, caret gate, dedupe helpers, navigator
//                 factory) is one contiguous region of the bundle and is sliced
//                 verbatim; only localStorage and Solid's createSignal are
//                 stubbed. The handler statement is sliced verbatim too, in
//                 both its shipped-original and shipped-patched forms, and the
//                 two are driven side by side through a table of keystrokes.
//
//   math-render   its extensions only ever run if `marked` reaches them, which
//                 is decided by registration order inside marked's own use(),
//                 and adding them must not cost Kilo the `$$...$$` it already
//                 renders. So the bundled marked is sliced out and run, with
//                 Kilo's shipped extension pack registered on it in both forms.
//
//   mention-escape its edit writes the mention controller's own dead-query
//                 slot, so what Escape buys rests on how the controller's
//                 onInput reads that slot back. The controller's whole module
//                 is sliced and driven through a table of edits and keys in
//                 both forms.
//
// What each keystroke outcome means:
//   handled       the handler consumed the key and rewrote the draft
//   guard-return  Kilo's own selection guard stopped it, without preventDefault
//   fell-through  the key reaches the handler's later branches, so the
//                 platform's caret gesture survives
const path = require("path");
const { loadExtension } = require("./lib/load");
const { resolveBundleSource, assertPristine } = require("./lib/bundle");
const { RULES, MATH_RULE, ID, esc } = require("./lib/rules");

function findAll(content, source) {
  return [...content.matchAll(new RegExp(source, "g"))];
}

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
  if (args.ext && args.vsix)
    throw new Error("pass either --ext or --vsix, not both");
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
  if (keyAt === -1)
    throw new Error("no prompt-history storage key in this build");
  const start = content.lastIndexOf("var ", keyAt);
  const navAt = content.indexOf("return{navigate:", keyAt);
  if (navAt === -1)
    throw new Error("no navigate() export in the history module");

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

// --- math rendering ---------------------------------------------------------
// Same argument as above, one step further. retarget proves the splice lands in
// Kilo's katex extension pack and verify proves it applies once and reverses
// cleanly, but neither can see whether `marked` ever reaches the added
// tokenizers, nor whether adding them costs Kilo its own `$$...$$`. Both hinge on
// registration order inside marked's use(), which is a property of the bundled
// library rather than of the patch text.
//
// So this runs that library. marked is dependency-free and esbuild keeps it in
// one contiguous region, which slices out and compiles as-is; the katex helper
// region (the `$$` regexes, the render helper, and Kilo's `\(...\)` pack) is
// contiguous too, and only katex itself is stubbed, by the name the render
// helper calls it. Kilo's own extension pack is then registered in its shipped
// form and in its shipped-patched form, and the two parse the same markdown
// side by side.
//
// The bundle carries two copies of marked (the other belongs to streamdown), so
// the copy is chosen by which instance the katex pack is registered on rather
// than by taking the first match.

// The marked instance Kilo registers its katex pack on, which is what tells the
// two bundled copies apart.
function markedInstance(content) {
  const init = new RegExp(
    `let (${ID})=(${ID})\\.use\\((${ID}),\\{renderer:\\{link\\(\\{href:`,
  ).exec(content);
  if (!init)
    throw new Error("no marked.use() call with Kilo's renderer overrides");
  return init[2];
}

// That copy of marked, as raw bytes. The tail is the re-export block the module
// ends with; the head is the last defaults factory declared before it.
function markedModule(content, instance) {
  const tail = new RegExp(
    `${esc(instance)}\\.parse=${esc(instance)};var (${ID})=${esc(instance)}\\.options,` +
      `(${ID})=${esc(instance)}\\.setOptions,(${ID})=${esc(instance)}\\.use,` +
      `(${ID})=${esc(instance)}\\.walkTokens,(${ID})=${esc(instance)}\\.parseInline;` +
      `var (${ID})=(${ID})\\.parse,(${ID})=(${ID})\\.lex;`,
  ).exec(content);
  if (!tail) throw new Error("no marked re-export block for this instance");
  const end = tail.index + tail[0].length;

  const defaults = findAll(
    content.slice(0, end),
    `function (${ID})\\(\\)\\{return\\{async:!1,breaks:!1,extensions:null,gfm:!0,` +
      `hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null\\}\\}`,
  );
  if (defaults.length === 0)
    throw new Error("no marked defaults factory before the re-exports");
  const start = defaults[defaults.length - 1].index;
  return content.slice(start, end);
}

// The katex helpers Kilo declares around its packs: the two `$$` regexes, the
// render helper that wraps katex.renderToString, and the `\(...\)` pack. One
// contiguous run, from the block regex to the `\(...\)` renderer that ends it.
function katexHelpers(content) {
  const start = new RegExp(`(${ID})=/\\^\\\\\\$\\\\\\$\\\\n`).exec(content);
  if (!start) throw new Error("no $$-block regex in this build");
  const render = new RegExp(
    `function (${ID})\\((${ID}),(${ID})\\)\\{return\`<span dir="auto">` +
      `\\$\\{(${ID})\\.renderToString\\(\\2,\\3\\)\\}</span>\`\\}`,
  ).exec(content);
  if (!render) throw new Error("no katex render helper in this build");
  const tailShape = new RegExp(
    `function (${ID})\\((${ID})\\)\\{return ${esc(render[1])}\\(typeof \\2\\.text=="string"\\?\\2\\.text:"",` +
      `\\{displayMode:\\2\\.displayMode===!0,throwOnError:!1\\}\\)\\}`,
  ).exec(content);
  if (!tailShape) throw new Error("no inlineKatex renderer in this build");
  const inlinePack = new RegExp(
    `(${ID})=\\{extensions:\\[\\{name:"inlineKatex"`,
  ).exec(content);
  if (!inlinePack) throw new Error("no inlineKatex pack in this build");

  return {
    // `var` because the run starts mid-declaration-list in the bundle.
    source:
      "var " +
      content.slice(start.index, tailShape.index + tailShape[0].length),
    katex: render[4],
    inlinePack: inlinePack[1],
  };
}

// Kilo's doubleKatex pack as an object literal. `tail` is the entry's own
// original or patched text, which ends with the `]});` that closes the array
// and the use() call; dropping its last two characters leaves `...]}`.
function katexPack(content, tail) {
  const start = content.indexOf('{extensions:[{name:"doubleKatexBlock"');
  if (start === -1) throw new Error("no doubleKatex pack in this build");
  const at = content.indexOf(tail, start);
  if (at === -1) throw new Error("the pack tail is not in this content");
  return content.slice(start, at + tail.length - 2);
}

// A parse() closed over one registration of the two packs. marked's use()
// mutates the instance, so each side gets its own copy of the module.
function parser(module_, helpers, packSrc) {
  const src = `
"use strict";
const ${helpers.katex} = {
  renderToString(tex, opts) {
    return "<KATEX " + (opts.displayMode ? "display" : "inline") + ">" + tex + "</KATEX>";
  },
};
${module_}
${helpers.source}
const __instance = ${helpers.marked}.use(${helpers.inlinePack}, ${packSrc});
return (md) => __instance.parse(md);
`;
  return new Function(src)();
}

// Each case says how many pieces of math the stock parser renders and how many
// the patched one does, as "<inline>i<display>d". `keeps` is text that must
// survive verbatim, which is how the currency cases are asserted rather than
// hoped for.
const MATH_CASES = [
  { md: "inline $x^2$ here", stock: "0i0d", patched: "1i0d" },
  { md: "the $x$-axis and $y$-axis", stock: "0i0d", patched: "2i0d" },
  { md: "let $\\{x : x > 0\\}$ be a set", stock: "0i0d", patched: "1i0d" },
  { md: "inline $$x^2$$ here", stock: "0i1d", patched: "0i1d" },
  { md: "$$\nx^2\n$$", stock: "0i1d", patched: "0i1d" },
  { md: "inline \\(x^2\\) here", stock: "1i0d", patched: "1i0d" },
  { md: "\\[x^2\\]", stock: "0i0d", patched: "0i1d" },
  { md: "inline \\[x^2\\] here", stock: "0i0d", patched: "0i1d" },
  {
    md: "price is $5 and $10 total",
    stock: "0i0d",
    patched: "0i0d",
    keeps: "$5 and $10",
  },
  { md: "a $ b $ c", stock: "0i0d", patched: "0i0d", keeps: "a $ b $ c" },
  { md: "costs $20$30", stock: "0i0d", patched: "0i0d", keeps: "$20$30" },
  {
    md: "`$x$` in code",
    stock: "0i0d",
    patched: "0i0d",
    keeps: "<code>$x$</code>",
  },
  {
    md: "```\n$x$\n```",
    stock: "0i0d",
    patched: "0i0d",
    keeps: "$x$\n</code>",
  },
  { md: "$x\ny$ spans lines", stock: "0i0d", patched: "0i0d", keeps: "$x" },
];

function signature(html) {
  const inline = (html.match(/<KATEX inline>/g) ?? []).length;
  const display = (html.match(/<KATEX display>/g) ?? []).length;
  return `${inline}i${display}d`;
}

function runMath(test, content) {
  const rule = MATH_RULE.derive(content);
  if (!rule.original) {
    console.log(
      `  FAIL  math-rendering does not derive here: ${JSON.stringify(rule)}`,
    );
    failures++;
    return;
  }
  // Exercise what ships, not what the rule rebuilds.
  const entry = test.MATH_EXTENSIONS.find((m) => content.includes(m.original));
  if (!entry) {
    console.log("  FAIL  no shipped math-rendering entry matches this build");
    failures++;
    return;
  }
  check(
    entry.original === rule.original && entry.patched === rule.patched,
    "the math entry that applies here is the one the shape rule derives",
    "shipped and derived text differ; run retarget",
  );

  const instance = markedInstance(content);
  const module_ = markedModule(content, instance);
  const helpers = { ...katexHelpers(content), marked: instance };
  const stockPack = katexPack(content, entry.original);
  const patchedBundle = content.replace(entry.original, entry.patched);
  const patchedPack = katexPack(patchedBundle, entry.patched);

  const stock = parser(module_, helpers, stockPack);
  const patched = parser(module_, helpers, patchedPack);

  console.log(
    `markdown (marked ${instance}, katex ${helpers.katex}, ` +
      `render ${rule.symbols.render}, ${module_.length} bytes sliced)`,
  );
  for (const c of MATH_CASES) {
    const before = signature(stock(c.md));
    const afterHtml = patched(c.md);
    const after = signature(afterHtml);
    const kept = c.keeps === undefined || afterHtml.includes(c.keeps);
    check(
      before === c.stock && after === c.patched && kept,
      `${JSON.stringify(c.md)}: ${c.stock} -> ${c.patched}`,
      `stock ${before}, patched ${after}` +
        (kept
          ? ""
          : `, lost ${JSON.stringify(c.keeps)} from ${JSON.stringify(afterHtml)}`),
    );
  }
}

// --- mention menu Escape -----------------------------------------------------
// The mention-escape splice writes the controller's own dead-query slot, and
// what that buys depends on onInput consulting the slot the way it does now.
// The consult sits inside the anchor, so a rewrite of it reads as "missing",
// but a change to what the slot means, or to when onInput clears it, would
// leave the pattern deriving, applying and parsing while Escape went back to
// closing the menu for one keystroke. So the controller is run.
//
// Its module is one contiguous region of the bundle: the var statement that
// declares the trigger regex, the helper functions, and the factory whose
// returned object names mentionResults. Solid's createSignal, createEffect and
// onCleanup, the fuzzy matcher, the two mention constants declared just before
// the region, the timers and document.execCommand are stubbed, by the names
// the region binds them under. postMessage is recorded and never answered, so
// no search result ever settles a query on the tool's behalf: every close
// below is the keystroke's own doing, in the stock form and the patched one.

// The region, as raw bytes, plus the names the runner has to bind around it.
function mentionModule(content, test) {
  const trigger = content.indexOf(test.MENTION_SPACED_TRIGGER);
  if (trigger === -1)
    throw new Error("no spaced mention trigger in this build");
  const start = content.lastIndexOf("var ", trigger);
  const exportAt = content.indexOf("mentionResults:", trigger);
  if (exportAt === -1)
    throw new Error("no mentionResults export after the trigger");

  // Walk back through declarations until one's body encloses the export.
  let factoryAt = exportAt;
  for (;;) {
    factoryAt = content.lastIndexOf("function ", factoryAt - 1);
    if (factoryAt === -1 || factoryAt < start) {
      throw new Error(
        "no declaration enclosing the mention controller's exports",
      );
    }
    if (factoryAt + block(content, factoryAt).length > exportAt) break;
  }
  const source = content.slice(
    start,
    factoryAt + block(content, factoryAt).length,
  );
  const factory = /^function (\w+)\(/.exec(content.slice(factoryAt))[1];

  const bind = (label, re, haystack) => {
    const found = new RegExp(re).exec(haystack);
    if (!found)
      throw new Error(`could not bind ${label} for the mention controller`);
    return found[1];
  };
  return {
    source,
    factory,
    terminal: bind("the terminal constant", `var (${ID})="terminal",`, content),
    changes: bind(
      "the git-changes constant",
      `var (${ID})="git-changes",`,
      content,
    ),
    signal: bind(
      "createSignal",
      `let\\[${ID},${ID}\\]=(${ID})\\(new Set\\)`,
      source,
    ),
    effect: bind(
      "createEffect",
      `;(${ID})\\(\\(\\)=>\\{${ID}\\(\\)\\|\\|\\(`,
      source,
    ),
    cleanup: bind(
      "onCleanup",
      `;(${ID})\\(\\(\\)=>\\{${ID}\\(\\),${ID}&&clearTimeout`,
      source,
    ),
    fuzzy: bind("the fuzzy matcher", `(${ID})\\.default\\.single\\(`, source),
  };
}

// A live controller from one form of the module, driven the way the prompt
// component drives it: onInput after every edit, onKeyDown for a key, and
// selectMention for a row chosen from the menu (its execCommand splices the
// textarea the way the browser's would).
function mentionSession(module_) {
  const src = `
"use strict";
const ${module_.terminal} = "terminal", ${module_.changes} = "git-changes";
const ${module_.signal} = (init) => {
  let v = init;
  return [() => v, (n) => (v = typeof n === "function" ? n(v) : n)];
};
const ${module_.effect} = (fn) => { fn(); };
const ${module_.cleanup} = () => {};
const ${module_.fuzzy} = { default: { single: () => null, go: () => [] } };
const setTimeout = () => 0, clearTimeout = () => {};
const document = {
  active: null,
  execCommand(command, ui, text) {
    const t = document.active, a = t.selectionStart, b = t.selectionEnd;
    t.value = t.value.slice(0, a) + text + t.value.slice(b);
    t.selectionStart = t.selectionEnd = a + text.length;
    return true;
  },
};
${module_.source}
return (ctx) => ({ controller: ${module_.factory}(ctx, undefined, () => false, undefined), document });`;
  const { controller, document } = new Function(src)()({
    postMessage: () => {},
    onMessage: () => () => {},
  });
  const textarea = {
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    isConnected: true,
    focus() {},
    setSelectionRange(a, b) {
      this.selectionStart = a;
      this.selectionEnd = b;
    },
  };
  document.active = textarea;
  const setText = () => {};
  const open = () => (controller.showMention() ? "open" : "closed");
  return {
    // An edit: the draft is now `value` with the caret at `caret` (its end by
    // default), and the input event reaches the controller.
    type(value, caret = value.length) {
      textarea.value = value;
      textarea.selectionStart = textarea.selectionEnd = caret;
      controller.onInput(value, caret);
      return open();
    },
    key(name) {
      const handled = controller.onKeyDown(
        {
          key: name,
          isComposing: false,
          preventDefault() {},
          stopPropagation() {},
        },
        textarea,
        setText,
        () => {},
      );
      return `${open()}, ${handled ? "handled" : "fell-through"}`;
    },
    select(file) {
      controller.selectMention(
        { type: "file", value: file },
        textarea,
        setText,
        () => {},
      );
      return textarea.value;
    },
    draft: () => textarea.value,
  };
}

// One session per form, walked through the same steps. Each step says what the
// menu does afterwards in the stock form and in the patched one; the two agree
// everywhere except where Escape's record is what decides, which is the point.
const MENTION_STEPS = [
  {
    label: "type @docs/f",
    run: (s) => s.type("@docs/f"),
    stock: "open",
    patched: "open",
  },
  {
    label: "Escape",
    run: (s) => s.key("Escape"),
    stock: "closed, handled",
    patched: "closed, handled",
  },
  {
    label: "type on: @docs/fi",
    run: (s) => s.type("@docs/fi"),
    stock: "open",
    patched: "closed",
  },
  {
    label: "edit back to a shorter query: @docs/",
    run: (s) => s.type("@docs/"),
    stock: "open",
    patched: "open",
  },
  {
    label: "choose docs/file.md from the menu, then type h after it",
    run: (s) => s.type(s.select("docs/file.md") + "h"),
    stock: "closed",
    patched: "closed",
  },
  {
    label: "insert a prefix before the @ (caret before the mention)",
    run: (s) => s.type("Summarize @docs/file.md h", 10),
    stock: "closed",
    patched: "closed",
  },
  {
    label: "type on after the shifted mention: ...he",
    run: (s) => s.type("Summarize @docs/file.md he"),
    stock: "open",
    patched: "open",
  },
  {
    label: "Escape",
    run: (s) => s.key("Escape"),
    stock: "closed, handled",
    patched: "closed, handled",
  },
  {
    label: "type on: ...hel",
    run: (s) => s.type("Summarize @docs/file.md hel"),
    stock: "open",
    patched: "closed",
  },
  {
    label: "a new draft: type @",
    run: (s) => s.type("@"),
    stock: "open",
    patched: "open",
  },
  {
    label: "Escape on the empty query",
    run: (s) => s.key("Escape"),
    stock: "closed, handled",
    patched: "closed, handled",
  },
  {
    label: "type on: @f",
    run: (s) => s.type("@f"),
    stock: "open",
    patched: "closed",
  },
  {
    label: "a second @ later on the line: @f bar @",
    run: (s) => s.type("@f bar @"),
    stock: "open",
    patched: "open",
  },
  {
    label: "delete the whole draft",
    run: (s) => s.type(""),
    stock: "closed",
    patched: "closed",
  },
  {
    label: "retype @",
    run: (s) => s.type("@"),
    stock: "open",
    patched: "open",
  },
  {
    label: "type plain prose",
    run: (s) => s.type("plain"),
    stock: "closed",
    patched: "closed",
  },
  {
    label: "Escape with the menu closed",
    run: (s) => s.key("Escape"),
    stock: "closed, fell-through",
    patched: "closed, fell-through",
  },
];

function runMention(test, content) {
  console.log("mention menu Escape (stock -> patched)");
  if (!test.FEATURE_GATES["mention-escape"](content)) {
    console.log(
      "  n/a   this build predates the spaced mention query the patch answers",
    );
    return;
  }
  const rule = RULES.find((r) => r.key === "mention-escape");
  const derived = rule.derive(content);
  if (!derived.original) {
    console.log(
      `  FAIL  mention-escape does not derive here: ${JSON.stringify(derived)}`,
    );
    failures++;
    return;
  }
  const entry = test.PATCHES.find(
    (f) => f.filename === "webview.js",
  ).patches.find(
    (p) => p.feature === "mention-escape" && content.includes(p.original),
  );
  if (!entry) {
    console.log("  FAIL  no shipped mention-escape entry matches this build");
    failures++;
    return;
  }
  check(
    entry.original === derived.original && entry.patched === derived.patched,
    "the mention-escape entry that applies here is the one the shape rule derives",
    "shipped and derived text differ; run retarget",
  );

  const module_ = mentionModule(content, test);
  const patchedSource = module_.source.replace(entry.original, entry.patched);
  if (patchedSource === module_.source) {
    console.log(
      "  FAIL  the shipped mention-escape site is not inside the sliced controller",
    );
    failures++;
    return;
  }
  const stock = mentionSession(module_);
  const patched = mentionSession({ ...module_, source: patchedSource });
  console.log(
    `  (controller ${module_.factory}, signal ${module_.signal}, ${module_.source.length} bytes sliced)`,
  );
  for (const step of MENTION_STEPS) {
    const before = step.run(stock);
    const after = step.run(patched);
    check(
      before === step.stock && after === step.patched,
      `${step.label}: ${step.stock} -> ${step.patched}`,
      `stock "${before}", patched "${after}"`,
    );
  }
}

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
      `${source.kind === "vsix" ? " (vsix, pristine)" : ""}\n`,
  );
  assertPristine(source.bundles);

  const content = source.bundles["webview.js"];
  if (content === undefined) throw new Error("no webview.js in this source");

  const rule = RULES.find((r) => r.key === "chat-history");
  const derived = rule.derive(content);
  if (!derived.original) {
    console.log(
      `  FAIL  chat-history does not derive here: ${JSON.stringify(derived)}`,
    );
    return 1;
  }
  const symbols = derived.symbols;

  // Exercise what ships, not what the rule rebuilds, since the shipped entry is
  // what applies on a user's machine. retarget compares the two; if they have
  // drifted, say so here rather than testing a pattern nobody runs.
  const entry = test.PATCHES.find(
    (f) => f.filename === "webview.js",
  ).patches.find(
    (p) => p.feature === "chat-history" && content.includes(p.original),
  );
  if (!entry) {
    console.log("  FAIL  no shipped chat-history entry matches this build");
    return 1;
  }
  check(
    entry.original === derived.original,
    "the chat-history entry that applies here is the one the shape rule derives",
    "shipped and derived anchors differ; run retarget",
  );

  const module_ = historyModule(content);
  const stockStatement = block(content, content.indexOf(entry.original));
  const patchedBundle = content.replace(entry.original, entry.patched);
  const patchedStatement = block(
    patchedBundle,
    patchedBundle.indexOf(entry.patched),
  );

  // Past the anchor the statement binds two more locals, the text setter and the
  // auto-resize. Every interpolated symbol is escaped: "$e" is a real spelling.
  const tail = new RegExp(
    `if\\(${esc(symbols.result)}!==null\\)\\{if\\(${esc(symbols.event)}\\.preventDefault\\(\\),` +
      `(${ID})\\(${esc(symbols.result)}\\),${esc(symbols.textarea)}\\)\\{` +
      `${esc(symbols.textarea)}\\.value=${esc(symbols.result)},(${ID})\\(\\)`,
  ).exec(patchedStatement);
  if (!tail) {
    console.log(
      "  FAIL  could not bind the setter/resize locals from the statement tail",
    );
    return 1;
  }
  const tailSymbols = { setter: tail[1], resize: tail[2] };

  // A bare `return` (Kilo's selection guard) yields undefined from the wrapper,
  // which the runner reports as "guard-return"; every other exit is explicit.
  const label = (s) => s.replace(/return\}\}$/, 'return"handled"}}');
  const stock = runner(module_, label(stockStatement), symbols, tailSymbols);
  const patched = runner(
    module_,
    label(patchedStatement),
    symbols,
    tailSymbols,
  );

  console.log(
    `keystrokes (event ${symbols.event}, history ${symbols.history}, ` +
      `text ${symbols.text}, textarea ${symbols.textarea})`,
  );
  for (const c of CASES) {
    const before = stock(SENT, DRAFT)(c.press);
    const after = patched(SENT, DRAFT)(c.press);
    check(
      before.outcome === c.stock && after.outcome === c.patched,
      `${c.label}: ${c.stock} -> ${c.patched}`,
      `stock "${before.outcome}", patched "${after.outcome}"`,
    );
  }

  console.log(
    "\ndraft stash (one navigator, Cmd+Up twice then Cmd+Down twice)",
  );
  const session = patched(SENT, "my draft");
  for (const step of WALK) {
    const r = session({ key: step.key, meta: true, caret: 3 });
    check(
      r.outcome === "handled" && r.text === step.text,
      `Cmd+${step.key.replace("Arrow", "")} recalls ${JSON.stringify(step.text)}`,
      `got "${r.outcome}" with ${JSON.stringify(r.text)}`,
    );
  }

  console.log("");
  runMath(test, content);

  console.log("");
  runMention(test, content);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  return failures === 0 ? 0 : 1;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
