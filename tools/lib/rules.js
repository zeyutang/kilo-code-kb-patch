// Shape rules: how to re-derive every patch pattern from a Kilo bundle.
//
// The premise, borne out by every retarget so far, is that the *shape* of each
// patch point is stable across releases while the minified identifiers churn
// (7.4.17 moved Zm/ua/st to ng/aa/ct without changing a single expression's
// structure). So each rule states the shape as a regex over identifier
// placeholders, and rebuilds both `original` (the literal matched text) and
// `patched` (the same expression with our edit) from the captured symbols.
//
// Rules are also anchored on strings the minifier cannot touch: DOM selectors
// ("textarea.prompt-input"), i18n keys, and Kilo's own API surface (.abort(),
// .status(), selectMention — property names survive minification). Those
// literals are what makes the derivation stable; identifier names never appear
// in a rule, and that includes receivers: the store local `t` and the
// indexing-status accessor `r` each looked permanent until a release renamed
// one of them (`r`→`a` in 7.4.21), so every identifier is a captured group.
//
// A rule reports one of three outcomes, and the harness treats anything but a
// unique match as "needs a human", never as a silent guess:
//   { original, patched, symbols }  exactly one match, pattern derived
//   { matches: n }                  0 or >1 matches; the shape moved or aliased
//   { error }                       a sub-anchor inside the shape went missing

const ID = "[A-Za-z_$][A-Za-z0-9_$]*";

function esc(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAll(content, source) {
  return [...content.matchAll(new RegExp(source, "g"))];
}

// Occurrences of a literal inside a span, for a rule that has to know where
// its edit lands within the bytes it anchored.
function countIn(haystack, needle) {
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

// The identifier a capture group holds, for the emitted symbol map.
function symbolMap(names, match) {
  const out = {};
  names.forEach((name, i) => {
    out[name] = match[i + 1];
  });
  return out;
}

// Most rules are a single shape plus a rebuild function.
function shapeRule({ key, file, shape, names, build, description }) {
  return {
    key,
    file,
    description,
    derive(content) {
      const matches = findAll(content, shape);
      if (matches.length !== 1) return { matches: matches.length };
      const m = matches[0];
      return {
        original: m[0],
        patched: build(m),
        symbols: symbolMap(names, m),
      };
    },
  };
}

// Some patch points change *shape*, not just symbols. 7.6.0 folded the chat
// Escape handling into one ternary-chain helper where 7.5.16 and older ran two
// consecutive `if` statements, and both forms are live across the supported
// range. Such a rule carries one template per form and takes the form that
// matches exactly once. Two forms matching at once is an aliasing hazard, so it
// is reported as ambiguous rather than resolved by list order, the same
// contract shapeRule holds for two matches of one shape.
function formsRule({ key, file, forms, description }) {
  return {
    key,
    file,
    description,
    derive(content) {
      const live = forms
        .map((form) => ({ form, matches: findAll(content, form.shape) }))
        .filter((hit) => hit.matches.length > 0);
      const total = live.reduce((n, hit) => n + hit.matches.length, 0);
      if (total !== 1) return { matches: total };
      const { form, matches } = live[0];
      const m = matches[0];
      return {
        original: m[0],
        patched: form.build(m),
        symbols: symbolMap(form.names, m),
      };
    },
  };
}

// Chat input and KiloClaw chat share one shape: an Enter-check helper guarding a
// send call, suppressed by Shift. The edit swaps "not Shift" for "Meta".
const ENTER_SEND_SHAPE = `(${ID})\\((${ID})\\)&&!\\2\\.shiftKey&&\\(\\2\\.preventDefault\\(\\),(${ID})\\(\\)\\)`;
const enterSendBuild = (m) =>
  `${m[1]}(${m[2]})&&(${m[2]}.metaKey||${m[2]}.ctrlKey)&&(${m[2]}.preventDefault(),${m[3]}())`;

const RULES = [
  shapeRule({
    key: "chat-input",
    file: "webview.js",
    shape: ENTER_SEND_SHAPE,
    names: ["enterCheck", "event", "send"],
    build: enterSendBuild,
    description: (v) =>
      `Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v${v}+)`,
  }),

  // The chat textarea's Escape. Through 7.5.16 this was two consecutive `if`
  // statements, a ghost-text dismiss followed by the abort, and only the abort
  // was patched. 7.6.0 hoisted both into one helper and added a third case, the
  // goal-mode cancel that arrived with `/goal`, so the whole triage is now one
  // ternary chain: popup-selector open, then ghost text, then goal mode, then
  // abort. The edit still gates the abort alone and leaves the two Kilo-owned
  // dismissals to fire whatever the textarea holds, so the shipped contract is
  // unchanged; only the expression it has to be spliced into moved.
  formsRule({
    key: "chat-escape",
    file: "webview.js",
    forms: [
      // v7.6.0+: one helper, with `busy` last in the bail-out test. Adding our
      // guard as an alternative to `!busy()` is what keeps the two earlier
      // branches reachable, and a bail returns !1 without consuming the event,
      // exactly as the unmatched `if` used to fall through to the
      // document-level handler that doc-escape guards.
      {
        shape:
          `(${ID})\\.key!=="Escape"\\?!1:(${ID})\\(\\)\\?!0:` +
          `!(${ID})\\.text\\(\\)&&!(${ID})\\.active\\(\\)&&!(${ID})\\(\\)\\?!1:` +
          `\\(\\1\\.preventDefault\\(\\),\\1\\.stopPropagation\\(\\),` +
          `\\3\\.text\\(\\)\\?\\3\\.dismiss\\(\\):` +
          `\\4\\.active\\(\\)\\?\\4\\.cancel\\(\\):(${ID})\\.abort\\(\\),!0\\)`,
        names: ["event", "popup", "ghost", "goal", "busy", "store"],
        build: (m) =>
          `${m[1]}.key!=="Escape"?!1:${m[2]}()?!0:!${m[3]}.text()&&!${m[4]}.active()&&(!${m[5]}()||!${m[1]}.shiftKey&&${m[1]}.target?.value?.trim())?!1:(${m[1]}.preventDefault(),${m[1]}.stopPropagation(),${m[3]}.text()?${m[3]}.dismiss():${m[4]}.active()?${m[4]}.cancel():${m[6]}.abort(),!0)`,
      },
      // v7.4.17 through v7.5.16: the standalone abort statement.
      {
        shape: `if\\((${ID})\\.key==="Escape"&&(${ID})\\(\\)\\)\\{\\1\\.preventDefault\\(\\),\\1\\.stopPropagation\\(\\),(${ID})\\.abort\\(\\);return\\}`,
        names: ["event", "guard", "store"],
        build: (m) =>
          `if(${m[1]}.key==="Escape"&&${m[2]}()&&(${m[1]}.shiftKey||!${m[1]}.target?.value?.trim())){${m[1]}.preventDefault(),${m[1]}.stopPropagation(),${m[3]}.abort();return}`,
      },
    ],
    description: (v) =>
      `Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v${v}+)`,
  }),

  // The @-mention menu's Escape. Since 7.5.11 a mention query may contain
  // spaces (Kilo-Org/kilocode#13592), so ordinary prose typed after a mention
  // still matches the trigger, and the controller keeps the menu closed only
  // while the query extends the mention it inserted at that exact "@" offset
  // or a query it already found dead. Escape closes the menu but records
  // nothing, so the next keystroke re-derives it (Kilo-Org/kilocode#13961).
  // The edit makes Escape record the dismissed query in the controller's own
  // dead-query slot, which is what its onInput consults, and clears that slot
  // once the "@" it named is gone so retyping the "@" gets the menu back.
  //
  // onInput and onKeyDown sit next to each other inside the controller, so
  // the anchor runs from onInput's trigger test (which binds the dead slot,
  // the "@" offset, the text and the close) through onKeyDown's Escape
  // branch (which binds the query accessor and the event). Every symbol the
  // splice references is inside it; a build whose Escape branch matched while
  // its onInput bound those names differently would bind the wrong slot, which
  // is the 7.4.22 aliasing failure. The bare Escape branch is not unique (the
  // slash-command menu has the same one), so the two hops are what make it so.
  {
    key: "mention-escape",
    file: "webview.js",
    description: (v) =>
      `Mention menu Escape: Escape records the dismissed @ query so typing on keeps the menu closed; retyping the @ reopens it (v${v}+)`,
    derive(content) {
      const heads = findAll(
        content,
        String.raw`let (${ID})=(${ID})\.substring\(0,(${ID})\)\.match\((${ID})\);` +
          String.raw`if\(!\1\)\{(${ID})\(\);return\}let (${ID})=\1\[1\]\?\?"";` +
          String.raw`if\((${ID})=\(\1\.index\?\?0\)\+\(/\^\\s/\.test\(\1\[0\]\)\?1:0\),` +
          String.raw`(${ID})\(\6,(${ID})\.get\(\7\),(${ID})\(\)\)\)\{\5\(\);return\}` +
          String.raw`if\((${ID})&&\11\.at===\7&&\6\.startsWith\(\11\.query\)\)\{\5\(\);return\}`,
      );
      if (heads.length !== 1) return { matches: heads.length };
      const head = heads[0];
      const [, match, text, , , close, , at, , , , dead] = head;

      const tails = findAll(
        content,
        String.raw`let (${ID})=(${ID})\(\)\?\?"";return (${ID})\.type==="file-picker"` +
          String.raw`&&/\\s/\.test\(\1\)&&!(${ID})\(\1\)\?!1:\((${ID})\.preventDefault\(\),` +
          String.raw`(${ID})&&(${ID})\(\3,\6,(${ID}),(${ID})\),!0\)\}` +
          String.raw`return \5\.key==="Escape"\?\(\5\.preventDefault\(\),\5\.stopPropagation\(\),` +
          String.raw`(${ID})\(\),!0\):!1\}`,
      );
      if (tails.length !== 1) return { matches: tails.length };
      const tail = tails[0];
      const mentionQuery = tail[2];
      if (tail[10] !== close) {
        return {
          error:
            "onKeyDown's Escape closes with a different function than onInput",
        };
      }
      if (tail.index <= head.index || tail.index - head.index > 4000) {
        return {
          error:
            "onKeyDown's Escape branch is not just after onInput's trigger test",
        };
      }

      const original = content.slice(head.index, tail.index + tail[0].length);
      const closeReturn = `if(!${match}){${close}();return}`;
      const escapeTail = `${close}(),!0):!1}`;
      if (
        countIn(original, closeReturn) !== 1 ||
        !original.endsWith(escapeTail)
      ) {
        return {
          error:
            "the trigger's close or the Escape tail is not where the shape expects",
        };
      }
      const patched =
        original
          .replace(
            closeReturn,
            `if(!${match}){${dead}&&${text}[${dead}.at]!=="@"&&(${dead}=void 0),${close}();return}`,
          )
          .slice(0, -escapeTail.length) +
        `${dead}={at:${at},query:${mentionQuery}()??""},${escapeTail}`;
      return {
        original,
        patched,
        symbols: { text, match, close, at, dead, mentionQuery, event: tail[5] },
      };
    },
  },

  // Prompt-history navigation. Kilo's own gate (q_a in 7.5.6) lets an arrow key
  // reach the history only when the caret already sits at the boundary it is
  // travelling towards, which is what makes a held Up walk to the top of the
  // draft and then jump to the previous message. The edit moves the whole
  // behavior onto Cmd/Ctrl and passes that boundary as the caret argument, so
  // the chord recalls history from anywhere in the draft while a bare arrow is
  // caret movement and nothing else. Kilo's own selection guard is left in
  // place: with a range selected the chord falls through to the platform's
  // caret gesture rather than replacing the draft.
  //
  // The anchor runs from the key test through the navigate() call because that
  // is the first point at which the text accessor is bound, and the splice
  // references it; stopping any earlier would leave a symbol unpinned, which is
  // the 7.4.22 aliasing failure.
  shapeRule({
    key: "chat-history",
    file: "webview.js",
    shape:
      `if\\(\\((${ID})\\.key==="ArrowUp"\\|\\|\\1\\.key==="ArrowDown"\\)` +
      `&&!\\1\\.altKey&&!\\1\\.ctrlKey&&!\\1\\.metaKey&&!\\1\\.shiftKey\\)\\{` +
      `let (${ID})=(${ID})\\?\\.selectionStart\\?\\?0,(${ID})=\\3\\?\\.selectionEnd\\?\\?0;` +
      `if\\(\\2!==\\4\\)return;` +
      `let (${ID})=\\2,(${ID})=\\1\\.key==="ArrowUp"\\?"up":"down",` +
      `(${ID})=(${ID})\\.navigate\\(\\6,(${ID})\\(\\),\\5\\)`,
    names: [
      "event",
      "selectionStart",
      "textarea",
      "selectionEnd",
      "caret",
      "direction",
      "result",
      "history",
      "text",
    ],
    build: (m) =>
      `if((${m[1]}.key==="ArrowUp"||${m[1]}.key==="ArrowDown")&&(${m[1]}.metaKey||${m[1]}.ctrlKey)` +
      `&&!${m[1]}.altKey&&!${m[1]}.shiftKey){` +
      `let ${m[2]}=${m[3]}?.selectionStart??0,${m[4]}=${m[3]}?.selectionEnd??0;` +
      `if(${m[2]}!==${m[4]})return;` +
      `let ${m[5]}=${m[1]}.key==="ArrowUp"?0:${m[9]}().length,` +
      `${m[6]}=${m[1]}.key==="ArrowUp"?"up":"down",` +
      `${m[7]}=${m[8]}.navigate(${m[6]},${m[9]}(),${m[5]})`,
    description: (v) =>
      `Chat history: plain Up/Down stay in the textarea, Cmd/Ctrl+Up/Down step through sent messages (v${v}+)`,
  }),

  // The skip-predicate's tail is only a few characters ("V?!1:L(G)"), far too
  // short to match safely on its own, so it is reached in two hops from the
  // selector literal that names the in-textarea guard.
  {
    key: "perm-keys",
    file: "webview.js",
    // Descriptions name the role, never the release's minified symbol: 7.4.20
    // rotated the permission scope's names (7.4.17's skip-predicate N,
    // fall-through L, reject j and dispatch O became j, N, q and z), so prose
    // like "Permission N()" would not just go stale, it would name a different
    // function in the very next build.
    description: (v) =>
      `Permission skip-predicate: when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v${v}+)`,
    derive(content) {
      const guards = findAll(
        content,
        `(${ID})=!!(${ID})\\?\\.closest\\("textarea\\.prompt-input"\\)`,
      );
      if (guards.length !== 1) return { matches: guards.length };
      const [, guard, arg] = guards[0];

      const tails = findAll(
        content,
        `${esc(guard)}\\?!1:(${ID})\\(${esc(arg)}\\)`,
      );
      if (tails.length !== 1) return { matches: tails.length };
      const helper = tails[0][1];

      // The event parameter is not in the tail; take it from the sibling branch
      // of the same ternary chain, which tests the shortcut key.
      const before = content.slice(
        Math.max(0, tails[0].index - 400),
        tails[0].index,
      );
      const events = findAll(before, `(${ID})\\.key==="Enter"`);
      if (events.length === 0) {
        return { error: "event parameter not found near the skip-predicate" };
      }
      const last = events[events.length - 1];
      const event = last[1];

      // The anchor spans from that event test through the tail, as raw bytes so
      // whatever sits between them per release is carried verbatim. A tail-only
      // anchor is not version-unambiguous: 7.4.22 renamed just the permission
      // event (U→H) and kept the tail's bytes, so 7.4.21's tail-only anchor
      // still matched while its splice referenced a symbol the build no longer
      // bound there. Starting at the event test pins every identifier the
      // splice references. The tail-only form is kept as `legacy` so entries
      // shipped before the widening still read as covered.
      const prefix = before.slice(last.index);
      const splice =
        `${event}.target?.value?.trim()?(${event}.key==="Enter"&&!${event}.metaKey&&!${event}.ctrlKey||` +
        `${event}.key===" "||${event}.key==="Escape"&&!${event}.shiftKey&&!${event}.ctrlKey):!1:${helper}(${arg})`;

      return {
        original: prefix + tails[0][0],
        patched: `${prefix}${guard}?${splice}`,
        legacy: {
          original: tails[0][0],
          patched: `${guard}?${splice}`,
        },
        symbols: { guard, arg, helper, event },
      };
    },
  },

  shapeRule({
    key: "perm-escape",
    file: "webview.js",
    shape: `(${ID})=(${ID})=>\\{if\\(\\2\\.key==="Escape"\\)\\{(${ID})\\(\\2,"reject"\\);return\\}\\}`,
    names: ["handler", "event", "dispatch"],
    build: (m) =>
      `${m[1]}=${m[2]}=>{if(${m[2]}.key==="Escape"&&(${m[2]}.shiftKey||!${m[2]}.target?.value?.trim())){${m[3]}(${m[2]},"reject");return}}`,
    description: (v) =>
      `Permission reject: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v${v}+)`,
  }),

  shapeRule({
    key: "perm-approve",
    file: "webview.js",
    shape: `if\\((${ID})\\((${ID})\\)\\)\\{(${ID})\\(\\2,"once"\\);return\\}\\}\\};`,
    names: ["enterCheck", "event", "dispatch"],
    build: (m) =>
      `if(${m[1]}(${m[2]})||${m[2]}.key===" "&&!${m[2]}.metaKey&&!${m[2]}.ctrlKey&&!${m[2]}.target?.value?.trim()||${m[2]}.key==="Enter"&&(${m[2]}.metaKey||${m[2]}.ctrlKey)){${m[3]}(${m[2]},"once");return}}};`,
    description: (v) =>
      `Permission approve: Cmd/Ctrl+Enter approves always; Space approves when empty/whitespace-only (v${v}+)`,
  }),

  // The document-level Escape. Kilo's "nothing to abort" test grows a conjunct
  // whenever it gains something abortable (7.6.0 added `&&!p()?.active` for the
  // goal composed by `/goal`), and the splice references neither that test nor
  // anything inside it, only the event and the store. So the test is captured
  // as a span and reproduced verbatim, pinned at its head by the
  // minifier-immune .submitting()/.status()/"idle" surface and by the store
  // backreference the abort call shares. Spelling the conjuncts out instead
  // would re-break the rule on the next thing Kilo makes abortable, while
  // widening the span cannot bind a symbol wrongly: the two the edit names sit
  // outside it.
  shapeRule({
    key: "doc-escape",
    file: "webview.js",
    shape: `(${ID})\\.key!=="Escape"\\|\\|(!(${ID})\\.submitting\\(\\)&&\\3\\.status\\(\\)==="idle"[^|]{0,80})\\|\\|\\1\\.defaultPrevented\\|\\|\\(\\1\\.preventDefault\\(\\),\\3\\.abort\\(\\)\\)`,
    names: ["event", "nothingToAbort", "store"],
    build: (m) =>
      `${m[1]}.key!=="Escape"||${m[2]}||${m[1]}.defaultPrevented||!${m[1]}.shiftKey&&${m[1]}.target?.value?.trim()||(${m[1]}.preventDefault(),${m[3]}.abort())`,
    description: (v) =>
      `Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v${v}+)`,
  }),

  shapeRule({
    key: "kiloclaw-edit",
    file: "kiloclaw.js",
    shape: `(${ID})\\((${ID})\\)&&!\\2\\.shiftKey\\?\\(\\2\\.preventDefault\\(\\),(${ID})\\(\\)\\):\\2\\.key==="Escape"&&(${ID})\\(\\)`,
    names: ["enterCheck", "event", "save", "cancel"],
    build: (m) =>
      `${m[1]}(${m[2]})&&(${m[2]}.metaKey||${m[2]}.ctrlKey)?(${m[2]}.preventDefault(),${m[3]}()):${m[2]}.key==="Escape"&&${m[4]}()`,
    description: (v) =>
      `KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v${v}+)`,
  }),

  shapeRule({
    key: "kiloclaw-chat",
    file: "kiloclaw.js",
    shape: ENTER_SEND_SHAPE,
    names: ["enterCheck", "event", "send"],
    build: enterSendBuild,
    description: (v) =>
      `KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v${v}+)`,
  }),
];

// Sprite map keys are minified, so a key is quoted only when it has to be:
// `"plus-small"` must be quoted because of the hyphen, while `plus` is a valid
// identifier and is emitted bare. Grepping only the quoted form therefore
// reports the larger glyph as missing when it is present, which is exactly the
// false negative that pushed the 7.4.13+ buttons onto the small glyph.
function hasSpriteGlyph(content, name) {
  if (content.includes(`"${name}":`)) return true;
  // A name that is not a bare identifier can only ever appear quoted.
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return false;
  return new RegExp(`[,{]${name}:["']`).test(content);
}

// Both glyphs exist in every build checked (7.3.54 through 7.4.17). `plus` draws
// about 70% larger than `plus-small` in the same 20x20 viewBox, and is what the
// shipped button uses. The order here decides which the generated button uses,
// so it must match what src ships or retarget will report a MISMATCH; the
// smaller glyph stays as a fallback in case a future build drops the large one.
const GLYPH_PREFERENCE = ["plus", "plus-small"];

// The button originally captioned itself with Kilo's localized
// "prompt.action.attachFile" ("Attach file"), a key the 7.4.11-era recon found
// defined per locale but otherwise unused. Kilo has since dropped it: the key
// is absent from every build re-checked (7.4.17 through 7.5.4, whole-vsix
// searches), and the webview's t() falls back to String(key) for a missing
// key, so a u.t() caption renders the raw key string there. The caption is
// therefore decided per build: the localized call while the catalog ships the
// key, else an English literal, which matches Kilo's own current practice of
// hardcoding this row's label. The catalog form is the quoted key with a
// colon, which the injected t() call does not contain, so the test cannot be
// confused by a patched bundle.
function attachLabelExpression(content, i18n) {
  return content.includes('"prompt.action.attachFile":')
    ? `${i18n}.t("prompt.action.attachFile")`
    : '"Attach file"';
}

// Kilo ships two icon components with the same `{name,size}` call shape, and the
// one we must not use is the more common of the two, so counting usages picks
// wrong. Identify the sprite component by behavior instead: it is the function
// that builds the `#opencode-icon-<name>` href. Walk back from that reference to
// the enclosing function declaration to get its minified name.
function deriveIconComponent(content) {
  const builder = content.match(
    new RegExp("(" + ID + ")=(" + ID + ")=>`opencode-icon-\\$\\{\\2\\}`"),
  );
  if (!builder) return undefined;

  const use = content.match(
    new RegExp("\\$\\{" + esc(builder[1]) + "\\(" + ID + "\\.name\\)\\}"),
  );
  if (!use) return undefined;

  const before = content.slice(Math.max(0, use.index - 3000), use.index);
  const declarations = findAll(before, `function (${ID})\\(`);
  if (declarations.length === 0) return undefined;
  return declarations[declarations.length - 1][1];
}

// The opt-in attach-file button is not a rewrite of an existing expression but
// an insertion before the indexing button, so it lives outside PATCHES (in
// ATTACH_FILE_BUTTONS) and needs symbols from three places: the toolbar render
// site, the mention menu's own selectMention call, and the shared button/icon
// components.
const ATTACH_RULE = {
  key: "attach-button",
  file: "webview.js",
  derive(content) {
    // The indexing-status accessor is a minified local (`r` through 7.4.20,
    // `a` in 7.4.21), so capture it with a backreference rather than naming it.
    const anchors = findAll(
      content,
      `(${ID})\\((${ID}),(${ID})\\((${ID}),\\{get when\\(\\)\\{return (${ID})\\(\\)\\},` +
        `get children\\(\\)\\{return \\3\\((${ID}),\\{get value\\(\\)\\{return (${ID})\\.status\\(\\)\\.message\\|\\|\\7\\.label\\(\\)\\}`,
    );
    if (anchors.length !== 1) return { matches: anchors.length };
    const [, insert, container, create, , , tooltip] = anchors[0];

    // The mention menu's "Browse files..." row calls selectMention with exactly
    // the four PromptInput locals the button needs.
    const mentions = findAll(
      content,
      `(${ID})\\.selectMention\\((${ID}),(${ID}),(${ID}),(${ID})\\)`,
    );
    if (mentions.length !== 1)
      return { error: "selectMention call not unique" };
    const [, controller, , textarea, setter, sync] = mentions[0];

    // The ghost button is taken from the indexing button that immediately
    // follows this anchor, so the button we inject is literally the one its
    // neighbours use. Picking the bundle-wide most common identifier instead
    // would be a guess about an unrelated site.
    const ghosts = findAll(
      content,
      `${esc(create)}\\((${ID}),\\{variant:"ghost",size:"small",onClick:`,
    ).filter((m) => m.index > anchors[0].index);
    if (ghosts.length === 0)
      return { error: "ghost button component not found" };
    const ghost = ghosts[0][1];

    const icon = deriveIconComponent(content);
    if (!icon) return { error: "sprite icon component not found" };

    const i18nMatches = findAll(
      content,
      `(${ID})\\.t\\("prompt\\.action\\.indexing"\\)`,
    );
    if (i18nMatches.length === 0) return { error: "i18n accessor not found" };
    const i18n = i18nMatches[0][1];

    // Icons are referenced dynamically, so a glyph only exists if the sprite map
    // declares it; check the map keys rather than a rendered reference.
    const glyph = GLYPH_PREFERENCE.find((name) =>
      hasSpriteGlyph(content, name),
    );
    if (!glyph) {
      return {
        error: `no ${GLYPH_PREFERENCE.join("/")} glyph in the sprite map`,
      };
    }

    const label = attachLabelExpression(content, i18n);

    const original = anchors[0][0];
    const button =
      `${insert}(${container},${create}(${tooltip},{get value(){return ${label}},` +
      `placement:"top",get children(){return ${create}(${ghost},{variant:"ghost",size:"small",` +
      `onClick:()=>{if(!${textarea})return;${textarea}.focus();let _v=${textarea}.value,` +
      `_s=${textarea}.selectionStart??_v.length,_b=_v.substring(0,_s);` +
      `document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");` +
      `${controller}.selectMention({type:"file-picker"},${textarea},${setter},${sync})},` +
      `get"aria-label"(){return ${label}},` +
      `get children(){return ${create}(${icon},{name:"${glyph}",size:"small"})}})}}),null),`;

    return {
      original,
      patched: button + original,
      symbols: {
        insert,
        container,
        create,
        tooltip,
        ghost,
        icon,
        i18n,
        controller,
        textarea,
        setter,
        sync,
        glyph,
      },
    };
  },
};

// The math-rendering bonus adds three `marked` extensions to the katex pack
// Kilo already registers. Like the attach button it is an insertion rather than
// a rewrite, so it lives outside PATCHES (in MATH_EXTENSIONS).
//
// The derived span is the tail of that pack: the second extension's renderer,
// then the `]});` that closes the array and the use() call. It is the shortest
// span that still pins the render helper, which is the only symbol the injected
// code references, and it deliberately stops short of the two `$$` regex
// variables that sit earlier in the pack, so a release that renames only those
// keeps matching. Splicing after the last extension registers ours last, and
// marked's use() *unshifts* each tokenizer, so last-registered is first-tried;
// the `$...$` regex fails immediately on `$$` precisely so that Kilo's own
// `$$...$$` extension keeps priority regardless.
const MATH_EXTENSION_SOURCES = [
  (render) =>
    `{name:"kbpKatexInlineDollar",level:"inline",start(_e){let _i=_e.indexOf("$");if(_i!==-1)return _i},` +
    `tokenizer(_e){let _m=_e.match(/^\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d)/);` +
    `if(_m)return{type:"kbpKatexInlineDollar",raw:_m[0],text:_m[1].trim()}},` +
    `renderer(_n){return ${render}(_n.text,{displayMode:!1,throwOnError:!1})}}`,
  (render) =>
    `{name:"kbpKatexBlockBracket",level:"block",` +
    `tokenizer(_e){let _m=_e.match(/^\\\\\\[([\\s\\S]+?)\\\\\\](?:\\n|$)/);` +
    `if(_m&&_m[1].trim())return{type:"kbpKatexBlockBracket",raw:_m[0],text:_m[1].trim()}},` +
    `renderer(_n){return ${render}(_n.text,{displayMode:!0,throwOnError:!1})+"\\n"}}`,
  (render) =>
    `{name:"kbpKatexInlineBracket",level:"inline",start(_e){let _i=_e.indexOf("\\\\[");if(_i!==-1)return _i},` +
    `tokenizer(_e){let _m=_e.match(/^\\\\\\[((?:\\\\.|[^\\\\\\n])*?)\\\\\\]/);` +
    `if(_m&&_m[1].trim())return{type:"kbpKatexInlineBracket",raw:_m[0],text:_m[1].trim()}},` +
    `renderer(_n){return ${render}(_n.text,{displayMode:!0,throwOnError:!1})}}`,
];

function mathExtensions(render) {
  return MATH_EXTENSION_SOURCES.map((build) => build(render)).join(",");
}

const MATH_RULE = {
  key: "math-rendering",
  file: "webview.js",
  derive(content) {
    const matches = findAll(
      content,
      `renderer\\((${ID})\\)\\{return (${ID})\\(\\1\\.text,\\{displayMode:!0,throwOnError:!1\\}\\)\\}\\}\\]\\}\\);`,
    );
    if (matches.length !== 1) return { matches: matches.length };
    const [original, arg, render] = matches[0];

    // Sanity-check that this really is Kilo's katex pack rather than some other
    // extension array that happens to end the same way: the pack's first
    // extension is the block-level `$$` one and names the same helper.
    if (
      !content.includes(`{name:"doubleKatexBlock",level:"block"`) ||
      !content.includes(`{name:"doubleKatexInline",level:"inline"`)
    ) {
      return { error: "the doubleKatex extension pack is not in this build" };
    }

    return {
      original,
      // "]});" is four characters, so dropping them leaves the last renderer
      // and re-appending them after the injected extensions closes the array
      // and the call exactly as before.
      patched: `${original.slice(0, -4)},${mathExtensions(render)}]});`,
      symbols: { arg, render },
    };
  },
};

// Probes are rules that assert a derivation still works without proposing a
// pattern to paste. Two patches need one, and neither stores per-release text
// in src at all. The typography bonus reads three font-size declarations out
// of Kilo's stylesheet at reconcile time, and a build that restructured any of
// them would silently emit fewer rules than the settings asked for. The core
// chat-scroll patch's two blocks apply only while Kilo still looks the way
// they assume (the stylesheet rule for the textarea, the templates and the
// controller threshold for the script), and a build where an anchor moved
// would read "missing" in the status view while stock behavior returned.
// Reporting all of it here turns any of it into a retarget failure instead. A
// probe reads its own file and, for a cross-file check, the other pristine
// bundles; a patch with a block in each file has a probe in each.
const PROBES = [
  {
    key: "chat-style",
    file: "webview.css",
    describe: "declarations the typography bonus multiplies",
    read(content, test) {
      // Each anchor must identify one declaration, not merely find one: a
      // second match would mean the value read is whichever comes first, which
      // is a guess. The anchors come from the extension itself so the two
      // cannot drift.
      const ambiguous = Object.entries(test.CHAT_STYLE_ANCHORS)
        .map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ])
        .filter(([, count]) => count !== 1);
      if (ambiguous.length > 0) {
        return {
          error:
            "not exactly one match for: " +
            ambiguous.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      const values = test.readChatStyleValues(content);
      if (!values)
        return { error: "anchors matched but no value could be read" };

      // The math knob never derives KaTeX's size, it states an absolute em and
      // treats one value as "leave it alone". That value has to be the one this
      // build actually uses, or the knob switches itself on for users who never
      // touched it, so the two are compared here rather than at runtime.
      const katexEm = Number(
        test.CHAT_STYLE_ANCHORS["katex em size"].exec(content)?.[1],
      );
      if (katexEm !== test.KATEX_DEFAULT_EM) {
        return {
          error:
            `KaTeX now sizes .katex at ${katexEm}em, but KATEX_DEFAULT_EM (and the ` +
            `chatMathFontSizeEm schema default) is ${test.KATEX_DEFAULT_EM}`,
        };
      }
      return { values: { ...values, katexEm } };
    },
  },
  {
    key: "chat-scroll",
    file: "webview.css",
    describe: "what the chat-scroll block assumes about the prompt textarea",
    read(content, test, bundles) {
      const ambiguous = Object.entries(test.CHAT_SCROLL_ANCHORS)
        .map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ])
        .filter(([, count]) => count !== 1);
      if (ambiguous.length > 0) {
        return {
          error:
            "not exactly one match for: " +
            ambiguous.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      const sizing = test.readPromptSizing(content);
      if (!sizing)
        return { error: "anchors matched but the sizing could not be read" };

      // With the block in place Kilo's inline height is void, so the only cap
      // on the textarea is the stylesheet's max-height. Kilo's script caps its
      // own measurement too, and the two have agreed so far (200px on every
      // build checked); a build that moved one without the other changes the
      // effective cap under this patch, which is a decision for a human. A
      // build with no measure-then-set script at all is one where the patch
      // may be redundant, or where Kilo now sizes the box some other way that
      // an engine-sized height would fight, so that is a stop too.
      const js = bundles?.["webview.js"];
      if (js === undefined) return { values: sizing };

      // The rule reaches the textarea through two DOM strings the minifier
      // cannot touch, `textarea.prompt-input` inside `.chat-view`. A build
      // that renamed either would leave the block applied and inert while the
      // status view read "patched", since the stylesheet anchors could still
      // match, so the templates are checked here where the bundle is at hand.
      const occurrences = (needle) => js.split(needle).length - 1;
      const templates = {
        "textarea.prompt-input template": occurrences(
          "<textarea class=prompt-input ",
        ),
        ".chat-view template": occurrences("class=chat-view"),
      };
      const moved = Object.entries(templates).filter(([, n]) => n !== 1);
      if (moved.length > 0) {
        return {
          error:
            "webview.js no longer has exactly one " +
            moved.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      const caps = [
        ...js.matchAll(
          new RegExp(
            `(${ID})\\.style\\.height=\`\\$\\{Math\\.min\\(\\1\\.scrollHeight,(\\d+)\\)\\}px\``,
            "g",
          ),
        ),
      ].map((m) => `${m[2]}px`);
      if (caps.length === 0) {
        return {
          error:
            "Kilo's measure-then-set auto-resize (height=auto, then Math.min(scrollHeight, cap)) " +
            "is gone from webview.js; re-check whether the chat-scroll block is still needed or safe",
        };
      }
      const disagreeing = caps.filter((cap) => cap !== sizing.maxHeight);
      if (disagreeing.length > 0) {
        return {
          error:
            `Kilo's script caps the textarea at ${[...new Set(caps)].join("/")} ` +
            `but its stylesheet at ${sizing.maxHeight}; the block makes the stylesheet win`,
        };
      }
      return { values: { ...sizing, scriptCapSites: caps.length } };
    },
  },
  {
    key: "chat-scroll",
    file: "webview.js",
    describe: "what the chat-scroll script block assumes about the chat view",
    read(content, test) {
      // The script reaches the DOM through three class names and mirrors the
      // controller's default threshold. Each must occur exactly once, which is
      // also what the extension requires before writing the block, so a build
      // that fails here would read "missing" in the status view rather than
      // carry a script that finds nothing. The anchors come from the extension
      // itself so the two cannot drift.
      const ambiguous = Object.entries(test.CHAT_SCROLL_SCRIPT_ANCHORS)
        .map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ])
        .filter(([, count]) => count !== 1);
      if (ambiguous.length > 0) {
        return {
          error:
            "not exactly one match for: " +
            ambiguous.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      const threshold = test.readScrollThreshold(content);
      if (threshold === undefined) {
        return { error: "anchors matched but the threshold could not be read" };
      }
      // The chat view creates its controller without a threshold of its own,
      // so the default is the one in force. A call site that passed one would
      // leave the script and the controller disagreeing on what "at the
      // bottom" means, which is a decision for a human.
      const overridden = (content.match(/bottomThreshold:/g) ?? []).length;
      if (overridden > 0) {
        return {
          error:
            `${overridden} controller call site(s) pass a bottomThreshold of their own; ` +
            "the script mirrors the default only",
        };
      }
      return { values: { threshold } };
    },
  },
  {
    key: "hover-guard",
    file: "webview.js",
    describe: "what the hover-guard script block assumes about the chat view",
    read(content, test) {
      // The script reaches the chat textarea through the same two templates
      // as the chat-scroll script and asks nothing else of Kilo: it stops
      // events the engine synthesizes, not anything Kilo dispatches. Each must
      // occur exactly once, which is also what the extension requires before
      // writing the block. The counts reported alongside are the handler sites
      // the guard is there for (rows that highlight on mouseenter, tooltip and
      // list-item triggers on pointerenter), so a Kilo that moved its menus or
      // tooltips off enter events shows up in the log without failing the
      // probe: the block is harmless where it has nothing to stop.
      const ambiguous = Object.entries(test.HOVER_GUARD_ANCHORS)
        .map(([label, re]) => [
          label,
          (content.match(new RegExp(re.source, "g")) ?? []).length,
        ])
        .filter(([, count]) => count !== 1);
      if (ambiguous.length > 0) {
        return {
          error:
            "not exactly one match for: " +
            ambiguous.map(([label, n]) => `${label} (${n}x)`).join(", "),
        };
      }
      if (!test.hoverGuardAnchorsPresent(content)) {
        return {
          error: "anchors matched but the extension would not write the block",
        };
      }
      const occurrences = (needle) => content.split(needle).length - 1;
      return {
        values: {
          mouseenterListeners: occurrences('addEventListener("mouseenter"'),
          pointerEnterProps: occurrences("onPointerEnter:"),
        },
      };
    },
  },
];

module.exports = {
  RULES,
  ATTACH_RULE,
  MATH_RULE,
  PROBES,
  mathExtensions,
  ID,
  esc,
};
