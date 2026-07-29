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
// ("textarea.prompt-input"), i18n keys, and Kilo's own API surface (t.abort(),
// t.status(), selectMention). Those literals are what makes the derivation
// stable; identifier names never appear in a rule.
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
  `${m[1]}(${m[2]})&&${m[2]}.metaKey&&(${m[2]}.preventDefault(),${m[3]}())`;

const RULES = [
  shapeRule({
    key: "chat-input",
    file: "webview.js",
    shape: ENTER_SEND_SHAPE,
    names: ["enterCheck", "event", "send"],
    build: enterSendBuild,
    description: (v) => `Chat input: Enter→newline, Cmd+Enter→send (v${v}+)`,
  }),

  shapeRule({
    key: "chat-escape",
    file: "webview.js",
    shape: `if\\((${ID})\\.key==="Escape"&&(${ID})\\(\\)\\)\\{\\1\\.preventDefault\\(\\),\\1\\.stopPropagation\\(\\),t\\.abort\\(\\);return\\}`,
    names: ["event", "guard"],
    build: (m) =>
      `if(${m[1]}.key==="Escape"&&${m[2]}()&&(${m[1]}.shiftKey||!${m[1]}.target?.value?.trim())){${m[1]}.preventDefault(),${m[1]}.stopPropagation(),t.abort();return}`,
    description: (v) =>
      `Chat Escape: bare Escape aborts when textarea empty/whitespace-only; Shift+Escape always aborts (v${v}+)`,
  }),

  // The skip-predicate's tail is only a few characters ("V?!1:L(G)"), far too
  // short to match safely on its own, so it is reached in two hops from the
  // selector literal that names the in-textarea guard.
  {
    key: "perm-keys",
    file: "webview.js",
    description: (v) =>
      `Permission N(): when textarea has non-whitespace content, skip bare Enter/Space/Escape; works regardless of focus (v${v}+)`,
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
      const event = events[events.length - 1][1];

      return {
        original: tails[0][0],
        patched:
          `${guard}?${event}.target?.value?.trim()?(${event}.key==="Enter"&&!${event}.metaKey||` +
          `${event}.key===" "||${event}.key==="Escape"&&!${event}.shiftKey&&!${event}.ctrlKey):!1:${helper}(${arg})`,
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
      `Permission j: bare Escape rejects only when textarea empty/whitespace-only; Shift+Escape always rejects (v${v}+)`,
  }),

  shapeRule({
    key: "perm-approve",
    file: "webview.js",
    shape: `if\\((${ID})\\((${ID})\\)\\)\\{(${ID})\\(\\2,"once"\\);return\\}\\}\\};`,
    names: ["enterCheck", "event", "dispatch"],
    build: (m) =>
      `if(${m[1]}(${m[2]})||${m[2]}.key===" "&&!${m[2]}.metaKey&&!${m[2]}.ctrlKey&&!${m[2]}.target?.value?.trim()||${m[2]}.key==="Enter"&&${m[2]}.metaKey){${m[3]}(${m[2]},"once");return}}};`,
    description: (v) =>
      `Permission O: Cmd+Enter approves always; Space approves when empty/whitespace-only (v${v}+)`,
  }),

  shapeRule({
    key: "doc-escape",
    file: "webview.js",
    shape: `(${ID})\\.key!=="Escape"\\|\\|!t\\.submitting\\(\\)&&t\\.status\\(\\)==="idle"\\|\\|\\1\\.defaultPrevented\\|\\|\\(\\1\\.preventDefault\\(\\),t\\.abort\\(\\)\\)`,
    names: ["event"],
    build: (m) =>
      `${m[1]}.key!=="Escape"||!t.submitting()&&t.status()==="idle"||${m[1]}.defaultPrevented||!${m[1]}.shiftKey&&${m[1]}.target?.value?.trim()||(${m[1]}.preventDefault(),t.abort())`,
    description: (v) =>
      `Document Escape: bare Escape does not abort when textarea has non-whitespace content; Shift+Escape aborts (v${v}+)`,
  }),

  shapeRule({
    key: "kiloclaw-edit",
    file: "kiloclaw.js",
    shape: `(${ID})\\((${ID})\\)&&!\\2\\.shiftKey\\?\\(\\2\\.preventDefault\\(\\),(${ID})\\(\\)\\):\\2\\.key==="Escape"&&(${ID})\\(\\)`,
    names: ["enterCheck", "event", "save", "cancel"],
    build: (m) =>
      `${m[1]}(${m[2]})&&${m[2]}.metaKey?(${m[2]}.preventDefault(),${m[3]}()):${m[2]}.key==="Escape"&&${m[4]}()`,
    description: (v) => `KiloClaw edit: Enter→newline, Cmd+Enter→save (v${v}+)`,
  }),

  shapeRule({
    key: "kiloclaw-chat",
    file: "kiloclaw.js",
    shape: ENTER_SEND_SHAPE,
    names: ["enterCheck", "event", "send"],
    build: enterSendBuild,
    description: (v) => `KiloClaw chat: Enter→newline, Cmd+Enter→send (v${v}+)`,
  }),
];

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
    const anchors = findAll(
      content,
      `(${ID})\\((${ID}),(${ID})\\((${ID}),\\{get when\\(\\)\\{return (${ID})\\(\\)\\},` +
        `get children\\(\\)\\{return \\3\\((${ID}),\\{get value\\(\\)\\{return r\\.status\\(\\)\\.message\\|\\|r\\.label\\(\\)\\}`
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
    const glyph = content.includes('"plus-small":')
      ? "plus-small"
      : content.includes('"plus":')
      ? "plus"
      : undefined;
    if (!glyph) return { error: 'no "plus"/"plus-small" glyph in the sprite map' };

    const original = anchors[0][0];
    const button =
      `${insert}(${container},${create}(${tooltip},{get value(){return ${i18n}.t("prompt.action.attachFile")},` +
      `placement:"top",get children(){return ${create}(${ghost},{variant:"ghost",size:"small",` +
      `onClick:()=>{if(!${textarea})return;${textarea}.focus();let _v=${textarea}.value,` +
      `_s=${textarea}.selectionStart??_v.length,_b=_v.substring(0,_s);` +
      `document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");` +
      `${controller}.selectMention({type:"file-picker"},${textarea},${setter},${sync})},` +
      `get"aria-label"(){return ${i18n}.t("prompt.action.attachFile")},` +
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
