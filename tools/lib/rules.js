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
    description: (v) => `Chat input: Enter→newline, Cmd/Ctrl+Enter→send (v${v}+)`,
  }),

  shapeRule({
    key: "chat-escape",
    file: "webview.js",
    shape: `if\\((${ID})\\.key==="Escape"&&(${ID})\\(\\)\\)\\{\\1\\.preventDefault\\(\\),\\1\\.stopPropagation\\(\\),(${ID})\\.abort\\(\\);return\\}`,
    names: ["event", "guard", "store"],
    build: (m) =>
      `if(${m[1]}.key==="Escape"&&${m[2]}()&&(${m[1]}.shiftKey||!${m[1]}.target?.value?.trim())){${m[1]}.preventDefault(),${m[1]}.stopPropagation(),${m[3]}.abort();return}`,
    description: (v) =>
      `Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v${v}+)`,
  }),

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
        `(${ID})=!!(${ID})\\?\\.closest\\("textarea\\.prompt-input"\\)`
      );
      if (guards.length !== 1) return { matches: guards.length };
      const [, guard, arg] = guards[0];

      const tails = findAll(
        content,
        `${esc(guard)}\\?!1:(${ID})\\(${esc(arg)}\\)`
      );
      if (tails.length !== 1) return { matches: tails.length };
      const helper = tails[0][1];

      // The event parameter is not in the tail; take it from the sibling branch
      // of the same ternary chain, which tests the shortcut key.
      const before = content.slice(Math.max(0, tails[0].index - 400), tails[0].index);
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

  shapeRule({
    key: "doc-escape",
    file: "webview.js",
    shape: `(${ID})\\.key!=="Escape"\\|\\|!(${ID})\\.submitting\\(\\)&&\\2\\.status\\(\\)==="idle"\\|\\|\\1\\.defaultPrevented\\|\\|\\(\\1\\.preventDefault\\(\\),\\2\\.abort\\(\\)\\)`,
    names: ["event", "store"],
    build: (m) =>
      `${m[1]}.key!=="Escape"||!${m[2]}.submitting()&&${m[2]}.status()==="idle"||${m[1]}.defaultPrevented||!${m[1]}.shiftKey&&${m[1]}.target?.value?.trim()||(${m[1]}.preventDefault(),${m[2]}.abort())`,
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
    description: (v) => `KiloClaw edit: Enter→newline, Cmd/Ctrl+Enter→save (v${v}+)`,
  }),

  shapeRule({
    key: "kiloclaw-chat",
    file: "kiloclaw.js",
    shape: ENTER_SEND_SHAPE,
    names: ["enterCheck", "event", "send"],
    build: enterSendBuild,
    description: (v) => `KiloClaw chat: Enter→newline, Cmd/Ctrl+Enter→send (v${v}+)`,
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
    new RegExp("(" + ID + ")=(" + ID + ")=>`opencode-icon-\\$\\{\\2\\}`")
  );
  if (!builder) return undefined;

  const use = content.match(
    new RegExp("\\$\\{" + esc(builder[1]) + "\\(" + ID + "\\.name\\)\\}")
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
        `get children\\(\\)\\{return \\3\\((${ID}),\\{get value\\(\\)\\{return (${ID})\\.status\\(\\)\\.message\\|\\|\\7\\.label\\(\\)\\}`
    );
    if (anchors.length !== 1) return { matches: anchors.length };
    const [, insert, container, create, , , tooltip] = anchors[0];

    // The mention menu's "Browse files..." row calls selectMention with exactly
    // the four PromptInput locals the button needs.
    const mentions = findAll(
      content,
      `(${ID})\\.selectMention\\((${ID}),(${ID}),(${ID}),(${ID})\\)`
    );
    if (mentions.length !== 1) return { error: "selectMention call not unique" };
    const [, controller, , textarea, setter, sync] = mentions[0];

    // The ghost button is taken from the indexing button that immediately
    // follows this anchor, so the button we inject is literally the one its
    // neighbours use. Picking the bundle-wide most common identifier instead
    // would be a guess about an unrelated site.
    const ghosts = findAll(
      content,
      `${esc(create)}\\((${ID}),\\{variant:"ghost",size:"small",onClick:`
    ).filter((m) => m.index > anchors[0].index);
    if (ghosts.length === 0) return { error: "ghost button component not found" };
    const ghost = ghosts[0][1];

    const icon = deriveIconComponent(content);
    if (!icon) return { error: "sprite icon component not found" };

    const i18nMatches = findAll(content, `(${ID})\\.t\\("prompt\\.action\\.indexing"\\)`);
    if (i18nMatches.length === 0) return { error: "i18n accessor not found" };
    const i18n = i18nMatches[0][1];

    // Icons are referenced dynamically, so a glyph only exists if the sprite map
    // declares it; check the map keys rather than a rendered reference.
    const glyph = GLYPH_PREFERENCE.find((name) => hasSpriteGlyph(content, name));
    if (!glyph) {
      return { error: `no ${GLYPH_PREFERENCE.join("/")} glyph in the sprite map` };
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

module.exports = { RULES, ATTACH_RULE, ID, esc };
