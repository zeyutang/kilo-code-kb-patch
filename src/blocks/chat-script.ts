// The blocks appended to webview.js: the chat-scroll re-pin script and the
// hover guard.

import path = require("path");
import type { FeatureState } from "../core/features";
import {
  CHAT_SCRIPT_BLOCKS,
  CHAT_SCRIPT_CORE,
  CHAT_SCRIPT_FILE,
  blockCoreStatus,
  patchBlock,
  reconcileBlocks,
  stripChatScript,
} from "./machinery";
import type { ChatScriptBlockKey } from "./machinery";

// --- chat-scroll, the script half --------------------------------------------
// With the textarea engine-sized, Kilo's measurement no longer moves anything,
// but the browser lays some edits out part-way through on its own. A backspace
// that empties the last line of a draft leaves the text ending in a newline,
// and the editing command forces a layout before it puts back the placeholder
// break that renders that empty line, so that layout sees the textarea one
// line shorter. The scroller grows by that line in the same layout, its
// maximum scrollTop drops, and the browser clamps the position. The final
// layout is then identical to the one before the keystroke, so neither of
// Kilo's ResizeObservers fires, and the history sits one line short until the
// line count next changes (reported on 7.5.16 with the 1.22.1 rule applied:
// two lines, Enter, a character typed, deleted and typed again, and the
// history 21px short from the deletion on).
//
// So this block records, before each edit of the chat textarea, whether the
// history was at the bottom, within Kilo's own threshold (read out of the
// bundle so the two agree), and after the edit puts it back there. It listens
// on window: beforeinput in the capture phase, which runs before any of Kilo's
// handlers and before the browser touches the DOM, and input in the bubble
// phase, which runs after Solid's document-level delegate has run Kilo's own
// input handler and its measurement, so on an engine without field-sizing it
// covers Kilo's collapse as well. Kilo registers no beforeinput handler and
// stops no input event. The scroll it makes lands within the threshold, which
// the controller's scroll handler treats as benign on every build checked, so
// Kilo's userScrolled state is untouched: a history the user scrolled away
// from is never moved, since it was not at the bottom before the edit. Nothing
// is prevented or stopped, and no other textarea qualifies: the target must be
// textarea.prompt-input inside .chat-view, and the list is found from there.
//
// Verified in the same headless Chromium, driven with real key events: with
// the stylesheet rule alone the backspace that empties the third line leaves
// the history 21px short at a 15px base font; with this block the distance is
// 0 after every keystroke, with or without the rule.
//
// What the block assumes about Kilo, matched to decide whether it is written
// at all: the three class names it reaches the DOM through, each in exactly
// one template, and the controller's default threshold. A build that renamed
// or duplicated any reads as "missing" in the status view and keeps stock
// behavior, rather than carrying a script that finds nothing. Exported to the
// harness, whose probe asserts the same on every pristine build.
export const CHAT_SCROLL_SCRIPT_ANCHORS: Record<string, RegExp> = {
  "message-list template": /<div class=message-list[ >]/,
  "chat-view template": /class=chat-view[ >]/,
  "prompt-input template": /<textarea class=prompt-input /,
  "bottom threshold": /bottomThreshold\?\?(\d+)/,
};

// Whether every anchor matches exactly once, which is what makes a value read
// through one a fact about this build rather than a guess.
function anchorsEachOnce(js: string, anchors: Record<string, RegExp>): boolean {
  return Object.values(anchors).every(
    (re) => (js.match(new RegExp(re.source, "g")) ?? []).length === 1,
  );
}

// Kilo's own "at the bottom" distance in px, or undefined when any anchor is
// missing or ambiguous.
export function readScrollThreshold(js: string): number | undefined {
  if (!anchorsEachOnce(js, CHAT_SCROLL_SCRIPT_ANCHORS)) return undefined;
  const threshold = Number(
    CHAT_SCROLL_SCRIPT_ANCHORS["bottom threshold"].exec(js)?.[1],
  );
  return Number.isInteger(threshold) ? threshold : undefined;
}

// The block's body. Plain source rather than minified, since it is read in
// place by anyone who opens the bundle to see what changed.
export function chatScrollScript(threshold: number): string {
  return [
    "(() => {",
    "  // Kilo Code KB Patch: keep the chat history at the bottom across an edit",
    "  // of the chat box, which the browser can lay out part-way through and",
    "  // clamp the history's scroller on. Before the edit, note whether the",
    "  // history was at the bottom; after it, put it back there.",
    "  const listOf = (e) => {",
    "    const t = e.target;",
    '    return t instanceof HTMLTextAreaElement && t.matches("textarea.prompt-input")',
    '      ? t.closest(".chat-view")?.querySelector(".message-list") ?? null',
    "      : null;",
    "  };",
    "  let pinned = null;",
    '  window.addEventListener("beforeinput", (e) => {',
    "    const list = listOf(e);",
    `    pinned = list && list.scrollHeight - list.clientHeight - list.scrollTop < ${threshold} ? list : null;`,
    "  }, true);",
    '  window.addEventListener("input", (e) => {',
    "    const list = pinned;",
    "    pinned = null;",
    "    if (list && list === listOf(e)) list.scrollTop = list.scrollHeight;",
    "  });",
    "})();",
  ].join("\n");
}

// --- hover-guard, a script block ---------------------------------------------
// While you type, macOS hides the mouse cursor: Chromium's Cocoa view hides it
// on every key down without Command while a text field has focus, until the
// mouse moves. The renderer is never told (the page's cursor-visible flag is
// only ever fed on Windows and Linux), so after every layout it still
// re-hovers whatever now sits under the pointer's last known position, sending
// pointerover, pointerenter, mouseover and mouseenter to it (and the out and
// leave side to what it left), at the old coordinates and with no move event.
// Kilo's menus and tooltips act on exactly those: the @-mention and slash
// menus highlight a row on mouseenter, so a row the opening menu puts under
// the hidden pointer becomes the selection Enter picks, and every tooltip
// trigger opens on pointerenter, so a button that a growing chat box pushes
// under the pointer shows its tooltip (reported on 7.5.16 with "New Worktree").
//
// So this block notes, on each key down that hides the cursor (the Cocoa
// view's own rule: a trusted key down in the chat textarea, not a bare
// modifier, without Command), that the cursor is hidden, and while it is,
// stops the enter events that sit exactly where the previous event of their
// kind did, in the capture phase on window, ahead of every handler of Kilo's,
// Solid's document-level delegate included. Any pointer or mouse event from a
// new position means the mouse moved and the cursor is back, and passes. Out
// and leave events are never stopped: they only ever close something. Pointer
// and mouse events round their coordinates differently (a pointer event keeps
// the fraction a mouse event truncates), so each family is compared with its
// own predecessor rather than with a shared position. Nothing is prevented,
// the engine's :hover state is untouched (no script can stop it, so a button
// under the hidden pointer keeps its hover color), and no Kilo symbol is
// involved.
//
// Verified in the same headless Chromium, driven with real key and mouse
// events: with the pointer parked above the session actions row, the third
// Enter moved "New Worktree" under it and stock fired pointerenter on the
// button; typing "@" then opened the menu with its fifth row under the pointer
// and stock fired mouseenter on that row, making it the selection. With this
// block both are stopped and the top row stays selected; a real move onto
// another row while the cursor is hidden still selects that row (its enter
// events carry new coordinates), and re-opening the menu under the still
// pointer is stopped again.
//
// What the block assumes about Kilo: the two class names it reaches the chat
// textarea through, each in exactly one template, shared with the chat-scroll
// script. A build that renamed either reads as "missing" in the status view
// and keeps stock behavior.
export const HOVER_GUARD_ANCHORS: Record<string, RegExp> = {
  "chat-view template": CHAT_SCROLL_SCRIPT_ANCHORS["chat-view template"],
  "prompt-input template": CHAT_SCROLL_SCRIPT_ANCHORS["prompt-input template"],
};

export function hoverGuardAnchorsPresent(js: string): boolean {
  return anchorsEachOnce(js, HOVER_GUARD_ANCHORS);
}

// The block's body, plain source like the chat-scroll script's.
export function hoverGuardScript(): string {
  return [
    "(() => {",
    "  // Kilo Code KB Patch: while you type, macOS hides the mouse cursor, but the",
    "  // page is never told, and the browser keeps re-hovering whatever a layout",
    "  // change moves under the pointer's last position: a menu row highlights, a",
    "  // tooltip opens. Those updates arrive as enter events at the pointer's old",
    "  // coordinates, with no move event, so while the cursor is hidden they are",
    "  // stopped before any handler sees them. The first event from a new",
    "  // position means the mouse moved and the cursor is back.",
    '  const MODIFIERS = new Set(["Alt", "AltGraph", "CapsLock", "Control", "Fn", "FnLock", "Hyper", "Meta", "NumLock", "ScrollLock", "Shift", "Super", "Symbol", "SymbolLock"]);',
    '  const ENTER = ["pointerover", "pointerenter", "mouseover", "mouseenter"];',
    '  const OTHER = ["pointermove", "mousemove", "pointerout", "pointerleave", "mouseout", "mouseleave", "pointerdown", "mousedown", "pointerup", "mouseup"];',
    "  const last = { pointer: null, mouse: null };",
    "  let hidden = false;",
    "  // Pointer and mouse events round their coordinates differently, so each",
    "  // family is compared with its own last event.",
    "  const still = (e) => {",
    '    const kind = e.type.startsWith("pointer") ? "pointer" : "mouse";',
    "    const prev = last[kind];",
    "    last[kind] = [e.screenX, e.screenY];",
    "    if (prev && prev[0] === e.screenX && prev[1] === e.screenY) return true;",
    "    hidden = false;",
    "    return false;",
    "  };",
    '  window.addEventListener("keydown", (e) => {',
    "    if (!e.isTrusted || e.metaKey || MODIFIERS.has(e.key)) return;",
    "    const t = e.target;",
    '    if (t instanceof HTMLTextAreaElement && t.matches("textarea.prompt-input") && t.closest(".chat-view")) hidden = true;',
    "  }, true);",
    "  for (const type of ENTER) {",
    "    window.addEventListener(type, (e) => {",
    "      if (e.isTrusted && still(e) && hidden) e.stopImmediatePropagation();",
    "    }, true);",
    "  }",
    "  for (const type of OTHER) {",
    "    window.addEventListener(type, (e) => {",
    "      if (e.isTrusted) still(e);",
    "    }, true);",
    "  }",
    "})();",
  ].join("\n");
}

// The block for one key, or "" when this build does not look the way the
// script assumes, which leaves the bundle byte-identical to Kilo's.
export function chatScriptBlock(
  key: ChatScriptBlockKey,
  pristineJs: string,
): string {
  if (key === "hover-guard") {
    return hoverGuardAnchorsPresent(pristineJs)
      ? patchBlock(key, hoverGuardScript())
      : "";
  }
  const threshold = readScrollThreshold(pristineJs);
  return threshold === undefined
    ? ""
    : patchBlock(key, chatScrollScript(threshold));
}

// Write (Apply) or remove (Restore) the core script blocks. Nothing else has a
// say on this file's blocks: the bundle's bonuses are splices elsewhere in it,
// and a splice neither sees nor moves an appended block.
export function reconcileChatScript(
  extPath: string,
  on: boolean,
): Record<ChatScriptBlockKey, boolean> {
  return reconcileBlocks(
    path.join(extPath, "dist", CHAT_SCRIPT_FILE),
    CHAT_SCRIPT_BLOCKS,
    (key, pristine) => (on ? chatScriptBlock(key, pristine) : ""),
  );
}

// The bundle's core block rows for the status view, listed with its splices.
export function chatScriptCoreStatus(
  js: string,
): { label: string; state: FeatureState }[] {
  return blockCoreStatus(
    js,
    CHAT_SCRIPT_CORE,
    stripChatScript,
    chatScriptBlock,
  );
}
