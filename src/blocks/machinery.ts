// Appended blocks: their markers, the rewrite and strip of a file's blocks,
// and the status rows and command results of the core ones.

import fs = require("fs");
import { FEATURE_GATES, FEATURE_LABELS } from "../core/features";
import type { FeatureKey, FeatureState } from "../core/features";
import type { PatchResult } from "../core/splice";

// --- Appended blocks ---------------------------------------------------------
// Two core patches and two bonuses are applied by appending a delimited block
// to one of Kilo's own dist/ files instead of splicing into a bundle's code. That
// buys what a splice cannot: no minified identifier is involved, so nothing
// here needs re-targeting on a re-minify, and removal is exact, since an append
// is reversed by deleting the block. A block's markers are CSS comments, which
// are JS comments too, so the same machinery serves both files.
//
//   chat-scroll  core, two blocks: a stylesheet rule that hands the chat
//                textarea's sizing to the engine instead of Kilo's
//                measure-then-set script, and a script that re-pins the chat
//                history after an edit the browser laid out mid-way through
//                (see CHAT_SCROLL_RULE and chatScrollScript). Together they
//                keep the history at the bottom while typing. Apply Patches
//                writes them, Restore Originals removes them, and each feeds
//                the verdict like a keyboard patch.
//   math-clip    core, webview.css: one declaration that makes each rendered
//                formula clip its own out-of-flow MathML twin, so the twins
//                stop extending the chat scroller past its content (see
//                MATH_CLIP_RULE). Applied and removed with chat-scroll, and
//                not written where KaTeX already declares it, which Kilo's
//                chat does from 7.8.7 on (see katexContainsTwin).
//   hover-guard  core, webview.js: while the cursor macOS hid for typing stays
//                hidden, the enter events the engine synthesizes for a layout
//                change under the pointer are stopped, so a menu row or a
//                tooltip that lands there no longer reacts (see
//                hoverGuardScript). Applied and removed with chat-scroll.
//   typography   bonus, webview.css: the agent's reply is scaled, its headings
//                laddered, and it is optionally re-fonted
//   math         bonus, webview.css: rendered math is sized, which is part of
//                the math-rendering bonus rather than a knob of its own: the
//                size is meaningless when that bonus is off, so this block is
//                written only while it is on
//   raw-markdown bonus, webview.css: the half of the raw-markdown toggle that
//                needs no minified symbol, hiding the rendered reply while the
//                toggle's attribute is set and styling the raw block the
//                toggle appends. Part of that bonus rather than a knob of its
//                own, so it is written only while the splice is asked for
//
// Each patch owns its own block, so a change can be attributed to the patch it
// belongs to without inferring anything from the rules themselves.
//
// The values the typography block multiplies are read out of Kilo's stylesheet
// rather than hardcoded. Scaling only the markdown container would leave
// headings and tables behind, because Kilo declares those with sizes of their
// own, and a heading that keeps its own size while body text grows ends up
// *smaller* than the paragraph around it. Tables are handled by reading that
// declaration and re-declaring it multiplied. Headings are handled the other
// way, by restating them in `em` (see HEADING_LADDER): their `em` resolves
// against the container this block has already scaled, so one rule carries both
// the text multiplier and the heading ladder, and Kilo's own heading
// declaration never has to be read.
//
// Monospace content is what deliberately does *not* scale, and it needs rules
// for the opposite reason, because Kilo gives it no size of its own to hold it
// back: a fenced block's size lives on `.shiki`, which it only gains once the
// highlighter has run, and inline `code` and `a.file-path-link` declare a
// family and nothing else. So `pre` is pinned to Kilo's `.shiki` size (which
// also keeps a streaming block from resizing under the reader) and the two
// inline forms to its base size. "Keeps its own size" means Kilo's size, which
// still follows Kilo's own Display setting: these pins hold the em multiplier
// off, not that setting.
//
// A build that renamed or restructured those declarations reads as
// "unavailable" in the status view rather than producing a wrong size.
export const CHAT_STYLE_FILE = "webview.css";
export const CHAT_SCRIPT_FILE = "webview.js";

// One block per patch and file, in the order they are appended: the core
// patches first, keyed by their FEATURE_ORDER names, then the bonuses.
export const CHAT_CSS_BLOCKS = [
  "chat-scroll",
  "math-clip",
  "typography",
  "math",
  "raw-markdown",
] as const;
export type ChatCssBlockKey = (typeof CHAT_CSS_BLOCKS)[number];
export const CHAT_SCRIPT_BLOCKS = ["chat-scroll", "hover-guard"] as const;
export type ChatScriptBlockKey = (typeof CHAT_SCRIPT_BLOCKS)[number];
// The derived-pattern record (see readDerivedRecord) is a block too, so that
// stripping it is the same operation as stripping the others, but it is not a
// feature: nothing reconciles it and it never appears in the status view.
export const DERIVED_BLOCK = "derived" as const;

type PatchBlockKey = ChatCssBlockKey | ChatScriptBlockKey | "derived";

// The core blocks: written by Apply, removed by Restore, listed in the status
// view under their file and counted in the verdict. Typed against both lists,
// so a key that is not registered as a feature (or not a block) is a compile
// error rather than a row that never renders.
export const CHAT_CSS_CORE = [
  "chat-scroll",
  "math-clip",
] as const satisfies readonly (ChatCssBlockKey & FeatureKey)[];
export type ChatCssCoreKey = (typeof CHAT_CSS_CORE)[number];
export const CHAT_SCRIPT_CORE = [
  "chat-scroll",
  "hover-guard",
] as const satisfies readonly (ChatScriptBlockKey & FeatureKey)[];

export function isChatCssCore(key: ChatCssBlockKey): key is ChatCssCoreKey {
  return (CHAT_CSS_CORE as readonly ChatCssBlockKey[]).includes(key);
}

const patchBlockBegin = (key: PatchBlockKey) =>
  `/* kilo-code-kb-patch:${key}:begin */`;
const patchBlockEnd = (key: PatchBlockKey) =>
  `/* kilo-code-kb-patch:${key}:end */`;

// One block, with the newlines around it, so extracting it and stripping it are
// the same span. Built per key rather than shared, since the blocks sit next to
// each other and a key-agnostic pattern could pair one block's begin with
// another's end.
export function patchBlockRe(key: PatchBlockKey): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\n?${esc(patchBlockBegin(key))}[\\s\\S]*?${esc(patchBlockEnd(key))}\\n?`,
  );
}

// A block's full text from its body: the markers on their own lines, and a
// newline on each side so the append lands on a line of its own whatever the
// file ends with.
export function patchBlock(key: PatchBlockKey, body: string): string {
  return `\n${patchBlockBegin(key)}\n${body}\n${patchBlockEnd(key)}\n`;
}

// Strip every block this extension has ever appended to a file, which is what
// returns it to the bytes Kilo shipped.
function stripBlocks(content: string, keys: readonly PatchBlockKey[]): string {
  let out = content;
  for (const key of keys) out = out.replace(patchBlockRe(key), "");
  return out;
}

export function stripChatCss(css: string): string {
  return stripBlocks(css, CHAT_CSS_BLOCKS);
}

// Every block this extension appends to the bundle, including the record,
// which is what returns the file to the bytes Kilo shipped.
const CHAT_SCRIPT_STRIPPABLE = [...CHAT_SCRIPT_BLOCKS, DERIVED_BLOCK] as const;

export function stripChatScript(js: string): string {
  return stripBlocks(js, CHAT_SCRIPT_STRIPPABLE);
}

// Rewrite one file's appended blocks and report which changed. `desired` gives
// each key's whole block text ("" for none) from the file's pristine bytes and
// the block as currently found, which is what lets a core block be carried over
// untouched by a pass that has no say on it. Every block is stripped first, so
// this is idempotent, self-healing after a Kilo update replaces the file, and
// exact in reverse. Fails safe: a missing file changes nothing.
export function reconcileBlocks<K extends PatchBlockKey>(
  filePath: string,
  keys: readonly K[],
  desired: (key: K, pristine: string, current: string) => string,
): Record<K, boolean> {
  const changed = Object.fromEntries(keys.map((key) => [key, false])) as Record<
    K,
    boolean
  >;
  if (!fs.existsSync(filePath)) return changed;
  const content = fs.readFileSync(filePath, "utf8");
  const pristine = stripBlocks(content, keys);

  let updated = pristine;
  const wanted = {} as Record<K, string>;
  for (const key of keys) {
    const current = patchBlockRe(key).exec(content)?.[0] ?? "";
    wanted[key] = desired(key, pristine, current);
    updated += wanted[key];
  }
  if (updated === content) return changed;

  for (const key of keys) {
    changed[key] = (patchBlockRe(key).exec(content)?.[0] ?? "") !== wanted[key];
  }
  fs.writeFileSync(filePath, updated, "utf8");
  return changed;
}

// A file's core blocks as status rows, in the shape statusForFile gives the
// bundle splices. "missing" means the block's anchors no longer match (this
// build does not look the way the block assumes), "unneeded" that the block is
// not written because its gate says the build already does without it,
// "unpatched" that the block is absent or stale (Apply writes the current
// form), "patched" that the current form is present.
export function blockCoreStatus<K extends PatchBlockKey & FeatureKey>(
  content: string,
  keys: readonly K[],
  strip: (content: string) => string,
  block: (key: K, pristine: string) => string,
): { label: string; state: FeatureState }[] {
  const pristine = strip(content);
  return keys.map((key) => {
    const desired = block(key, pristine);
    const current = patchBlockRe(key).exec(content)?.[0] ?? "";
    const state: FeatureState = !desired
      ? FEATURE_GATES[key]?.(pristine) === false
        ? "unneeded"
        : "missing"
      : current === desired
        ? "patched"
        : "unpatched";
    return { label: FEATURE_LABELS[key], state };
  });
}

// A reconcile pass's effect on a file's core blocks, in the shape the apply and
// restore commands report the bundle splices in.
export function blockResult<K extends PatchBlockKey & FeatureKey>(
  filename: string,
  keys: readonly K[],
  changed: Record<K, boolean>,
  mode: "apply" | "restore",
): PatchResult {
  const moved = keys
    .filter((key) => changed[key])
    .map((key) => FEATURE_LABELS[key]);
  return {
    filename,
    applied: mode === "apply" ? moved : [],
    skipped: [],
    reverted: mode === "restore" ? moved : [],
    noChanges: moved.length === 0,
  };
}
