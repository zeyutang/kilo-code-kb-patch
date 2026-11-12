// The blocks appended to webview.css: the core chat-scroll and math-clip
// rules, and the typography, math-size and raw-markdown bonus rules.

import fs = require("fs");
import path = require("path");
import type { FeatureState } from "../core/features";
import {
  chatFontFamily,
  chatMathRenderingEnabled,
  chatRawMarkdownEnabled,
  clampSetting,
  KATEX_DEFAULT_EM,
} from "../host/settings";
import {
  CHAT_CSS_BLOCKS,
  CHAT_CSS_CORE,
  CHAT_STYLE_FILE,
  blockCoreStatus,
  isChatCssCore,
  patchBlock,
  patchBlockRe,
  reconcileBlocks,
  stripChatCss,
} from "./machinery";
import type { ChatCssBlockKey, ChatCssCoreKey } from "./machinery";

// The agent's rendered reply, and nothing else. Kilo puts a user message under
// [data-component=user-message], its own thinking under
// [data-component=reasoning-part] and tool results under
// [data-component=tool-output], so a text-part scope reaches only the reply.
const CHAT_ASSISTANT_MD =
  '[data-component="text-part"] [data-component="markdown"]';
// Math is sized in em relative to whatever text surrounds it, so that rule is
// chat-wide rather than assistant-only.
const CHAT_ANY_MD = '[data-component="markdown"]';

// Kilo's own declarations, each matched only to read the value it sets. The
// `min-width:0` prefix pins the base markdown rule (the file has 29 other
// [data-component=markdown] selectors).
//
// Kilo's font-family declaration is not among them: the family setting replaces
// that value outright rather than deriving from it, so there is nothing to
// read. Neither is KaTeX's em size, which the math block states absolutely,
// nor the heading size, which is restated in `em` (see HEADING_LADDER).
//
// Kilo declares both the heading size and the code-block size *twice*, once as
// a literal inside `@layer components` (14px, 13px) and once unlayered as
// `var(--font-size-base)`. An anchor matches either one uniquely, but only the
// unlayered declaration renders, and reading the layered one pinned scaled
// headings to 16.1px and code blocks to 13px whatever the reader's Display
// setting. Headings no longer read anything at all; the code anchor is pinned
// to the unlayered declaration by its `[data-component=markdown]{` prefix. Any
// future anchor into this stylesheet has to be checked against the cascade, not
// just against its own match count: unlayered beats layered whatever the
// specificity, so "exactly one match" does not mean "the value that renders".
//
// Exported to the harness, which asserts each anchor still matches exactly
// once against a fresh build (see PROBES in src/rules/probes.js). Duplicating
// them there would let the two drift.
export const CHAT_STYLE_ANCHORS: Record<string, RegExp> = {
  "markdown font-size":
    /\[data-component=markdown\]\{min-width:0;[^{}]*?font-size:([^;{}]+);/,
  "table font-size":
    /table\{width:100%;border-collapse:collapse;margin:24px 0;font-size:([^;{}]+);/,
  "code block font-size":
    /\[data-component=markdown\]\{\.shiki\{font-size:([^;{}]+);/,
  // Read by the harness only: if it stops matching KATEX_DEFAULT_EM, the schema
  // default in package.json is the thing that needs updating.
  "katex em size": /\.katex\{font:\s*([\d.]+)em\s/,
};

// The font sizes Kilo declares inside the assistant markdown: two the
// typography block re-declares multiplied, and the code-block size it re-states
// unchanged. `size` does double duty, since Kilo's base size is also what its
// inline monospace content inherits and therefore what pins it.
interface ChatStyleValues {
  size: string;
  table: string;
  code: string;
}

export function readChatStyleValues(css: string): ChatStyleValues | undefined {
  const size = CHAT_STYLE_ANCHORS["markdown font-size"].exec(css)?.[1];
  const table = CHAT_STYLE_ANCHORS["table font-size"].exec(css)?.[1];
  const code = CHAT_STYLE_ANCHORS["code block font-size"].exec(css)?.[1];
  if (!size || !table || !code) return undefined;
  return { size, table, code };
}

// How much bigger each heading level is than the text around it. Kilo declares
// no ladder at all (`#` through `######` all render at body size, set apart
// only by weight, line-height and spacing), so the whole ladder is ours to
// state. It is part of what this bonus means by typesetting the reply rather
// than a knob of its own, so it rides along with both settings.
//
// Stating the ratios in `em` rather than in a derived absolute size is what
// makes them compose with chatHistoryFontSizeEm for free. A heading's `em`
// resolves against the markdown container, which the size rule has already
// multiplied, so the ratio and the multiplier compose without either one
// knowing about the other, and Kilo's own heading declaration never has to be
// read. Weights are left alone: this is sizes only, and Kilo's heading weight
// carries over.
export const HEADING_LADDER = {
  h1: 1.875,
  h2: 1.3125,
  h3: 1.3125,
  h4: 1.125,
  h5: 1,
  h6: 1,
} as const;

// One rule per distinct ratio, levels in document order, which keeps the block
// short enough to read in the stylesheet and makes the ladder legible as a
// ladder. The levels left at 1 still need their rule: Kilo pins headings to its
// own *unscaled* base size, so with no rule of ours they stay behind scaled
// body text and a `#####` ends up smaller than the paragraph under it.
export function headingRules(): string[] {
  const groups = new Map<number, string[]>();
  for (const [level, ratio] of Object.entries(HEADING_LADDER)) {
    const levels = groups.get(ratio);
    if (levels) levels.push(level);
    else groups.set(ratio, [level]);
  }
  return [...groups].map(([ratio, levels]) => {
    const selector =
      levels.length === 1 ? levels[0] : `:is(${levels.join(", ")})`;
    return `${CHAT_ASSISTANT_MD} ${selector} { font-size: ${ratio}em; }`;
  });
}

// --- chat-scroll, the stylesheet half ----------------------------------------
// Kilo sizes the chat textarea from a script that runs on every input event: it
// sets the height to `auto`, reads `scrollHeight`, then sets the height to that
// (`ln` in 7.5.15, `Jt` in 7.5.9). The read forces a synchronous layout in
// which the textarea has collapsed to one line, and the textarea shares a flex
// column with the chat history's scroller (.message-list), so in that layout
// the scroller is taller by the collapsed lines, its maximum scrollTop is
// smaller by the same amount, and the browser clamps scrollTop down to it.
// Restoring the height does not restore the scroll position, and Kilo's
// stick-to-bottom logic re-pins only from a ResizeObserver on the scroller,
// which reports final sizes: a keystroke that changes the line count re-pins,
// and the next one that does not leaves the history a couple of lines short of
// the bottom. That alternation is the jitter, visible only while idle (while
// streaming the scroll handler re-pins on every scroll event) and only within
// the collapse distance of the bottom.
//
// `field-sizing: content` hands the sizing to the engine. The height Kilo
// writes inline is overridden (`!important`, since an inline style is a normal
// author declaration and Kilo declares no height of its own for the textarea),
// so the measurement layout never differs from the final one and nothing is
// clamped. Kilo's own min-height and max-height keep bounding the box, and the
// script's cap agrees with that max-height (the harness checks it, see PROBES
// in src/rules/probes.js). Guarded by @supports so an engine without
// field-sizing (Chrome before 123) keeps stock behavior rather than getting a
// textarea that cannot grow, and scoped to .chat-view so no other textarea is
// touched. The one visible difference is that the textarea is 2px taller,
// because engine sizing counts the border that scrollHeight omits.
//
// Verified in a headless Chromium on a copy of Kilo's layout: stock ends 40px
// short of the bottom after a backspace inside a three-line draft and stays
// there until the line count changes; with this rule the distance is 0 on
// every keystroke that Kilo's own measurement would have clamped. The edits the
// browser itself lays out part-way through are the script half's job (see
// blocks/chat-script.ts).
export const CHAT_SCROLL_RULE =
  "@supports (field-sizing: content) { .chat-view .prompt-input { field-sizing: content; height: auto !important; } }";

// What the rule assumes about Kilo's stylesheet, matched to decide whether the
// block applies at all: the textarea's own rule still bounds the height both
// ways and forbids the resize handle (an engine-sized height on a box the user
// can drag would fight the drag), and the chat view root the rule is scoped to
// still exists. A build that changed either reads as "missing" in the status
// view and keeps stock behavior, rather than being patched blind.
//
// Exported to the harness, which asserts each anchor matches exactly once and
// cross-checks the max-height against the cap in Kilo's own script.
export const CHAT_SCROLL_ANCHORS: Record<string, RegExp> = {
  "prompt-input sizing":
    /\.prompt-input\{[^{}]*?min-height:([^;{}]+);[^{}]*?max-height:([^;{}]+);[^{}]*?resize:none[^{}]*\}/,
  "chat-view root": /\.chat-view\{/,
};

interface PromptSizing {
  minHeight: string;
  maxHeight: string;
}

export function readPromptSizing(css: string): PromptSizing | undefined {
  const sizing = CHAT_SCROLL_ANCHORS["prompt-input sizing"].exec(css);
  if (!sizing || !CHAT_SCROLL_ANCHORS["chat-view root"].test(css)) {
    return undefined;
  }
  return { minHeight: sizing[1], maxHeight: sizing[2] };
}

// --- math-clip, a core stylesheet block --------------------------------------
// KaTeX renders every formula twice: `.katex-html`, which paints, and
// `.katex-mathml`, an invisible MathML twin kept for screen readers and for
// what a copy yields, hidden the old way (`position: absolute; height: 1px;
// width: 1px; overflow: hidden`, with `clip: rect(1px,1px,1px,1px)` before
// KaTeX 0.16.46 and `clip-path: inset(50%)` from it). Being
// absolutely positioned with no offsets of its own, that twin is laid out at
// its static position but belongs to its containing block, the nearest
// positioned ancestor, which in the chat history is
// `[data-component=tool-part-wrapper] { position: relative }`: inside the
// scroller, and outside the clipped box the formula itself sits in.
//
// A scroll container clips, and absorbs the scrollable overflow of, only those
// descendants for which it is in the containing block chain. So a reasoning
// block's peek box (`[data-slot=reasoning-content] { max-height: 120px;
// overflow-y: auto }`, which declares no position) clips the visible half of
// the math it holds but not the twins: their border boxes join the wrapper's
// scrollable overflow instead, which propagates up to `.message-list`. They
// paint nothing, so the scroller gains scroll range that holds nothing, reaching
// down to the last formula in the reasoning body, and Kilo's stick-to-bottom
// controller parks the history inside it.
//
// Measured on 7.6.2 (reported 2026-09-11): a turn whose reasoning ran to
// 36242px inside the 120px peek left `.message-list` with a scrollHeight of
// 36162 against a content box of 1174px, so about 35000px of the scroller was
// blank. Reproduced in a headless Chromium on a copy of Kilo's layout, where a
// 37185px reasoning body adds 36812px of empty scroll range and this rule takes
// it to 0. The gap is the body's whole height and does not depend on where the
// peek is scrolled, since a twin keeps its static position in the unscrolled
// content (with the peek scrolled to its end, the last formula's twin measured
// 37042px below the formula itself), so what makes the gap dramatic is simply a
// long reasoning stream. Collapsing the block clears it, because `display: none`
// takes the twins out of layout.
//
// `position: relative` moves nothing (the twin declares no offsets) and makes
// each formula the containing block for its own twin, so whatever clips the
// formula now clips the twin too. That covers every clipped surface at once,
// the ones Kilo has today and the ones it adds later, which is why the rule
// sits on the formula rather than on a list of Kilo's scrolling boxes. The
// MathML stays in the tree, which is the point: `display: none` would buy the
// same space by dropping every formula out of the accessibility tree and out of
// what a copy yields. KaTeX's other out-of-flow part, the equation tag,
// resolves to `.katex-html`, which already declares position: relative, so it
// is unaffected, and so is the MathML-only output mode, where the `.katex`
// element is itself the MathML and there is no twin.
//
// KaTeX later shipped the same declaration in its own stylesheet, and a build
// that carries it gets no block (see katexContainsTwin).
export const MATH_CLIP_RULE = `${CHAT_ANY_MD} .katex { position: relative; }`;

// The stylesheet half of the raw-markdown bonus. The splice appends
// `pre[data-slot=kbp-raw-markdown]` inside the text part's body and sets
// `data-kbp-raw-markdown` on the text part itself; these rules are what make
// that swap the rendered reply rather than sit under it, and what make the raw
// text read as source.
//
// Three choices worth stating. The raw block is scoped by its own slot rather
// than by `pre`, so Kilo's fenced code blocks (which are `pre` too, inside the
// markdown container) are untouched. It is styled to Kilo's own code-block
// treatment, border and radius and padding and the mono family at the base
// size, *except* for the background: Kilo's `.shiki` names
// `--color-background-stronger`, a token this stylesheet never defines, so its
// code blocks render border-only and matching them means declaring no
// background either. And it sits outside `[data-component="markdown"]`, so the
// typography bonus's rules do not reach it: source is monospace content and
// keeps Kilo's size, the same line the typography block draws for `pre` and
// inline `code`.
//
// Wrapping rather than scrolling, because the chat lives in a sidebar narrow
// enough that a long line would otherwise be unreachable without a horizontal
// scrollbar per message.
export const RAW_MARKDOWN_RULES = [
  '[data-component="text-part"][data-kbp-raw-markdown]' +
    ' [data-slot="text-part-body"] > [data-component="markdown"] { display: none; }',
  '[data-slot="text-part-body"] > pre[data-slot="kbp-raw-markdown"] {' +
    " margin: 0; padding: 12px; border: 0.5px solid var(--border-weak-base);" +
    " border-radius: 6px; color: var(--text-base);" +
    " font-family: var(--font-family-mono); font-size: var(--font-size-base);" +
    " line-height: 150%; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2; }",
  // Kilo's feedback buttons show their state by swapping to a filled glyph,
  // which the sprite has no counterpart of for this one, so the pressed state
  // borrows the ghost icon-button's own active treatment instead.
  '[data-component="text-part"][data-kbp-raw-markdown]' +
    ' [data-slot="kbp-raw-markdown-toggle"] { background-color: var(--surface-base-active); }',
  '[data-component="text-part"][data-kbp-raw-markdown]' +
    ' [data-slot="kbp-raw-markdown-toggle"] [data-slot="icon-svg"] { color: var(--icon-strong-base); }',
];

// What the rule assumes, matched to decide whether the block is written at all:
// KaTeX still hides the twin by taking it out of flow (without that the rule
// fixes nothing), `.katex` still declares no position of its own (overriding a
// position Kilo relies on would be a different change), and the peek box the
// leak was measured in still looks the way it did. A build that changed any of
// them reads as "missing" in the status view and keeps stock behavior, rather
// than carrying a rule whose reason is gone. The one change with a known
// answer is a `.katex` that declares `position: relative` itself, which is the
// fix already in place, and that build reads as "not needed" instead.
//
// Exported to the harness, whose probe asserts each matches exactly once and
// reports whether Kilo has since made the peek box a containing block of its
// own, which would fix that one surface upstream and leave this rule covering
// the rest. On a build that already carries the fix it reads n/a instead, once
// it has checked that no other rule can take that position back out.
export const MATH_CLIP_ANCHORS: Record<string, RegExp> = {
  "katex mathml twin": /\.katex-mathml\{[^{}]*position:absolute[^{}]*\}/,
  "katex root": /\.katex\{font:[^{}]*\}/,
  "reasoning peek":
    /\[data-slot=reasoning-content\]\{max-height:([^;{}]+);overflow-y:auto[^{}]*\}/,
};

interface MathClip {
  peekMaxHeight: string;
}

export function readMathClip(css: string): MathClip | undefined {
  const peek = MATH_CLIP_ANCHORS["reasoning peek"].exec(css);
  const root = MATH_CLIP_ANCHORS["katex root"].exec(css);
  if (!peek || !root) return undefined;
  if (!MATH_CLIP_ANCHORS["katex mathml twin"].test(css)) return undefined;
  if (/position:/.test(root[0])) return undefined;
  return { peekMaxHeight: peek[1] };
}

// Whether this build's KaTeX already makes each formula the containing block
// for its own twin, with the declaration MATH_CLIP_RULE adds. KaTeX's root rule
// declares `position: relative` from KaTeX 0.16.40 on (KaTeX#4170, which fixes
// KaTeX#2796 and describes the same blank space at the foot of a page), and
// Kilo's chat stylesheet carries it from 7.8.7, which moved to KaTeX 0.19.0.
// 7.8.3 already bundled a 0.16.47 copy in its script, but its chat stylesheet
// came from an older 0.16.27 copy. Measured in a headless Chromium on each
// build's own stylesheet, with 900 formulas in a reasoning peek: stock 7.8.8
// leaves no blank scroll range, and the same stylesheet with only that
// declaration removed leaves the 8557px that stock 7.8.3 does. So the block
// has nothing left to do there, and it is not written and reads as "not
// needed" (see FEATURE_GATES).
//
// A declaration in the file is not yet the value that renders: KaTeX's rules
// sit in `@layer base`, and an unlayered rule outranks them whatever its
// specificity. So this holds only while no rule on `.katex` takes the position
// back out (see KATEX_UNPOSITIONING). A build where one does reads as "missing"
// for a human to judge, and the harness probe widens the same check to every
// selector that could reach a formula's root.
export function katexContainsTwin(css: string): boolean {
  const root = MATH_CLIP_ANCHORS["katex root"].exec(css);
  if (!root || !MATH_CLIP_ANCHORS["katex mathml twin"].test(css)) return false;
  if (!/[{;]position:relative[;}]/.test(root[0])) return false;
  // The declarations of each rule on `.katex` itself, up to any nested rule.
  return ![...css.matchAll(/\.katex\s*\{([^{}]*)/g)].some((m) =>
    KATEX_UNPOSITIONING.test(m[1]),
  );
}

// A declaration that leaves a formula's root unpositioned, which undoes the
// fix wherever it outranks KaTeX's rule: `position` set to a value that
// computes to `static` there, or an `all` reset. Any other position still
// makes the formula the containing block for its twin. Exported to the
// harness, whose probe asks it of every rule that can reach a formula's root.
export const KATEX_UNPOSITIONING =
  /(?:^|;)\s*(?:position\s*:\s*(?:static|initial|unset|revert|revert-layer|inherit)\s*(?:!important\s*)?(?:;|$)|all\s*:)/;

// The rules one block asks for, given the settings and this build's own
// declarations. Empty means the block is not written at all, which is what
// leaves webview.css byte-identical to Kilo's when the core block does not
// apply and both bonuses are off.
export function chatCssRules(
  key: ChatCssBlockKey,
  pristineCss: string,
): string[] {
  if (key === "chat-scroll") {
    return readPromptSizing(pristineCss) ? [CHAT_SCROLL_RULE] : [];
  }
  if (key === "math-clip") {
    return readMathClip(pristineCss) ? [MATH_CLIP_RULE] : [];
  }
  if (key === "math") {
    // Gated on the math bonus as a whole: sizing math the user cannot produce
    // would be a rule with nothing to style.
    if (!chatMathRenderingEnabled()) return [];
    const em = clampSetting("chatMathFontSizeEm");
    if (em === KATEX_DEFAULT_EM) return [];
    return [`${CHAT_ANY_MD} .katex { font-size: ${em}em; }`];
  }
  if (key === "raw-markdown") {
    // Gated on the splice, not on a knob of its own: with no button to press,
    // the attribute these rules key on is never set and the raw block they
    // style is never created.
    return chatRawMarkdownEnabled() ? RAW_MARKDOWN_RULES : [];
  }

  const rules: string[] = [];
  const scale = clampSetting("chatHistoryFontSizeEm");
  const family = chatFontFamily();
  // Either knob puts this block in the file, and the whole size treatment rides
  // along with either one: the ladder is not separately requestable, and a reply
  // whose text is re-fonted but whose headings keep Kilo's flat sizing reads as
  // unfinished. With both knobs neutral nothing is read and the block is not
  // written at all, which is what leaves the stylesheet byte-identical to
  // Kilo's.
  const values =
    scale !== 1 || family !== "" ? readChatStyleValues(pristineCss) : undefined;
  if (values) {
    if (scale !== 1) {
      rules.push(
        `${CHAT_ASSISTANT_MD} { font-size: calc(${values.size} * ${scale}); }`,
        `${CHAT_ASSISTANT_MD} table { font-size: calc(${values.table} * ${scale}); }`,
      );
    }
    rules.push(...headingRules());
    rules.push(
      // Monospace content stays at the size Kilo would have given it. Kilo
      // declares a family for these two and no size, so without a rule they
      // follow the scaled container, and "code is not affected" would hold for
      // fenced blocks but not for the `code` spans and file paths in the middle
      // of a sentence. The inline pins matter to the ladder too, since a `code`
      // span inside a heading would otherwise take the heading's ratio.
      `${CHAT_ASSISTANT_MD} pre { font-size: ${values.code}; }`,
      `${CHAT_ASSISTANT_MD} :not(pre) > code { font-size: ${values.size}; }`,
      `${CHAT_ASSISTANT_MD} a.file-path-link { font-size: ${values.size}; }`,
    );
  }
  if (family) rules.push(`${CHAT_ASSISTANT_MD} { font-family: ${family}; }`);
  return rules;
}

// One block's text, or "" when it asks for no rules. Kilo wraps its own
// component rules in `@layer components`, and an unlayered rule beats a layered
// one whatever the specificity, so appending plain rules at the end of the file
// is enough to win without !important.
export function chatCssBlock(
  key: ChatCssBlockKey,
  pristineCss: string,
): string {
  const rules = chatCssRules(key, pristineCss);
  return rules.length === 0 ? "" : patchBlock(key, rules.join("\n"));
}

// What the core blocks should do in one reconcile pass: true writes the current
// form, false removes the block. Apply Patches and Restore Originals pass one;
// a bonus reconcile passes nothing.
type CoreCssDecision = Record<ChatCssCoreKey, boolean>;

export function coreCssDecision(on: boolean): CoreCssDecision {
  return Object.fromEntries(
    CHAT_CSS_CORE.map((key) => [key, on]),
  ) as CoreCssDecision;
}

// Rewrite the appended blocks in Kilo's stylesheet and report which changed.
// Bonus blocks follow the settings. The core blocks follow `core` when it is
// passed, and are otherwise carried over exactly as found: a bonus reconcile
// (activation, a settings change) must neither apply a core patch without the
// apply prompt nor drop one, and a stale form is left for Apply to rewrite, the
// way a bundle patch's `previous` is.
export function reconcileChatStyle(
  extPath: string,
  core?: CoreCssDecision,
): Record<ChatCssBlockKey, boolean> {
  return reconcileBlocks(
    path.join(extPath, "dist", CHAT_STYLE_FILE),
    CHAT_CSS_BLOCKS,
    (key, pristine, current) =>
      isChatCssCore(key)
        ? core
          ? core[key]
            ? chatCssBlock(key, pristine)
            : ""
          : current
        : chatCssBlock(key, pristine),
  );
}

// The stylesheet's core rows for the status view.
export function chatCssCoreStatus(
  css: string,
): { label: string; state: FeatureState }[] {
  return blockCoreStatus(css, CHAT_CSS_CORE, stripChatCss, chatCssBlock);
}

// Whether the stylesheet already carries exactly what the settings ask for, for
// the status view. "off" is the caller's job: this only distinguishes a file
// that matches from one that has yet to be reloaded.
export function chatCssApplied(extPath: string, key: ChatCssBlockKey): boolean {
  const cssPath = path.join(extPath, "dist", CHAT_STYLE_FILE);
  if (!fs.existsSync(cssPath)) return false;
  const content = fs.readFileSync(cssPath, "utf8");
  const desired = chatCssBlock(key, stripChatCss(content));
  return (patchBlockRe(key).exec(content)?.[0] ?? "") === desired;
}
