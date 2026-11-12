// The shape rules for the bonus splices: the attach-file button, the math
// extensions and the markdown-source toggle.

const { ID, esc, findAll, countIn, crossesFunction, hop } = require("./engine");

// Sprite map keys are minified, so a key is quoted only when it has to be:
// `"plus-small"` must be quoted because of the hyphen, while `plus` is a valid
// identifier and is emitted bare. Grepping only the quoted form therefore
// reports the larger glyph as missing when it is present, which is exactly the
// false negative that pushed the 7.4.13+ buttons onto the small glyph.
function hasSpriteGlyph(content, name) {
  if (content.includes(`"${name}":`)) return true;
  // A name that is not a bare identifier can only ever appear quoted.
  if (!new RegExp(`^${ID}$`).test(name)) return false;
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
// the enclosing function declaration to get its minified name. Returns that
// declaration as a hop, since the component is module-level and sits nowhere
// near the toolbar, which is also why the form that needs it (the pre-7.6.0
// text button) is left to reviewed entries rather than derived at apply.
function deriveIconComponent(content) {
  // findAll rather than String.match so these two scans are prefiltered like
  // every other; taking the first hit of an ordered list is what an unanchored
  // match() returns anyway.
  const builder = findAll(
    content,
    "(" + ID + ")=(" + ID + ")=>`opencode-icon-\\$\\{\\2\\}`",
  )[0];
  if (!builder) return undefined;

  const use = findAll(
    content,
    "\\$\\{" + esc(builder[1]) + "\\(" + ID + "\\.name\\)\\}",
  )[0];
  if (!use) return undefined;

  const from = Math.max(0, use.index - 3000);
  const declarations = findAll(
    content.slice(from, use.index),
    `function (${ID})\\(`,
  );
  if (declarations.length === 0) return undefined;
  const last = declarations[declarations.length - 1];
  return { name: last[1], hop: { index: from + last.index, text: last[0] } };
}

// How far before the toolbar anchor Kilo's own mention row may sit. Measured
// at 3.5 to 4.5 KB on every build from 7.4.17 through 7.8.9, inside the same
// render function as the toolbar, so nearly twice the largest leaves the menu
// room to grow while a call in some other component is still refused.
const MENTION_WINDOW = 8192;

// The opt-in attach-file button is not a rewrite of an existing expression but
// an insertion before the indexing button, so it lives outside PATCHES (in
// ATTACH_FILE_BUTTONS) and needs symbols from three places: the toolbar render
// site, the mention menu's own selectMention call, and the neighbouring
// button's component.
//
// Those symbols come from outside the anchor, which long kept this rule off
// apply-time derivation. Each one is now read from a hop the rule
// pins to the toolbar's own render function, by properties no re-minify can
// move, and the extension additionally checks that every hop lies near the
// edit before it lets a derived button be written (see `admissible`).
const ATTACH_RULE = {
  key: "attach-button",
  file: "webview.js",
  derive(content) {
    // The anchor is the indexing button's insert, which the toolbar has
    // written in two shapes. Through 7.8.8 each button is inserted straight
    // into the toolbar. From 7.8.9 Kilo folds its actions into an overflow
    // menu when the prompt is too narrow for them, so each one is inserted
    // wrapped in its own <div class=prompt-action>, the element Kilo marks
    // data-folded. Whichever shape matches exactly once is the one read, and
    // both matching at once is reported rather than settled by their order,
    // the contract formsRule holds. The indexing-status accessor is a
    // minified local (`r` through 7.4.20, `a` in 7.4.21), so capture it with a
    // backreference rather than naming it.
    const head =
      `(${ID})\\((${ID}),(${ID})\\((${ID}),\\{get when\\(\\)\\{return (${ID})\\(\\)\\},` +
      `get children\\(\\)\\{`;
    const forms = [
      {
        wrapped: false,
        matches: findAll(
          content,
          head +
            `return \\3\\((${ID}),\\{get value\\(\\)\\{return (${ID})\\.status\\(\\)\\.message\\|\\|\\7\\.label\\(\\)\\}`,
        ),
      },
      {
        wrapped: true,
        matches: findAll(
          content,
          head +
            `var (${ID})=(${ID})\\(\\);return \\1\\(\\6,\\3\\((${ID}),\\{get value\\(\\)\\{return (${ID})\\.status\\(\\)\\.message\\|\\|\\9\\.label\\(\\)\\}`,
        ),
      },
    ].filter((form) => form.matches.length > 0);
    const total = forms.reduce((n, form) => n + form.matches.length, 0);
    if (total !== 1) return { matches: total };
    const { wrapped } = forms[0];
    const anchors = forms[0].matches;
    const anchor = anchors[0];
    const [, insert, container, create] = anchor;
    const tooltip = anchor[wrapped ? 8 : 6];

    // The mention menu's "Browse files..." row calls selectMention with exactly
    // the four PromptInput locals the button needs. The lookbehind keeps a
    // member call such as `e.controller.selectMention(...)` from yielding
    // `controller`, which would be a property name rather than a local.
    const mentions = findAll(
      content,
      `(?<![\\w$.])(${ID})\\.selectMention\\((${ID}),(${ID}),(${ID}),(${ID})\\)`,
    );
    if (mentions.length !== 1)
      return { error: "selectMention call not unique" };
    const mention = mentions[0];
    const [, controller, , textarea, setter, sync] = mention;

    // A unique call is not yet a call in the right scope: had Kilo moved the
    // menu into a component of its own, the one call would name that
    // component's locals, and a button spliced here would reach for names this
    // scope does not bind. Three properties pin it to the toolbar's own render
    // function, and none of them depends on a spelling. The call sits a few KB
    // before the toolbar with no function body opening in between. The
    // textarea it passes is the one the prompt's <textarea> is assigned to as
    // a Solid ref, which happens just before the toolbar in the same
    // expression. And the textarea, setter and sync travel together through at
    // least one more of Kilo's calls there (selectSession, selectWorktree, the
    // slash-command select), so the three are this scope's set rather than
    // arguments that happen to line up once.
    const gap = anchor.index - mention.index;
    if (gap <= 0 || gap > MENTION_WINDOW) {
      return {
        error: "Kilo's own selectMention call is not beside the toolbar",
      };
    }
    const between = content.slice(mention.index, anchor.index);
    if (crossesFunction(between)) {
      return {
        error: "a function body opens between selectMention and the toolbar",
      };
    }
    const ref = new RegExp(
      `typeof (${ID})=="function"\\?(${ID})\\(\\1,(${ID})\\):${esc(textarea)}=\\3`,
    ).exec(between);
    if (!ref) {
      return {
        error: "the textarea selectMention passes is not the prompt's own ref",
      };
    }
    if (countIn(between, `,${textarea},${setter},${sync})`) < 2) {
      return {
        error: "no second call names the textarea, setter and sync together",
      };
    }

    // The button has to be the component its neighbours are, not merely one
    // that looks like them. Kilo's toolbar buttons are icon-buttons, a fixed
    // 22x22 square, while the generic Button is a text button that pads the
    // same 16px glyph out to 40px. Both are ghost/small, and they are told
    // apart by their first prop: the icon-button names its glyph
    // (`{icon:"database",...}`) and renders it itself, while the generic
    // Button starts at `{variant:...}` and takes the glyph as a child.
    //
    // The window is the point. Kilo moved this toolbar to icon-buttons, after
    // which the old unbounded "first ghost button past the anchor" search
    // found nothing nearby and walked ~18KB on to the permission dialog's Deny
    // button. That is a real ghost button, so the rule still derived, still
    // spliced, still parsed, and still reported covered, having placed a 40px
    // button in a 22px row. Nothing failed loudly because nothing was asked
    // to. The true neighbour sits ~160 bytes past the anchor, so a match
    // beyond this window is some other component, and the right answer there
    // is to report rather than to reach.
    const NEIGHBOUR_WINDOW = 2048;
    // Searched in the window itself rather than across the bundle and then
    // filtered, which finds the same matches for a fraction of the scanning
    // (the check the extension runs on a reviewed entry repeats this rule).
    // The slice runs past the window by more than a match is long, so a match
    // that starts inside it is never cut short, and it starts after the
    // anchor, which is where the neighbour has to be.
    const windowStart = anchor.index + 1;
    const windowText = content.slice(
      windowStart,
      anchor.index + NEIGHBOUR_WINDOW + 1024,
    );
    const nearAnchor = (source) =>
      [...windowText.matchAll(new RegExp(source, "g"))]
        .map((m) => {
          m.index += windowStart;
          return m;
        })
        .filter((m) => m.index - anchor.index < NEIGHBOUR_WINDOW);

    const iconButtons = nearAnchor(
      `${esc(create)}\\((${ID}),\\{icon:"[a-z-]+",variant:"ghost",size:"small",onClick:`,
    );
    const ghosts = nearAnchor(
      `${esc(create)}\\((${ID}),\\{variant:"ghost",size:"small",onClick:`,
    );
    if (iconButtons.length === 0 && ghosts.length === 0)
      return { error: "no ghost toolbar button beside the indexing status" };
    const asIconButton = iconButtons.length > 0;
    const neighbour = asIconButton ? iconButtons[0] : ghosts[0];
    const ghost = neighbour[1];

    // The wrapped toolbar inserts each action before a node of its own
    // template (the enhance action's wrapper, on 7.8.9) rather than at its
    // end, and inserting before a node that is not the toolbar's child throws
    // and takes the whole prompt down with it. So the node is not looked up
    // but read off the indexing button's own insert, which names it last,
    // after the getter returns its wrapper. The button is inserted with that
    // parent and node, by a call placed just before that one, which keeps it
    // immediately before the indexing button whatever that button's Show
    // does. The getter that closes has to be the anchor's own: another
    // action's getter declaring the same wrapper first would make this match
    // that one's end.
    let wrapperTemplate;
    let marker;
    let markerHop;
    if (wrapped) {
      const wrapperLocal = anchor[6];
      wrapperTemplate = anchor[7];
      const from = anchor.index + anchor[0].length;
      const rest = content.slice(from, anchor.index + NEIGHBOUR_WINDOW);
      const close = new RegExp(
        `,${esc(wrapperLocal)}\\}\\}\\),(${ID})\\)`,
      ).exec(rest);
      if (
        !close ||
        rest.slice(0, close.index).includes(`var ${wrapperLocal}=`)
      ) {
        return {
          error: "the indexing button's insert does not close beside it",
        };
      }
      marker = close[1];
      markerHop = { index: from + close.index, text: close[0] };
    }

    // An icon-button resolves the glyph from its own `icon` prop, so that
    // branch needs no icon component at all. The legacy Button form still
    // passes one as a child, which is why this stays conditional rather than
    // being dropped outright.
    const icon = asIconButton ? undefined : deriveIconComponent(content);
    if (!asIconButton && !icon)
      return { error: "sprite icon component not found" };

    // The caption reads Kilo's catalog only where the catalog still carries
    // the key, which no build since 7.4.17 does, so the accessor is looked up
    // (and reported as a symbol the edit names) only then.
    let i18n;
    let i18nHop;
    if (content.includes('"prompt.action.attachFile":')) {
      const i18nMatches = findAll(
        content,
        `(${ID})\\.t\\("prompt\\.action\\.indexing"\\)`,
      );
      if (i18nMatches.length === 0) return { error: "i18n accessor not found" };
      i18n = i18nMatches[0][1];
      i18nHop = hop(i18nMatches[0]);
    }

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

    // The button declares locals of its own (its wrapper, then the draft's
    // value, caret and the text before the caret), and one sharing a name the
    // button reads would shadow it: `let _v=_v.value` throws on every click.
    // A minifier is free to produce any of these names, so this is checked
    // rather than assumed.
    const declared = [...(wrapped ? ["_a"] : []), "_v", "_s", "_b"];
    const read = [
      insert,
      create,
      tooltip,
      ghost,
      icon?.name,
      i18n,
      wrapperTemplate,
      controller,
      textarea,
      setter,
      sync,
    ];
    if (declared.some((name) => read.includes(name))) {
      return {
        error: "a local the button declares would shadow a name it reads",
      };
    }

    const original = anchors[0][0];
    // Mirror whichever form the neighbours use, prop order included, so the
    // emitted text reads like the code it is spliced into.
    const open = asIconButton
      ? `{icon:"${glyph}",variant:"ghost",size:"small",`
      : `{variant:"ghost",size:"small",`;
    const child = asIconButton
      ? ""
      : `,get children(){return ${create}(${icon.name},{name:"${glyph}",size:"small"})}`;
    const tip =
      `${create}(${tooltip},{get value(){return ${label}},` +
      `placement:"top",get children(){return ${create}(${ghost},${open}` +
      `onClick:()=>{if(!${textarea})return;${textarea}.focus();let _v=${textarea}.value,` +
      `_s=${textarea}.selectionStart??_v.length,_b=_v.substring(0,_s);` +
      `document.execCommand("insertText",!1,(_b&&!/\\s$/.test(_b)?" ":"")+"@");` +
      `${controller}.selectMention({type:"file-picker"},${textarea},${setter},${sync})},` +
      `get"aria-label"(){return ${label}}${child}})}})`;
    // The wrapped form builds its wrapper from the template Kilo builds each
    // action's from, and never marks it folded. Kilo's fold arithmetic counts
    // only its own actions, so the button stays in view and takes its slot
    // from the selectors beside the toolbar, as it did before the toolbar
    // could fold.
    const button = wrapped
      ? `${insert}(${container},(()=>{var _a=${wrapperTemplate}();` +
        `return ${insert}(_a,${tip}),_a})(),${marker}),`
      : `${insert}(${container},${tip},null),`;

    return {
      original,
      patched: button + original,
      // Every name the edit binds in the bundle's scope. The glyph is not one
      // (it is a key the sprite map declares, written as a string), so it is
      // reported as data instead.
      symbols: {
        insert,
        container,
        create,
        tooltip,
        ...(wrapped ? { wrapper: wrapperTemplate, marker } : {}),
        ghost,
        ...(icon ? { icon: icon.name } : {}),
        ...(i18n ? { i18n } : {}),
        controller,
        textarea,
        setter,
        sync,
      },
      data: { glyph },
      hops: [
        hop(mention),
        { index: mention.index + ref.index, text: ref[0] },
        hop(neighbour),
        ...(markerHop ? [markerHop] : []),
        ...(icon ? [icon.hop] : []),
        ...(i18nHop ? [i18nHop] : []),
      ],
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

// The DOM names the raw-markdown toggle reaches through, and the templates
// that spell them. Kilo builds both from a single template literal each, so
// one presence check pins a name and its nesting at once. The injected button
// walks the DOM rather than closing over the body element, which keeps the
// derivation to one symbol from outside the matched span, but it also means a
// renamed template would leave the splice deriving, applying and parsing while
// the button found nothing to toggle. That is the 7.6.2 failure mode (a rule
// that still reported covered while doing the wrong thing), so the names are
// asserted here rather than assumed.
const RAW_MARKDOWN_TEMPLATES = {
  "text-part": "<div data-component=text-part><div data-slot=text-part-body>",
  markdown: "<div data-component=markdown dir=auto>",
};

// The caption. Kilo's catalog has no key for this (its `ui.message.*` keys
// cover copy, feedback and the expand/collapse pair only), and t() falls back
// to String(key) for a missing one, so a localized call would render the key
// itself. An English literal is what the attach button settled on for the same
// reason.
const RAW_MARKDOWN_LABEL = "Markdown source";

// The opt-in raw-markdown toggle adds a button to the footer Kilo already puts
// under the last text part of an assistant turn (`assistant-copy-wrapper`:
// copy, the two feedback buttons, then the throughput readout). Like the
// attach button it is an insertion rather than a rewrite, so it lives outside
// PATCHES, in RAW_MARKDOWN_TOGGLES.
//
// The anchor is Kilo's own copy button in that footer, which is the right span
// for three reasons. It pins every symbol the injected button renders with
// (the insert, the footer element, createComponent, the tooltip and the
// icon-button), it is keyed on two i18n keys the minifier cannot touch, and it
// is the neighbour the new button has to look like, so there is no unbounded
// "first button after the anchor" search of the kind that drifted into the
// permission dialog in 7.6.2.
//
// One symbol still comes from outside it: the accessor for the part's raw
// text. The copy handler is the only place that reads it, and the anchor
// captures that handler by name, so the second hop is pinned to this component
// rather than matched loose across the bundle. That hop is also held to where
// the handler actually sits, in the same component's `let` chain a few KB
// before the footer, which is what lets the extension derive this rule at
// apply rather than wait for a reviewed entry.
//
// Measured at 2870 bytes on every build from 7.5.0 through 7.8.1 (829 on
// 7.4.17), so this leaves the component room to grow.
const COPY_HANDLER_WINDOW = 8192;

// Kilo's own glyph for the button. Its sprite injector emits a symbol for every
// entry in the map whether or not Kilo references it, so the map declaring the
// name is what makes the icon render.
const RAW_MARKDOWN_GLYPH = "code-lines";

const RAW_MARKDOWN_RULE = {
  key: "raw-markdown",
  file: "webview.js",
  derive(content) {
    const anchors = findAll(
      content,
      `(${ID})\\((${ID}),(${ID})\\((${ID}),\\{get value\\(\\)\\{return ` +
        `(${ID})\\(\\(\\)=>!!(${ID})\\(\\)\\)\\(\\)\\?` +
        `(${ID})\\.t\\("ui\\.message\\.copied"\\):\\7\\.t\\("ui\\.message\\.copyResponse"\\)\\}` +
        `,placement:"top",gutter:4,get children\\(\\)\\{return \\3\\((${ID}),\\{` +
        `get icon\\(\\)\\{return \\6\\(\\)\\?"check":"copy"\\}` +
        `,size:"normal",variant:"ghost",onMouseDown:(${ID})=>\\9\\.preventDefault\\(\\),onClick:(${ID})` +
        `,get"aria-label"\\(\\)\\{return \\5\\(\\(\\)=>!!\\6\\(\\)\\)\\(\\)\\?` +
        `\\7\\.t\\("ui\\.message\\.copied"\\):\\7\\.t\\("ui\\.message\\.copyResponse"\\)\\}\\}\\)\\}\\}\\),null\\)`,
    );
    if (anchors.length !== 1) return { matches: anchors.length };
    const anchor = anchors[0];
    const [, insert, container, create, tooltip, , , , button, , copy] = anchor;

    // Kilo's copy handler is `<copy>=async()=>{let v=<raw>();v&&(await
    // <clipboard>.write(v),...)}`, so the accessor it reads is the part's raw
    // markdown: exactly what Copy puts on the clipboard, which is the text
    // this button should show. Anchored on the handler name the footer already
    // gave us, so this cannot match some other component's copy handler. The
    // lookbehind is not `\b`, which reads `$` as a boundary and so would let a
    // handler spelled `$f` answer for `f`.
    const handlers = findAll(
      content,
      `(?<![\\w$.])${esc(copy)}=async\\(\\)=>\\{let (${ID})=(${ID})\\(\\);\\1&&\\(await (${ID})\\.write\\(\\1\\),`,
    );
    if (handlers.length !== 1)
      return { error: "the footer's copy handler is not unique" };
    const handler = handlers[0];
    const raw = handler[2];
    // The handler has to be this footer's: declared before it, close by, and
    // in the same function body, so the accessor it reads is bound where the
    // toggle is spliced.
    const gap = anchor.index - handler.index;
    if (gap <= 0 || gap > COPY_HANDLER_WINDOW) {
      return { error: "the copy handler is not in the footer's component" };
    }
    if (crossesFunction(content.slice(handler.index, anchor.index))) {
      return {
        error: "a function body opens between the copy handler and the footer",
      };
    }

    if (!hasSpriteGlyph(content, RAW_MARKDOWN_GLYPH)) {
      return { error: `no ${RAW_MARKDOWN_GLYPH} glyph in the sprite map` };
    }

    const missing = Object.entries(RAW_MARKDOWN_TEMPLATES)
      .filter(([, literal]) => !content.includes(literal))
      .map(([name]) => name);
    if (missing.length > 0) {
      return {
        error: `the ${missing.join(" and ")} template(s) no longer spell the DOM this patch selects on`,
      };
    }

    // Three things the toggle deliberately does not do. It does not hold Solid
    // state: a signal would have to be spliced into the component's `let`
    // chain, a third edit far from this one, where an attribute on the
    // text-part carries the same one bit and the stylesheet reads it. It does
    // not keep the raw block around: rebuilding it per toggle re-reads the
    // accessor, so a part that grew while the view was closed shows its
    // current text. And it writes nothing Solid also writes, so there is
    // nothing for a re-render to fight: the attribute is on an element Solid
    // sets no attributes on, and the block is a child Solid's insert appended
    // once and never tracks.
    const toggle =
      `${insert}(${container},${create}(${tooltip},{value:"${RAW_MARKDOWN_LABEL}",placement:"top",gutter:4,` +
      `get children(){return ${create}(${button},{icon:"${RAW_MARKDOWN_GLYPH}",size:"normal",variant:"ghost",` +
      `"data-slot":"kbp-raw-markdown-toggle","aria-label":"${RAW_MARKDOWN_LABEL}","aria-pressed":"false",` +
      `onMouseDown:_e=>_e.preventDefault(),onClick:_e=>{let _btn=_e.currentTarget,` +
      `_part=_btn.closest("[data-component=text-part]"),` +
      `_body=_part&&_part.querySelector("[data-slot=text-part-body]");if(!_body)return;` +
      `let _pre=_body.querySelector("pre[data-slot=kbp-raw-markdown]");` +
      `if(_pre){_pre.remove(),_part.removeAttribute("data-kbp-raw-markdown"),` +
      `_btn.setAttribute("aria-pressed","false");return}` +
      `_pre=document.createElement("pre"),_pre.setAttribute("data-slot","kbp-raw-markdown"),` +
      `_pre.textContent=${raw}(),_body.appendChild(_pre),` +
      `_part.setAttribute("data-kbp-raw-markdown",""),_btn.setAttribute("aria-pressed","true")}})}}),null)`;

    const original = anchor[0];
    return {
      // Appended after the copy button rather than before it, so the two text
      // actions sit together at the head of the row and the feedback buttons
      // and the throughput readout keep their order.
      original,
      patched: `${original},${toggle}`,
      symbols: { insert, container, create, tooltip, button, copy, raw },
      data: { glyph: RAW_MARKDOWN_GLYPH },
      hops: [hop(handler)],
    };
  },
};

module.exports = {
  ATTACH_RULE,
  mathExtensions,
  MATH_RULE,
  RAW_MARKDOWN_RULE,
};
